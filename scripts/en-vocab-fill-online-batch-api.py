#!/usr/bin/env python3
"""线上付费 API：一词一次补齐音标 / 释义 / 词性 / 用法 / 例句。

与 STT 博士套磁信同一 Anthropic 中转（tokken.cc）。
仅在 EN_VOCAB_FILL_LLM_BACKEND=1 时由 en-vocab-fill-stage.sh 调用。
本地模式（0）请走分阶段 Ollama 脚本，不要跑本文件。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402
from en_vocab_llm_backend import (  # noqa: E402
    backend_label,
    is_online_backend,
)
from paid_anthropic_client import (  # noqa: E402
    anthropic_model,
    call_anthropic,
)

BASE = "https://finance.info-quests.com"
READING_URL = f"{BASE}/api/en-vocab/fill-reading"
MEANING_URL = f"{BASE}/api/en-vocab/fill-meaning"
USAGE_URL = f"{BASE}/api/en-vocab/fill-usage"
EXAMPLES_URL = f"{BASE}/api/en-vocab/fill-example-sentences"

EXAM_LABEL_RE = re.compile(
    r"雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b",
    re.IGNORECASE,
)
FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")
_IPA_WRAPPED = re.compile(r"^([\[\/])(.+)([\]\/])$")
_IPA_FIND = re.compile(r"[/\[\]]([^/\\[\]]{1,60})[/\[\]]")

SYSTEM = (
    "You fill English learner flashcard fields for junior-high / academic-exam review. "
    "Return ONLY one JSON object. No markdown fences, no commentary. "
    "Usage explanations: Chinese, numbered 1. 2. …; focus on high-frequency academic "
    "exam writing/reading/listening uses; NEVER write exam brand names "
    "(IELTS/TOEFL/雅思/托福/四六级/考研 etc.) in the usage text. "
    "Examples: full English sentences with the lemma, each followed by a 译文： Chinese line; "
    "one example per usage point; keep other words very simple."
)


def normalize_ipa(text: str) -> str | None:
    text = (text or "").strip()
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
        if " " not in body or re.search(r"[ˈˌːəɪʊʌʃʒθðŋ]", body):
            return f"/{body}/"
    return None


def strip_exam_labels(text: str) -> str:
    if not text:
        return ""
    lines = []
    for line in text.splitlines():
        cleaned = EXAM_LABEL_RE.sub("", line)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        cleaned = re.sub(r"[；;]{2,}", "；", cleaned)
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines).strip()


def normalize_example_sentences(text: str) -> str:
    """去掉行首序号，保留「译文：」行。"""
    lines: list[str] = []
    for line in str(text or "").splitlines():
        t = LEADING_INDEX_RE.sub("", line).strip()
        if t:
            lines.append(t)
    return "\n".join(lines).strip()


def parse_json_object(raw: str) -> dict[str, Any]:
    text = FENCE_RE.sub("", (raw or "").strip()).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        data = json.loads(text[start : end + 1])
        if isinstance(data, dict):
            return data
    raise ValueError("model output is not a JSON object")


def build_prompt(row: dict[str, Any], needs: dict[str, bool]) -> str:
    word = str(row.get("word") or "").strip()
    kind = str(row.get("kind") or "word")
    kind_label = "语法" if kind == "grammar" else "单词"
    need_keys = [k for k, v in needs.items() if v]
    return f"""词条：{word}
类型：{kind_label}

说明：该词条有字段缺失或不完整。请用更准确的内容 **整词重写** 下列字段（覆盖旧值，不要只补空缺）：
{", ".join(need_keys)}

参考（可忽略，以你重写为准）：
已有音标：{row.get("reading") or "（无）"}
已有释义：{row.get("meaning") or "（无）"}
已有词性：{row.get("pos") or "（无）"}
已有用法：{row.get("usage") or "（无）"}
已有例句：{row.get("example_sentences") or "（无）"}

输出 JSON（需要的字段必须给出非空值）：
- reading: 美式 IPA，形如 /həˈloʊ/
- meaning: 中文释义，分号分隔，最多 3 义
- pos: 英文词性缩写，多词性用 /，如 v 或 adj/n
- usage: 至少 2 条编号中文用法（1. …\\n2. …）；选题按学术考试高频，正文禁止考试品牌名
- example_sentences: 与 usage 条数相同；每条英文完整句 + 下一行「译文：」中文；须出现词条原文「{word}」；不要行首编号

只输出 JSON。"""


def source_label() -> str:
    return f"线上 {anthropic_model()}"


def full_refresh_needs(kind: str) -> dict[str, bool]:
    """线上模式：只要触发检测，就整词重拉（付费更准，覆盖写回）。"""
    if kind == "grammar":
        return {
            "reading": False,
            "meaning": False,
            "pos": False,
            "usage": True,
            "example_sentences": True,
        }
    return {
        "reading": True,
        "meaning": True,
        "pos": True,
        "usage": True,
        "example_sentences": True,
    }


def fetch_candidates(token: str, *, limit: int) -> list[dict[str, Any]]:
    """合并各阶段 list_missing；任一字段缺 → 整词进入刷新队列。"""
    by_id: dict[int, dict[str, Any]] = {}

    def merge(rows: list) -> None:
        for row in rows:
            wid = int(row.get("id") or 0)
            if wid <= 0:
                continue
            cur = by_id.get(wid)
            if not cur:
                kind = str(row.get("kind") or "word")
                cur = {
                    "id": wid,
                    "word": row.get("word"),
                    "kind": kind,
                    "reading": row.get("reading"),
                    "meaning": row.get("meaning"),
                    "pos": row.get("pos"),
                    "usage": row.get("usage"),
                    "example_sentences": row.get("example_sentences"),
                    "needs": full_refresh_needs(kind),
                    "triggered": True,
                }
                by_id[wid] = cur
            for field in ("reading", "meaning", "pos", "usage", "kind", "word"):
                if row.get(field) and not cur.get(field):
                    cur[field] = row.get(field)
            # 若后来发现是 grammar，收窄 needs
            if str(cur.get("kind") or "") == "grammar":
                cur["needs"] = full_refresh_needs("grammar")

    scan_limit = max(limit * 8, 24)
    for url in (READING_URL, MEANING_URL, USAGE_URL, EXAMPLES_URL):
        data = call_api(
            url,
            token,
            {"mode": "list_missing", "limit": scan_limit},
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        merge(list(data.get("missing") or []))

    rows = list(by_id.values())
    rows.sort(key=lambda r: int(r.get("id") or 0))
    return rows[: max(1, limit)]


def apply_bundle(
    token: str,
    *,
    word_id: int,
    payload: dict[str, Any],
    needs: dict[str, bool],
    source: str,
    dry_run: bool,
) -> list[str]:
    """force=True：覆盖写回（付费结果替换本地旧值）。"""
    done: list[str] = []
    if dry_run:
        for k, need in needs.items():
            if need and payload.get(k):
                done.append(f"dry:{k}")
        return done

    if needs.get("reading") and payload.get("reading"):
        r = call_api(
            READING_URL,
            token,
            {
                "mode": "apply",
                "force": True,
                "source": source,
                "updates": [
                    {
                        "word_id": word_id,
                        "reading": payload["reading"],
                        "source": source,
                    }
                ],
            },
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        if int(r.get("updated") or 0) > 0:
            done.append("reading")
        elif r.get("skipped"):
            print(f"    reading skipped={r.get('skipped')}", flush=True)

    meaning_update: dict[str, Any] = {"word_id": word_id, "source": source}
    if needs.get("meaning") and payload.get("meaning"):
        meaning_update["meaning"] = payload["meaning"]
    if needs.get("pos") and payload.get("pos"):
        meaning_update["pos"] = payload["pos"]
    if "meaning" in meaning_update or "pos" in meaning_update:
        r = call_api(
            MEANING_URL,
            token,
            {
                "mode": "apply",
                "force": True,
                "source": source,
                "updates": [meaning_update],
            },
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        if int(r.get("updated") or 0) > 0:
            done.append("meaning/pos")
        elif r.get("skipped"):
            print(f"    meaning skipped={r.get('skipped')}", flush=True)

    if needs.get("usage") and payload.get("usage"):
        r = call_api(
            USAGE_URL,
            token,
            {
                "mode": "apply",
                "force": True,
                "source": source,
                "updates": [
                    {
                        "word_id": word_id,
                        "usage": payload["usage"],
                        "source": source,
                    }
                ],
            },
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        if int(r.get("updated") or 0) > 0:
            done.append("usage")
        elif r.get("skipped"):
            print(f"    usage skipped={r.get('skipped')}", flush=True)

    if needs.get("example_sentences") and payload.get("example_sentences"):
        # 先写 usage(force)，例句校验才能对上新用法条数
        r = call_api(
            EXAMPLES_URL,
            token,
            {
                "mode": "apply",
                "force": True,
                "source": source,
                "updates": [
                    {
                        "word_id": word_id,
                        "example_sentences": payload["example_sentences"],
                        "source": source,
                    }
                ],
            },
            user_agent="en-vocab-fill-online-batch/1.0",
        )
        if int(r.get("updated") or 0) > 0:
            done.append("example_sentences")
        elif r.get("skipped"):
            print(f"    examples skipped={r.get('skipped')}", flush=True)

    return done


def generate_bundle(row: dict[str, Any], needs: dict[str, bool]) -> dict[str, Any]:
    raw = call_anthropic(
        build_prompt(row, needs),
        system=SYSTEM,
        max_tokens=4500,
        temperature=0.3,
        timeout=180,
    )
    data = parse_json_object(raw)
    out: dict[str, Any] = {}

    if needs.get("reading"):
        ipa = normalize_ipa(str(data.get("reading") or ""))
        if ipa:
            out["reading"] = ipa

    if needs.get("meaning"):
        meaning = str(data.get("meaning") or "").strip()
        if meaning:
            out["meaning"] = meaning

    if needs.get("pos"):
        pos = str(data.get("pos") or "").strip()
        if pos:
            out["pos"] = pos

    if needs.get("usage"):
        usage = strip_exam_labels(str(data.get("usage") or ""))
        if usage:
            out["usage"] = usage

    if needs.get("example_sentences"):
        ex = normalize_example_sentences(str(data.get("example_sentences") or ""))
        if ex:
            out["example_sentences"] = ex

    return out


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill en-vocab fields in one paid Anthropic call"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_ONLINE_LIMIT") or 1),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="即使开关为本地也运行（调试用）",
    )
    args = parser.parse_args()

    if not args.force and not is_online_backend():
        print(
            f"[en-vocab-fill-online] backend={backend_label()} → skip "
            f"(改 scripts/lib/en_vocab_llm_backend.py 里 EN_VOCAB_FILL_LLM_BACKEND=1)",
            flush=True,
        )
        return 0

    token = resolve_token()
    if not token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    print(
        f"[en-vocab-fill-online] backend={backend_label()} model={anthropic_model()}",
        flush=True,
    )
    candidates = fetch_candidates(token, limit=max(1, args.limit))
    print(f"[en-vocab-fill-online] candidates={len(candidates)}", flush=True)
    if not candidates:
        print("  无待补全词条", flush=True)
        return 0

    source = source_label()
    for index, row in enumerate(candidates):
        wid = int(row["id"])
        word = str(row.get("word") or "")
        needs = dict(row.get("needs") or {})
        need_list = [k for k, v in needs.items() if v]
        print(
            f"  [{index + 1}/{len(candidates)}] id={wid} word={word!r} "
            f"full_refresh={need_list}",
            flush=True,
        )
        try:
            payload = generate_bundle(row, needs)
        except Exception as err:
            print(f"    fail generate: {err}", flush=True)
            continue
        if not payload:
            print("    empty payload", flush=True)
            continue
        preview = {k: (str(v)[:80] + ("…" if len(str(v)) > 80 else "")) for k, v in payload.items()}
        print(f"    got={preview}", flush=True)
        done = apply_bundle(
            token,
            word_id=wid,
            payload=payload,
            needs=needs,
            source=source,
            dry_run=args.dry_run,
        )
        print(f"    applied={done} source={source}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
