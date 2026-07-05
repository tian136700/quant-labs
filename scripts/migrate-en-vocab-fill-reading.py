#!/usr/bin/env python3
"""为 en_vocab_word 中 reading 为空的英语单词补全 IPA 音标（已有读音的不改，可重复执行）。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/"
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 需人工指定的特殊词条（API 查不到或读音不对）
MANUAL_READINGS: dict[str, str] = {}

_IPA_WRAPPED = re.compile(r"^([\[\/])(.+)([\]\/])$")


def normalize_ipa(text: str) -> str | None:
    text = text.strip()
    if not text:
        return None
    m = _IPA_WRAPPED.match(text)
    if not m:
        return None
    open_b, body, close_b = m.group(1), m.group(2).strip(), m.group(3)
    if (open_b, close_b) not in {("/", "/"), ("[", "]")} or not body:
        return None
    return f"/{body}/"
# 长短语 / 句子暂不自动补音标
_SKIP_PHRASE = re.compile(r"^\s*$|[?!;]|\.{2,}")
_MAX_AUTO_READING_CHARS = 48


def analyze_word(word: str) -> tuple[str, str | None]:
    """返回 (查词形, 跳过原因)。"""
    w = word.strip()
    if not w:
        return w, "empty"
    if len(w) > _MAX_AUTO_READING_CHARS or _SKIP_PHRASE.search(w):
        return w, "long_phrase"
    return w, None


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_wrangler(remote: bool, sql: str) -> list:
    cmd = ["npx", "wrangler", "d1", "execute", DB, "--command", sql, "-y"]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "wrangler failed")
    text = proc.stdout.strip()
    start = text.find("[")
    if start >= 0:
        return json.loads(text[start:])
    return []


def fetch_missing(remote: bool) -> list[dict]:
    result = run_wrangler(
        remote,
        "SELECT id, word, kind FROM en_vocab_word "
        "WHERE kind != 'grammar' "
        "AND (reading IS NULL OR TRIM(reading) = '') "
        "ORDER BY id;",
    )
    if isinstance(result, list) and result:
        return result[0].get("results") or []
    return []


def pick_ipa_from_entry(entry: dict) -> str | None:
    phonetic = normalize_ipa(str(entry.get("phonetic") or ""))
    if phonetic:
        return phonetic

    for item in entry.get("phonetics") or []:
        ipa = normalize_ipa(str(item.get("text") or ""))
        if ipa:
            return ipa
    return None


def lookup_dictionary(
    word: str,
    cache: dict[str, str | None],
    delay_sec: float,
) -> str | None:
    key = word.strip().lower()
    if not key:
        return None
    if key in cache:
        return cache[key]

    query = urllib.parse.quote(word.strip())
    req = urllib.request.Request(
        DICT_URL + query,
        headers={"User-Agent": HTTP_USER_AGENT},
    )
    ipa: str | None = None
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        if isinstance(payload, list) and payload:
            ipa = pick_ipa_from_entry(payload[0])
    except urllib.error.HTTPError as err:
        if err.code != 404:
            print(f"  dictionary lookup failed for {word!r}: HTTP {err.code}", flush=True)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        print(f"  dictionary lookup failed for {word!r}: {err}", flush=True)

    cache[key] = ipa
    if delay_sec > 0:
        time.sleep(delay_sec)
    return ipa


def infer_reading(
    word: str,
    *,
    dict_cache: dict[str, str | None],
    dict_delay_sec: float,
) -> tuple[str | None, str | None]:
    """返回 (音标, 跳过原因)。"""
    lookup, skip_reason = analyze_word(word)
    if skip_reason:
        return None, skip_reason

    if word in MANUAL_READINGS:
        return MANUAL_READINGS[word], None
    if lookup in MANUAL_READINGS:
        return MANUAL_READINGS[lookup], None

    parts = [p.strip(".,;:") for p in lookup.split() if p.strip(".,;:")]
    if not parts:
        return None, "empty"

    if len(parts) == 1:
        ipa = lookup_dictionary(parts[0], dict_cache, dict_delay_sec)
        return (ipa, None) if ipa else (None, None)

    full = lookup_dictionary(lookup, dict_cache, dict_delay_sec)
    if full:
        return full, None

    ipas: list[str] = []
    for part in parts:
        ipa = lookup_dictionary(part, dict_cache, dict_delay_sec)
        if not ipa:
            return None, None
        ipas.append(ipa)
    return " ".join(ipas), None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--dict-delay",
        type=float,
        default=0.25,
        help="词典 API 请求间隔（秒），避免触发限流",
    )
    parser.add_argument(
        "--allow-skipped",
        action="store_true",
        help="仍有无法推断的词条时也返回 0（适合 nightly 定时任务）",
    )
    args = parser.parse_args()
    if args.remote == args.local:
        print("请指定 --remote 或 --local", file=sys.stderr)
        return 1

    remote = args.remote
    label = "remote" if remote else "local"
    print(f"[migrate-en-vocab-fill-reading] target={label}", flush=True)

    rows = fetch_missing(remote)
    if not rows:
        print("  无缺失音标的词条", flush=True)
        return 0

    updated = 0
    skipped: list[str] = []
    skipped_long: list[str] = []
    dict_cache: dict[str, str | None] = {}
    for row in rows:
        word_id = int(row["id"])
        word = str(row["word"])
        reading, skip_reason = infer_reading(
            word,
            dict_cache=dict_cache,
            dict_delay_sec=args.dict_delay,
        )
        if skip_reason == "long_phrase":
            skipped_long.append(f"{word_id}:{word!r}")
            continue
        if not reading:
            skipped.append(f"{word_id}:{word!r}")
            continue
        print(f"  {word_id} {word!r} -> {reading!r}", flush=True)
        if args.dry_run:
            updated += 1
            continue
        sql = (
            "UPDATE en_vocab_word SET "
            f"reading = {sql_literal(reading)}, "
            "updated_at = datetime('now') "
            f"WHERE id = {word_id} "
            "AND (reading IS NULL OR TRIM(reading) = '');"
        )
        result = run_wrangler(remote, sql)
        rows_written = 0
        if isinstance(result, list) and result:
            meta = result[0].get("meta") or {}
            rows_written = int(meta.get("rows_written") or 0)
        updated += rows_written

    if skipped_long:
        print(
            f"  长句/短语跳过（暂不补音标）: {', '.join(skipped_long)}",
            flush=True,
        )
    if skipped:
        print(f"  无法推断（需人工补全）: {', '.join(skipped)}", flush=True)
    print(
        f"[migrate-en-vocab-fill-reading] done, "
        f"{'would update' if args.dry_run else 'updated'}: {updated}",
        flush=True,
    )
    if skipped and not args.allow_skipped:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
