#!/usr/bin/env python3
"""为 jp_vocab_word 中 reading 为空的词条补全读音（已有读音的不改，可重复执行）。

Mac nightly 已改为调用 POST /api/jp-vocab/fill-reading（见 jp-vocab-fill-reading-api.py）。
本脚本保留给本地 wrangler D1 调试。
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL_CONTEXT = _ssl_context()

ROOT = Path(__file__).resolve().parents[1]
DB = "strategy-compare-db"
JISHO_URL = "https://jisho.org/api/v1/search/words?keyword="
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# 含汉字或特殊写法，需人工指定（hiragana/katakana 词条由规则自动推断）
MANUAL_READINGS: dict[str, str] = {
    "一つ": "ひとつ",
    "二つ": "ふたつ",
    "始まる": "はじまる",
    "怒る": "おこる",
    "守る": "まもる",
    "悪い": "わるい",
    "無理だ": "むりだ",
    "座る": "すわる",
    "薬局": "やっきょく",
    "暑い": "あつい",
    "見る": "みる",
    "お金": "おかね",
    "事": "こと",
    "大家": "おおや",
    "他/ほか": "ほか",
    "最近": "さいきん",
    "働く": "はたらく",
    "昼ごはん": "ひるごはん",
    "手": "て",
    "鍵屋": "かぎや",
    "綺麗だ": "きれいだ",
    "寝る": "ねる",
    "水道": "すいどう",
    "約束": "やくそく",
    "一部": "いちぶ",
    "悲しい": "かなしい",
    "閉める": "しめる",
    "食事する": "しょくじする",
    "見せる": "みせる",
    "生活": "せいかつ",
    "好き": "すき",
    "好きだ": "すきだ",
}

_KANA_OR_MARK = re.compile(
    r"^[\u3040-\u309F\u30A0-\u30FFー～〜/\s]+$"
)
_HAS_KANJI = re.compile(r"[\u4E00-\u9FFF]")
# 末尾注释括号：大体(数量)、送る(人) — 只查括号外词形
_PARENS_NOTE = re.compile(r"^(.+?)[（(][^）)]+[）)]$")
# 形容动词：便利だ → 查「便利」再补「だ」
_DA_ADJ_SUFFIX = re.compile(r"^(.+)だ$")
# 长短语 / 礼貌句暂不补读音
_SKIP_PHRASE = re.compile(r"(します|ください|てください|お願い)")
_MAX_AUTO_READING_CHARS = 9


def analyze_word(word: str) -> tuple[str, str, str | None]:
    """解析词条，返回 (查词形, 读音后缀, 跳过原因)。"""
    w = word.strip()
    if not w:
        return w, "", "empty"
    if len(w) > _MAX_AUTO_READING_CHARS or _SKIP_PHRASE.search(w):
        return w, "", "long_phrase"

    lookup = w
    m = _PARENS_NOTE.match(w)
    if m:
        lookup = m.group(1).strip()

    suffix = ""
    da_match = _DA_ADJ_SUFFIX.match(lookup)
    if da_match:
        lookup = da_match.group(1).strip()
        suffix = "だ"

    return lookup, suffix, None


def attach_reading_suffix(reading: str, suffix: str) -> str:
    if not suffix:
        return reading
    if reading.endswith(suffix):
        return reading
    return reading + suffix


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
        "SELECT id, word, kind FROM jp_vocab_word "
        "WHERE kind != 'grammar' "
        "AND (reading IS NULL OR TRIM(reading) = '') "
        "ORDER BY id;",
    )
    if isinstance(result, list) and result:
        return result[0].get("results") or []
    return []


def lookup_jisho(
    word: str,
    cache: dict[str, str | None],
    delay_sec: float,
) -> tuple[str | None, bool]:
    if word in cache:
        return cache[word], False

    query = urllib.parse.quote(word.strip())
    req = urllib.request.Request(
        JISHO_URL + query,
        headers={"User-Agent": HTTP_USER_AGENT},
    )
    reading: str | None = None
    had_error = False
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        for item in payload.get("data") or []:
            for jp in item.get("japanese") or []:
                surface = str(jp.get("word") or "").strip()
                kana = str(jp.get("reading") or "").strip()
                if surface == word and kana:
                    reading = kana
                    break
                if not surface and kana == word:
                    reading = kana
                    break
            if reading:
                break
        if not reading:
            for item in payload.get("data") or []:
                for jp in item.get("japanese") or []:
                    surface = str(jp.get("word") or "").strip()
                    kana = str(jp.get("reading") or "").strip()
                    if surface == word:
                        reading = kana or surface
                        break
                    if kana and kana == word:
                        reading = kana
                        break
                if reading:
                    break
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        print(f"  jisho lookup failed for {word!r}: {err}", flush=True)
        had_error = True
        cache[word] = None
        return None, had_error

    cache[word] = reading
    if delay_sec > 0:
        time.sleep(delay_sec)
    return reading, had_error


def infer_reading(
    word: str,
    *,
    use_jisho: bool,
    jisho_cache: dict[str, str | None],
    jisho_delay_sec: float,
) -> tuple[str | None, str | None, bool]:
    """返回 (读音, 跳过原因, jisho是否出错)。跳过原因如 long_phrase 表示故意不补。"""
    lookup, suffix, skip_reason = analyze_word(word)
    if skip_reason:
        return None, skip_reason, False

    if word in MANUAL_READINGS:
        return MANUAL_READINGS[word], None, False
    if lookup in MANUAL_READINGS:
        return attach_reading_suffix(MANUAL_READINGS[lookup], suffix), None, False

    if _KANA_OR_MARK.fullmatch(lookup):
        return attach_reading_suffix(lookup, suffix), None, False

    reading: str | None
    jisho_error = False
    if _HAS_KANJI.search(lookup):
        if use_jisho:
            reading, jisho_error = lookup_jisho(lookup, jisho_cache, jisho_delay_sec)
        else:
            reading = None
    else:
        reading = lookup

    if not reading:
        return None, None, jisho_error
    return attach_reading_suffix(reading, suffix), None, jisho_error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--jisho",
        action="store_true",
        help="含汉字的词条通过 Jisho 词典 API 查读音",
    )
    parser.add_argument(
        "--jisho-delay",
        type=float,
        default=0.35,
        help="Jisho 请求间隔（秒），避免触发限流",
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
    print(f"[migrate-jp-vocab-fill-reading] target={label}", flush=True)
    if args.jisho:
        print("  jisho lookup: enabled", flush=True)

    rows = fetch_missing(remote)
    if not rows:
        print("  无缺失读音的词条", flush=True)
        return 0

    updated = 0
    skipped: list[str] = []
    skipped_long: list[str] = []
    jisho_errors = 0
    jisho_cache: dict[str, str | None] = {}
    for row in rows:
        word_id = int(row["id"])
        word = str(row["word"])
        reading, skip_reason, jisho_error = infer_reading(
            word,
            use_jisho=args.jisho,
            jisho_cache=jisho_cache,
            jisho_delay_sec=args.jisho_delay if args.jisho else 0.0,
        )
        if jisho_error:
            jisho_errors += 1
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
            "UPDATE jp_vocab_word SET "
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
            f"  长句/短语跳过（暂不补读音）: {', '.join(skipped_long)}",
            flush=True,
        )
    if skipped:
        print(f"  无法推断（需人工补全）: {', '.join(skipped)}", flush=True)
    if jisho_errors:
        print(f"  jisho 网络/SSL 失败: {jisho_errors} 次", flush=True)
    print(
        f"[migrate-jp-vocab-fill-reading] done, "
        f"{'would update' if args.dry_run else 'updated'}: {updated}",
        flush=True,
    )
    if jisho_errors:
        return 1
    if skipped and not args.allow_skipped:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
