#!/usr/bin/env python3
"""补全 en_vocab_word 缺失 IPA：list_missing → 本机 Ollama（默认 gemma4:26b）→ apply。

不再调用线上词典（本机 SSL 易失败）；一律本机大模型。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from en_vocab_fill_common import (  # noqa: E402
    build_source_label,
    call_api,
    call_ollama,
    is_ollama_timeout_error,
    load_env_file,
    probe_ollama,
    resolve_ollama_model,
    resolve_ollama_model_chain,
    resolve_token,
)

DEFAULT_API_URL = "https://finance.info-quests.com/api/en-vocab/fill-reading"

_IPA_WRAPPED = re.compile(r"^([\[\/])(.+)([\]\/])$")
_SKIP_PHRASE = re.compile(r"^\s*$|[?!;]|\.{2,}")
_MAX_AUTO_READING_CHARS = 48
# 一行里抽 /…/ 或 […]
_IPA_FIND = re.compile(r"[/\[\]]([^/\\[\]]{1,60})[/\[\]]")
MANUAL_READINGS: dict[str, str] = {}


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
    found = _IPA_FIND.search(text)
    if found:
        body = found.group(1).strip()
        if body:
            return f"/{body}/"
    body = text.strip("/[] ")
    if body and re.search(r"[a-zɑæɒɔəɛɪʊʌθðŋʃʒˈˌː]", body, re.I):
        # 模型偶发无斜杠，但仍像 IPA
        if " " not in body or re.search(r"[ˈˌːəɪʊʌʃʒθðŋ]", body):
            return f"/{body}/"
    return None


def analyze_word(word: str) -> tuple[str, str | None]:
    w = word.strip()
    if not w:
        return w, "empty"
    if len(w) > _MAX_AUTO_READING_CHARS or _SKIP_PHRASE.search(w):
        return w, "long_phrase"
    return w, None


def llm_ipa(word: str, *, model: str, retries: int) -> tuple[str | None, str | None, str]:
    """返回 (ipa, error, model_used)。"""
    prompt = (
        f"American English IPA for: {word}\n"
        "Reply with ONLY one transcription in slashes, e.g. /həˈloʊ/\n"
        "No explanation, no quotes."
    )
    base_prompt = prompt
    chain = resolve_ollama_model_chain(model)
    last_err = "unknown"
    last_model = chain[0]
    for mi, use_model in enumerate(chain):
        last_model = use_model
        work_prompt = base_prompt
        if mi > 0:
            print(
                f"[en-vocab-fill-reading] fallback → {use_model} (prev={last_err})",
                flush=True,
            )
        for attempt in range(max(1, retries)):
            try:
                raw = call_ollama(work_prompt, model=use_model)
                first = next((ln.strip() for ln in raw.splitlines() if ln.strip()), "")
                ipa = normalize_ipa(first or raw)
                if ipa:
                    return ipa, None, use_model
                last_err = "invalid_ipa"
                work_prompt = (
                    f"Previous output invalid. For the English word/phrase «{word}», "
                    "output ONLY IPA like /ˈwɝːd/. Nothing else."
                )
            except Exception as err:
                last_err = str(err)
                if is_ollama_timeout_error(err) and mi + 1 < len(chain):
                    break
                if attempt + 1 >= retries:
                    if mi + 1 < len(chain):
                        break
                    return None, last_err, last_model
                time.sleep(1.0)
        else:
            if mi + 1 < len(chain):
                continue
            return None, last_err, last_model
    return None, last_err, last_model


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    cfg_legacy = load_env_file("en-vocab-fill-reading.env")
    parser = argparse.ArgumentParser(
        description="Fill en_vocab IPA via local Ollama (gemma4:26b)"
    )
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
        default=int(cfg.get("EN_VOCAB_FILL_READING_LIMIT") or 15),
    )
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--delay-ms", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-skipped", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )

    if skip_if_worker_unavailable(args.api_url, label="en-vocab-fill-reading"):
        return 0

    if not probe_ollama():
        raise SystemExit("本地 Ollama 不可用（brew services start ollama）")

    model = resolve_ollama_model()
    source = build_source_label(model)

    scan = call_api(
        args.api_url,
        args.token,
        {"mode": "list_missing", "limit": max(1, args.limit)},
        user_agent="en-vocab-fill-reading/2.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or len(missing))
    print(
        f"[en-vocab-fill-reading] model={model} list_missing={len(missing)} "
        f"total_missing={total}",
        flush=True,
    )
    if not missing:
        print("  无缺失音标", flush=True)
        return 0

    updates: list[dict] = []
    skipped: list[dict] = []

    for index, item in enumerate(missing):
        word_id = int(item.get("id") or 0)
        word = str(item.get("word") or "").strip()
        if word_id <= 0 or not word:
            continue
        lookup, skip_reason = analyze_word(word)
        if skip_reason:
            skipped.append({"id": word_id, "word": word, "reason": skip_reason})
            print(f"  skip {word_id} {word!r} ({skip_reason})", flush=True)
            continue

        if word in MANUAL_READINGS or lookup in MANUAL_READINGS:
            ipa = MANUAL_READINGS.get(word) or MANUAL_READINGS[lookup]
            src = "手动"
        else:
            print(
                f"  [{index + 1}/{len(missing)}] id={word_id} word={word!r} …",
                flush=True,
            )
            ipa, err, used_model = llm_ipa(
                lookup, model=model, retries=max(1, args.retries)
            )
            src = build_source_label(used_model)
            if not ipa:
                skipped.append({"id": word_id, "word": word, "reason": err or "not_found"})
                print(f"    miss reason={err}", flush=True)
                continue

        print(f"    -> {ipa} ({src})", flush=True)
        updates.append({"word_id": word_id, "reading": ipa, "source": src})
        if args.delay_ms > 0 and index + 1 < len(missing):
            time.sleep(args.delay_ms / 1000.0)

    if args.dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "dry_run": True,
                    "source": source,
                    "updates": updates,
                    "skipped": skipped,
                },
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
        {"mode": "apply", "source": source, "updates": updates},
        user_agent="en-vocab-fill-reading/2.0",
    )
    print(
        f"[en-vocab-fill-reading] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])} source={source}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
