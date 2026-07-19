#!/usr/bin/env python3
"""补全 en_vocab_word 缺失 IPA：list_missing → dictionaryapi.dev → apply。

音标优先用免费词典 API（比大模型稳）；查不到可用 --llm-fallback 走本机 Ollama。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import (  # noqa: E402
    build_source_label,
    call_api,
    call_ollama,
    load_env_file,
    probe_ollama,
    resolve_ollama_model,
    resolve_token,
)

DEFAULT_API_URL = "https://finance.info-quests.com/api/en-vocab/fill-reading"
DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/"
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
READING_SOURCE_DICT = "dictionaryapi.dev"

_IPA_WRAPPED = re.compile(r"^([\[\/])(.+)([\]\/])$")
_SKIP_PHRASE = re.compile(r"^\s*$|[?!;]|\.{2,}")
_MAX_AUTO_READING_CHARS = 48
MANUAL_READINGS: dict[str, str] = {}


def env_truthy(raw: str | None, *, default: bool = False) -> bool:
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def normalize_ipa(text: str) -> str | None:
    text = text.strip()
    if not text:
        return None
    m = _IPA_WRAPPED.match(text)
    if m:
        open_b, body, close_b = m.group(1), m.group(2).strip(), m.group(3)
        if (open_b, close_b) not in {("/", "/"), ("[", "]")} or not body:
            return None
        return f"/{body}/"
    body = text.strip("/[] ")
    if body and re.search(r"[ˈˌːɑæɒɔəɛɪʊʌθðŋʃʒ]", body):
        return f"/{body}/"
    return None


def analyze_word(word: str) -> tuple[str, str | None]:
    w = word.strip()
    if not w:
        return w, "empty"
    if len(w) > _MAX_AUTO_READING_CHARS or _SKIP_PHRASE.search(w):
        return w, "long_phrase"
    return w, None


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


def llm_ipa(word: str, *, model: str) -> str | None:
    prompt = (
        f"Give the American English IPA pronunciation for the word/phrase:\n"
        f"{word}\n\n"
        "Reply with ONLY one IPA wrapped in slashes, e.g. /həˈloʊ/. "
        "No explanation."
    )
    try:
        raw = call_ollama(prompt, model=model, timeout=90)
    except Exception as err:
        print(f"  ollama IPA failed for {word!r}: {err}", flush=True)
        return None
    first = next((ln.strip() for ln in raw.splitlines() if ln.strip()), "")
    return normalize_ipa(first or raw)


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    cfg_legacy = load_env_file("en-vocab-fill-reading.env")
    parser = argparse.ArgumentParser(description="Fill en_vocab IPA via API + dictionary")
    parser.add_argument(
        "--api-url",
        default=(
            cfg.get("EN_VOCAB_FILL_READING_URL")
            or cfg_legacy.get("EN_VOCAB_FILL_READING_URL")
            or DEFAULT_API_URL
        ),
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_READING_LIMIT") or 40),
    )
    parser.add_argument(
        "--dict-delay",
        type=float,
        default=float(
            cfg.get("EN_VOCAB_FILL_READING_DICT_DELAY")
            or cfg_legacy.get("EN_VOCAB_FILL_READING_DICT_DELAY")
            or "0.25"
        ),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--llm-fallback",
        action=argparse.BooleanOptionalAction,
        default=env_truthy(cfg.get("EN_VOCAB_FILL_READING_LLM_FALLBACK"), default=False),
        help="词典查不到时用本机 Ollama 兜底（默认关）",
    )
    parser.add_argument("--allow-skipped", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )

    scan = call_api(
        args.api_url,
        args.token,
        {"mode": "list_missing", "limit": max(1, args.limit)},
        user_agent="en-vocab-fill-reading/1.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or len(missing))
    print(
        f"[en-vocab-fill-reading] list_missing={len(missing)} total_missing={total}",
        flush=True,
    )
    if not missing:
        print("  无缺失音标", flush=True)
        return 0

    model = resolve_ollama_model()
    llm_source = build_source_label(model)
    llm_fallback = bool(args.llm_fallback)
    if llm_fallback and not probe_ollama():
        print("  [warn] Ollama 不可用，关闭 LLM 兜底", flush=True)
        llm_fallback = False

    cache: dict[str, str | None] = {}
    updates: list[dict] = []
    skipped: list[dict] = []

    for item in missing:
        word_id = int(item.get("id") or 0)
        word = str(item.get("word") or "").strip()
        if word_id <= 0 or not word:
            continue
        lookup, skip_reason = analyze_word(word)
        if skip_reason:
            skipped.append({"id": word_id, "word": word, "reason": skip_reason})
            print(f"  skip {word_id} {word!r} ({skip_reason})", flush=True)
            continue

        source = READING_SOURCE_DICT
        ipa = None
        if word in MANUAL_READINGS:
            ipa = MANUAL_READINGS[word]
            source = "手动"
        elif lookup in MANUAL_READINGS:
            ipa = MANUAL_READINGS[lookup]
            source = "手动"
        else:
            ipa = lookup_dictionary(lookup, cache, args.dict_delay)
            if not ipa and llm_fallback:
                ipa = llm_ipa(lookup, model=model)
                if ipa:
                    source = llm_source

        if not ipa:
            skipped.append({"id": word_id, "word": word, "reason": "not_found"})
            print(f"  miss {word_id} {word!r}", flush=True)
            continue

        print(f"  {word_id} {word!r} -> {ipa} ({source})", flush=True)
        updates.append({"word_id": word_id, "reading": ipa, "source": source})

    if args.dry_run:
        print(
            json.dumps(
                {"ok": True, "dry_run": True, "updates": updates, "skipped": skipped},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if not updates:
        print(f"  无可写回（skipped={len(skipped)}）", flush=True)
        return 0

    apply = call_api(
        args.api_url,
        args.token,
        {"mode": "apply", "updates": updates},
        user_agent="en-vocab-fill-reading/1.0",
    )
    print(
        f"[en-vocab-fill-reading] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
