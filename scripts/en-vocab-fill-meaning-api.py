#!/usr/bin/env python3
"""补全 en_vocab_word 缺失释义/词性：list_missing → 本机 Ollama → apply。

默认模型 gemma4:26b（谷歌）；释义多义用中文分号「；」；词性 n/v/adj…，多词性用 /。
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

DEFAULT_API_URL = "https://finance.info-quests.com/api/en-vocab/fill-meaning"
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
MARKDOWN_RE = re.compile(r"[`*_#\[\]|>]")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
POS_TOKEN_RE = re.compile(
    r"^(n|v|adj|adv|prep|conj|pron|det|num|interj|phrase|aux|modal)$",
    re.I,
)
POS_ALIASES = {
    "noun": "n",
    "verb": "v",
    "adjective": "adj",
    "adverb": "adv",
    "preposition": "prep",
    "conjunction": "conj",
    "pronoun": "pron",
    "determiner": "det",
    "article": "det",
    "number": "num",
    "numeral": "num",
    "interjection": "interj",
    "exclamation": "interj",
    "phrasal": "phrase",
    "auxiliary": "aux",
    "modal verb": "modal",
}


def normalize_meaning(raw: str) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[;；、,，/／|｜]+", str(raw or "")):
        item = LEADING_INDEX_RE.sub("", chunk.strip()).rstrip("。.．")
        item = re.sub(r"^(释义|意思|中文)\s*[:：]\s*", "", item).strip()
        if not item or item in seen:
            continue
        seen.add(item)
        parts.append(item)
        if len(parts) >= 3:
            break
    return "；".join(parts)


def validate_meaning(raw: str) -> tuple[str | None, str | None]:
    text = normalize_meaning(raw)
    if not text:
        return None, "empty"
    if len(text) > 80:
        return None, "too_long"
    if MARKDOWN_RE.search(text):
        return None, "has_markdown"
    if not HAN_RE.search(text):
        return None, "no_chinese"
    return text, None


def map_pos_token(raw: str) -> str | None:
    t = raw.strip().lower().rstrip(".")
    if not t:
        return None
    if t in POS_ALIASES:
        return POS_ALIASES[t]
    if POS_TOKEN_RE.match(t):
        return t.lower()
    return None


def normalize_pos(raw: str) -> str | None:
    parts: list[str] = []
    seen: set[str] = set()
    cleaned = re.sub(r"^(词性|pos)\s*[:：]\s*", "", str(raw or ""), flags=re.I)
    for chunk in re.split(r"[\/／|,，;；]+", cleaned):
        mapped = map_pos_token(chunk)
        if not mapped or mapped in seen:
            continue
        seen.add(mapped)
        parts.append(mapped)
        if len(parts) >= 4:
            break
    return "/".join(parts) if parts else None


def parse_meaning_pos(
    content: str,
    *,
    need_meaning: bool,
    need_pos: bool,
) -> tuple[str | None, str | None]:
    meaning: str | None = None
    pos: str | None = None
    for raw_line in content.splitlines():
        line = LEADING_INDEX_RE.sub("", raw_line.strip())
        if not line:
            continue
        lower = line.lower()
        if lower.startswith(("词性", "pos")) or re.match(r"^pos\s*[:：]", lower):
            if need_pos and not pos:
                pos = normalize_pos(line)
            continue
        if lower.startswith(("释义", "意思", "中文", "meaning")):
            if need_meaning and not meaning:
                meaning, _ = validate_meaning(line)
            continue
        maybe_pos = normalize_pos(line)
        # 整行都是词性 token
        if maybe_pos and re.fullmatch(
            r"[A-Za-z/／|,，;；.\s]+", line
        ) and not HAN_RE.search(line):
            if need_pos and not pos:
                pos = maybe_pos
            continue
        if need_meaning and not meaning and HAN_RE.search(line):
            meaning, _ = validate_meaning(line)
    return meaning, pos


def generate_for_row(
    row: dict,
    *,
    model: str,
    retries: int,
    field: str = "both",
) -> tuple[str | None, str | None, str | None, str]:
    """返回 (meaning, pos, error, model_used)。

    field: both | meaning | pos —— 只向模型要对应字段，缩短单次任务。
    """
    if field == "meaning":
        need_meaning, need_pos = True, False
    elif field == "pos":
        need_meaning, need_pos = False, True
    else:
        need_meaning = bool(row.get("need_meaning", True))
        need_pos = bool(row.get("need_pos", True))

    prompt = str(row.get("prompt") or "").strip()
    # 单字段时重写 prompt，避免模型仍被要求写另一字段
    if field in ("meaning", "pos") or not prompt:
        word = str(row.get("word") or "")
        reading = str(row.get("reading") or "").strip()
        jobs = []
        if need_meaning:
            jobs.append("释义行：最常用 1～3 个中文义项，用中文分号「；」连接")
        if need_pos:
            jobs.append("词性行：英文缩写（n/v/adj/adv…）；多词性用 /，例如 adj/n")
        prompt = (
            f"词条：{word}\n"
            + (f"音标：{reading}\n" if reading else "")
            + "类型：单词\n\n"
            + "请为上述英语单词补全字段。\n"
            + "\n".join(f"{i + 1}. {j}" for i, j in enumerate(jobs))
            + "\n只输出字段正文行；不要解释。"
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
                f"[en-vocab-fill-meaning] fallback → {use_model} (prev={last_err})",
                flush=True,
            )
        for attempt in range(max(1, retries)):
            try:
                content = call_ollama(work_prompt, model=use_model)
                meaning, pos = parse_meaning_pos(
                    content, need_meaning=need_meaning, need_pos=need_pos
                )
                if need_meaning and not meaning:
                    last_err = "invalid_meaning"
                elif need_pos and not pos:
                    last_err = "invalid_pos"
                else:
                    return meaning, pos, None, use_model
                work_prompt = (
                    base_prompt
                    + f"\n\n上次不合格（{last_err}）。请严格按行输出："
                    + (
                        "只输出中文释义（；分隔）。"
                        if field == "meaning"
                        else "只输出词性（如 adj/n）。"
                        if field == "pos"
                        else "先中文释义（；分隔），再单独一行词性（如 adj/n）。"
                    )
                )
            except Exception as err:
                last_err = str(err)
                if is_ollama_timeout_error(err) and mi + 1 < len(chain):
                    break
                if attempt + 1 >= retries:
                    if mi + 1 < len(chain):
                        break
                    return None, None, last_err, last_model
                time.sleep(1.2)
        else:
            if mi + 1 < len(chain):
                continue
            return None, None, last_err, last_model
    return None, None, last_err, last_model


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill en_vocab meaning and/or pos via Ollama (可 --field 拆开跑)"
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_MEANING_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_MEANING_LIMIT") or 15),
    )
    parser.add_argument(
        "--field",
        choices=["both", "meaning", "pos"],
        default="both",
        help="both=释义+词性；meaning/pos=只补该字段（独立定时任务用）",
    )
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--delay-ms", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit(
            "缺少 JP_REVIEW_UPLOAD_TOKEN（~/.config/info-quests/jp-review-sync.env）"
        )

    if skip_if_worker_unavailable(args.api_url, label="en-vocab-fill-meaning"):
        return 0

    # 单字段时多拉一些，过滤后仍够一批
    list_limit = max(1, args.limit)
    if args.field in ("meaning", "pos"):
        list_limit = max(list_limit, min(40, args.limit * 2))

    scan = call_api(
        args.api_url,
        args.token,
        {"mode": "list_missing", "limit": list_limit},
        user_agent="en-vocab-fill-meaning/1.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    if args.field == "meaning":
        missing = [r for r in missing if r.get("need_meaning")]
    elif args.field == "pos":
        missing = [r for r in missing if r.get("need_pos")]
    missing = missing[: max(1, args.limit)] if missing else []

    total = int(scan.get("total_missing") or len(missing))
    print(
        f"[en-vocab-fill-meaning] field={args.field} "
        f"batch={len(missing)} total_missing={total}",
        flush=True,
    )
    if args.scan:
        print(json.dumps(scan, ensure_ascii=False, indent=2))
        return 0
    if not missing:
        print(f"  无缺失（field={args.field}）", flush=True)
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
        meaning, pos, err, used_model = generate_for_row(
            row,
            model=model,
            retries=max(1, args.retries),
            field=args.field,
        )
        if err or (args.field == "meaning" and not meaning) or (
            args.field == "pos" and not pos
        ) or (args.field == "both" and not meaning and not pos):
            skipped.append({"id": word_id, "word": word, "reason": err or "empty"})
            print(f"    skip reason={err}", flush=True)
        else:
            item: dict = {"word_id": word_id, "source": build_source_label(used_model)}
            if args.field in ("both", "meaning") and meaning:
                item["meaning"] = meaning
            if args.field in ("both", "pos") and pos:
                item["pos"] = pos
            if "meaning" not in item and "pos" not in item:
                skipped.append({"id": word_id, "word": word, "reason": "empty"})
                print("    skip reason=empty", flush=True)
            else:
                updates.append(item)
                print(
                    f"    meaning={meaning!r} pos={pos!r} model={used_model}",
                    flush=True,
                )
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
        user_agent="en-vocab-fill-meaning/1.0",
    )
    print(
        f"[en-vocab-fill-meaning] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])} source={source}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
