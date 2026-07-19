#!/usr/bin/env python3
"""补全 en_vocab_word 缺失例句：list_missing → 本机 Ollama → apply。

格式对齐日语：英文一行 +「译文：」中文；条数 = max(2, 用法数)。
默认模型 gemma4:26b；source 标「本地 gemma4:26b」。
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

DEFAULT_API_URL = (
    "https://finance.info-quests.com/api/en-vocab/fill-example-sentences"
)
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
GLOSS_LABEL_RE = re.compile(r"^(译文|翻譯|翻译|译|譯)\s*[:：]\s*")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
LATIN_RE = re.compile(r"[A-Za-z]")


def is_english_line(text: str) -> bool:
    t = text.strip()
    if not t or GLOSS_LABEL_RE.match(t):
        return False
    if not LATIN_RE.search(t):
        return False
    han = len(HAN_RE.findall(t))
    latin = len(LATIN_RE.findall(t))
    if han >= 4 and latin > 0 and han >= latin:
        return False
    return True


def is_gloss_line(text: str) -> bool:
    t = text.strip()
    if not t or is_english_line(t):
        return False
    body = GLOSS_LABEL_RE.sub("", t).strip()
    return bool(HAN_RE.search(body))


def word_used(sentence: str, word: str, kind: str) -> bool:
    target = word.strip()
    if not target:
        return False
    if kind == "grammar":
        return target.lstrip("～~").lower() in sentence.lower()
    escaped = re.escape(target)
    return bool(re.search(rf"\b{escaped}\b", sentence, flags=re.I))


def validate_examples(
    raw: str, *, word: str, kind: str
) -> tuple[str | None, str | None]:
    lines = [
        LEADING_INDEX_RE.sub("", ln).strip()
        for ln in raw.splitlines()
        if ln.strip()
    ]
    if len(lines) < 4:
        return None, "need_four_lines"

    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not is_english_line(line):
            i += 1
            continue
        gloss = ""
        if i + 1 < len(lines) and is_gloss_line(lines[i + 1]):
            gloss_body = GLOSS_LABEL_RE.sub("", lines[i + 1]).strip()
            gloss = f"译文：{gloss_body}"
            i += 2
        else:
            i += 1
        pairs.append((line, gloss))

    if len(pairs) < 2:
        return None, "need_two_english_lines"

    out_lines: list[str] = []
    for en, gloss in pairs:
        if not gloss:
            return None, "missing_chinese_gloss"
        if not word_used(en, word, kind):
            return None, "word_not_used"
        out_lines.append(en)
        out_lines.append(gloss)
    return "\n".join(out_lines), None


def generate_for_row(
    row: dict, *, model: str, retries: int
) -> tuple[str | None, str | None, str]:
    """返回 (text, error, model_used)。"""
    prompt = str(row.get("prompt") or "").strip()
    word = str(row.get("word") or "")
    kind = str(row.get("kind") or "word")
    if not prompt:
        prompt = (
            f"词条：{word}\n类型：{'语法' if kind == 'grammar' else '单词'}\n\n"
            "请写英语例句，每条英文下一行「译文：」中文；至少 2 条。"
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
                f"[en-vocab-fill-examples] fallback → {use_model} (prev={last_err})",
                flush=True,
            )
        for attempt in range(max(1, retries)):
            try:
                content = call_ollama(work_prompt, model=use_model)
                text, reason = validate_examples(content, word=word, kind=kind)
                if text:
                    return text, None, use_model
                last_err = reason or "invalid"
                work_prompt = (
                    base_prompt
                    + f"\n\n上次不合格（{last_err}）。请只输出英文/译文交替行，至少两句，"
                    "不要编号。"
                )
            except Exception as err:
                last_err = str(err)
                if is_ollama_timeout_error(err) and mi + 1 < len(chain):
                    break
                if attempt + 1 >= retries:
                    if mi + 1 < len(chain):
                        break
                    return None, last_err, last_model
                time.sleep(1.2)
        else:
            if mi + 1 < len(chain):
                continue
            return None, last_err, last_model
    return None, last_err, last_model


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill en_vocab example sentences via Ollama"
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_EXAMPLE_SENTENCES_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_EXAMPLE_LIMIT") or 1),
    )
    parser.add_argument("--kind", choices=["word", "grammar"])
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--delay-ms", type=int, default=300)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )

    body: dict = {"mode": "list_missing", "limit": max(1, args.limit)}
    if args.kind:
        body["kind"] = args.kind

    scan = call_api(
        args.api_url,
        args.token,
        body,
        user_agent="en-vocab-fill-example-sentences/1.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or len(missing))
    print(
        f"[en-vocab-fill-examples] list_missing={len(missing)} total_missing={total}",
        flush=True,
    )
    if args.scan:
        print(json.dumps(scan, ensure_ascii=False, indent=2))
        return 0
    if not missing:
        print("  无缺失例句", flush=True)
        return 0

    if not probe_ollama():
        raise SystemExit("本地 Ollama 不可用（先 brew services start ollama）")

    model = resolve_ollama_model()
    source = build_source_label(model)
    updates: list[dict] = []
    skipped: list[dict] = []

    for index, row in enumerate(missing):
        word_id = int(row.get("id") or 0)
        word = str(row.get("word") or "")
        print(
            f"  [{index + 1}/{len(missing)}] id={word_id} word={word!r}",
            flush=True,
        )
        text, err, used_model = generate_for_row(
            row, model=model, retries=max(1, args.retries)
        )
        if not text:
            skipped.append({"id": word_id, "word": word, "reason": err or "empty"})
            print(f"    skip reason={err}", flush=True)
        else:
            updates.append(
                {
                    "word_id": word_id,
                    "example_sentences": text,
                    "source": build_source_label(used_model),
                }
            )
            preview = text.splitlines()[0] if text else ""
            print(f"    ok model={used_model} preview={preview!r}", flush=True)
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
        user_agent="en-vocab-fill-example-sentences/1.0",
    )
    print(
        f"[en-vocab-fill-examples] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])} source={source}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
