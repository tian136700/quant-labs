#!/usr/bin/env python3
"""补全 en_vocab_word 缺失用法：list_missing → 本机 Ollama → apply。

格式：编号中文说明 + 出现频次 [1]～[10]，组数按真实常用用法（可为 1）。
选题按学术考试高频；正文禁止考试标签。
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

DEFAULT_API_URL = "https://finance.info-quests.com/api/en-vocab/fill-usage"
NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
FENCE_RE = re.compile(r"^```(?:\w+)?\s*$")
# 与 src/lib/en-vocab-usage-ai.ts 一致：上传前屏蔽考试标签（剥掉，不整段拒收）
EXAM_LABEL_RE = re.compile(
    r"雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b",
    re.IGNORECASE,
)
EXAM_LABEL_COMPOUND_RE = re.compile(
    r"IELTS\s*[\/／、&]\s*TOEFL|TOEFL\s*[\/／、&]\s*IELTS|"
    r"雅思\s*[\/／、或和与]\s*托福|托福\s*[\/／、或和与]\s*雅思",
    re.IGNORECASE,
)
IMAGE_LINE_RE = re.compile(r"^!\[[^\]]*\]\([^)]+\)\s*$")


def _clean_line_debris(line: str) -> str:
    s = line
    s = re.sub(r"\s{2,}", " ", s)
    s = re.sub(r"[；;]{2,}", "；", s)
    s = re.sub(r"[，,]{2,}", "，", s)
    s = re.sub(r"([：:；;，,、])\s+", r"\1", s)
    s = re.sub(r"\s+([：:；;，,、。．.!！？?])", r"\1", s)
    s = re.sub(r"([：:])\s*[；;，,、／/]+\s*", r"\1", s)
    s = re.sub(r"\s*[；;，,、／/]+\s*([。．.!！？?])", r"\1", s)
    s = re.sub(r"([。．.!！？?])\s*[；;，,、／/]+", r"\1", s)
    s = re.sub(r"([\u4E00-\u9FFF])\s+(?=[\u4E00-\u9FFF])", r"\1", s)
    s = s.strip()
    s = re.sub(r"^(\d+\s*[.、．)\]]\s*)[；;，,、／/]+\s*", r"\1", s)
    s = re.sub(r"[；;，,、／/\s]+$", "", s).strip()
    if re.match(r"^\d+\s*[.、．)\]]\s*$", s):
        return ""
    return s


def shield_usage_upload(raw: str) -> str:
    """上传屏蔽：去掉考试标签词，保留其余正文与 [频次] 标记。"""
    text = str(raw or "")
    if not text.strip() or not EXAM_LABEL_RE.search(text):
        return text.strip()
    text = EXAM_LABEL_COMPOUND_RE.sub("", text)
    text = EXAM_LABEL_RE.sub("", text)
    lines = [_clean_line_debris(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln.strip()]
    out: list[str] = []
    point_idx = 0
    for line in lines:
        trimmed = line.strip()
        if IMAGE_LINE_RE.match(trimmed):
            out.append(trimmed)
            continue
        m = NUMBERED_LINE_RE.match(trimmed)
        if m:
            body = m.group(2).strip()
            freq, body_text = _extract_frequency(body)
            if not body_text or not HAN_RE.search(body_text):
                continue
            point_idx += 1
            freq_s = f"[{freq}] " if freq is not None else ""
            out.append(f"{point_idx}. {freq_s}{body_text}")
            continue
        out.append(trimmed)
    return "\n".join(out).strip()


FREQ_PREFIX_RE = re.compile(r"^\[(\d{1,2})\]\s*(.+)$")
FREQ_LABEL_RE = re.compile(r"^\[频次\s*(\d{1,2})\]\s*(.+)$")
FREQ_TRAILING_RE = re.compile(
    r"^(.+?)\s*[【\[]\s*(?:频次\s*[:：]?\s*)?(\d{1,2})\s*[】\]]\s*$"
)


def _extract_frequency(body: str) -> tuple[int | None, str]:
    raw = str(body or "").strip()
    if not raw:
        return None, ""
    m = FREQ_PREFIX_RE.match(raw)
    if m:
        score = int(m.group(1))
        text = m.group(2).strip()
        if 1 <= score <= 10 and text:
            return score, text
    m = FREQ_LABEL_RE.match(raw)
    if m:
        score = int(m.group(1))
        text = m.group(2).strip()
        if 1 <= score <= 10 and text:
            return score, text
    m = FREQ_TRAILING_RE.match(raw)
    if m:
        score = int(m.group(2))
        text = m.group(1).strip()
        if 1 <= score <= 10 and text:
            return score, text
    return None, raw


def validate_usage(raw: str) -> tuple[str | None, str | None]:
    text = shield_usage_upload(raw)
    lines = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not FENCE_RE.match(ln.strip())
    ]
    if not lines:
        return None, "empty"

    points: list[tuple[int, str, int]] = []
    for line in lines:
        m = NUMBERED_LINE_RE.match(line)
        if not m:
            return None, "invalid_numbering"
        n = int(m.group(1))
        body = m.group(2).strip()
        if n <= 0 or not body:
            return None, "invalid_numbering"
        freq, body_text = _extract_frequency(body)
        if freq is None and re.match(r"^\[\d{1,2}\]\s*", body):
            return None, "invalid_frequency"
        if freq is None:
            return None, "missing_frequency"
        if not body_text or not HAN_RE.search(body_text):
            return None, "invalid_numbering"
        points.append((n, body_text, freq))

    if len(points) < 1:
        return None, "need_one_point"

    for i, (n, _, _) in enumerate(points):
        if n != i + 1:
            return None, "invalid_numbering"

    out = "\n".join(
        f"{i + 1}. [{freq}] {body}" for i, (_, body, freq) in enumerate(points)
    )
    return out, None


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
            "请列出常用用法，组数按真实不同核心义项（只有 1 种就 1 条，禁止硬凑 2 条；"
            "禁止按对象/场景硬拆同一义，如 attractive 勿拆成「对客户有吸引力」与「外表好看」；"
            "禁止近义微调硬拆，如 carefully 勿拆成「仔细地完成工作」与「谨慎地避免出错」），"
            "每条必须带出现频次 1～10，形如：\n"
            "1. [9] 副词：表示「仔细地；小心地；认真地」。\n"
            "正文禁止写考试名称（雅思、托福、IELTS、TOEFL、托业、TOEIC 等）。"
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
                f"[en-vocab-fill-usage] fallback → {use_model} (prev={last_err})",
                flush=True,
            )
        for attempt in range(max(1, retries)):
            try:
                content = call_ollama(work_prompt, model=use_model)
                text, reason = validate_usage(content)
                if text:
                    return text, None, use_model
                last_err = reason or "invalid"
                work_prompt = (
                    base_prompt
                    + f"\n\n上次不合格（{last_err}）。请只输出从 1. 连续编号的中文用法行，"
                    "每条必须是「数字. [1-10分] 中文说明」，组数按真实常用用法（1 种就 1 条），"
                    "不要 markdown，不要写任何考试名称标签。"
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
        description="Fill en_vocab usage via Ollama (no exam labels in text)"
    )
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_USAGE_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_USAGE_LIMIT") or 1),
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

    if skip_if_worker_unavailable(args.api_url, label="en-vocab-fill-usage"):
        return 0

    body: dict = {"mode": "list_missing", "limit": max(1, args.limit)}
    if args.kind:
        body["kind"] = args.kind

    scan = call_api(
        args.api_url,
        args.token,
        body,
        user_agent="en-vocab-fill-usage/1.0",
    )
    if not scan.get("ok"):
        raise SystemExit(f"API error: {scan.get('error', scan)}")

    missing = list(scan.get("missing") or [])
    total = int(scan.get("total_missing") or len(missing))
    print(
        f"[en-vocab-fill-usage] list_missing={len(missing)} total_missing={total}",
        flush=True,
    )
    if args.scan:
        print(json.dumps(scan, ensure_ascii=False, indent=2))
        return 0
    if not missing:
        print("  无缺失用法", flush=True)
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
                    "usage": text,
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
        user_agent="en-vocab-fill-usage/1.0",
    )
    print(
        f"[en-vocab-fill-usage] apply updated={apply.get('updated')} "
        f"skipped={len(apply.get('skipped') or [])} source={source}",
        flush=True,
    )
    if not apply.get("ok"):
        raise SystemExit(f"apply failed: {apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
