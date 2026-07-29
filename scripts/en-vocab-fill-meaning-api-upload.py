#!/usr/bin/env python3
"""只补 upload_source=api 且缺释义的单词；不碰已有用法/例句/音标。

线上 Anthropic（tokken）；释义格式：最常用义；次常用义；第三义（中文分号「；」，最多 3 义）。
优先处理已有用法+例句的词条。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402
from paid_anthropic_client import (  # noqa: E402
    build_online_source_label,
    call_anthropic,
)
from worker_api_guard import skip_if_worker_unavailable  # noqa: E402
from vocab_fill_circuit_breaker import assert_not_killed, after_attempt  # noqa: E402

MEANING_URL = "https://finance.info-quests.com/api/en-vocab/fill-meaning"
DB_NAME = "strategy-compare-db"
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
LEADING_INDEX_RE = re.compile(r"^\s*\d+[.、．)\]]\s*")


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
    if not HAN_RE.search(text):
        return None, "no_chinese"
    return text, None


def fetch_api_upload_missing_meaning(
    *,
    word_id: int | None = None,
    prioritize_usage: bool = True,
) -> list[dict[str, Any]]:
    where = (
        "WHERE upload_source = 'api' AND kind != 'grammar' "
        "AND (meaning IS NULL OR TRIM(meaning) = '')"
    )
    if word_id and word_id > 0:
        where += f" AND id = {int(word_id)}"
    sql = (
        "SELECT id, word, reading, pos, category, usage, example_sentences "
        f"FROM en_vocab_word {where} ORDER BY id;"
    )
    proc = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            DB_NAME,
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    rows = json.loads(proc.stdout)[0]["results"]

    def score(row: dict[str, Any]) -> tuple[int, int]:
        has_usage = 1 if str(row.get("usage") or "").strip() else 0
        has_ex = 1 if str(row.get("example_sentences") or "").strip() else 0
        if prioritize_usage:
            return (-(has_usage and has_ex), -(has_usage or has_ex), int(row["id"]))
        return (0, 0, int(row["id"]))

    rows.sort(key=score)
    return rows


def build_prompt(row: dict[str, Any]) -> str:
    word = str(row.get("word") or "").strip()
    reading = str(row.get("reading") or "").strip()
    pos = str(row.get("pos") or "").strip()
    category = str(row.get("category") or "").strip() or "雅思托福"
    usage = str(row.get("usage") or "").strip()
    examples = str(row.get("example_sentences") or "").strip()
    lines = [
        f"词条：{word}",
        f"分类：{category}",
        f"类型：单词",
    ]
    if reading:
        lines.append(f"音标：{reading}")
    if pos:
        lines.append(f"已有词性：{pos}")
    if usage:
        lines.append(f"已有用法（请与释义一致，勿矛盾）：\n{usage}")
    if examples:
        snippet = examples
        if len(snippet) > 600:
            snippet = snippet[:600] + "…"
        lines.append(f"已有例句（参考）：\n{snippet}")

    return (
        "\n".join(lines)
        + """

请只补「中文释义」一行，供初中/高中/雅思托福复习用。

要求：
- 只写最常用到次常用的 1～3 个中文义项，按常用度从高到低排列
- 义项之间只用中文分号「；」连接，例如：期待；盼望
- 不要编号、不要 markdown、不要例句、不要词性行
- 必须与上面已有用法/例句不矛盾（若有）
- 只输出释义正文一行"""
    )


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(
        description="Fill meaning for upload_source=api words only (online)"
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument("--limit", type=int, default=int(cfg.get("EN_VOCAB_FILL_MEANING_LIMIT") or 15))
    parser.add_argument("--word-id", type=int, default=0)
    parser.add_argument(
        "--interval-sec",
        type=int,
        default=int(cfg.get("EN_VOCAB_FILL_ONLINE_MIN_INTERVAL_SEC") or 60),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()

    if not args.token:
        raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")

    if skip_if_worker_unavailable(MEANING_URL, label="en-vocab-fill-meaning-api-upload"):
        return 0

    assert_not_killed("en-vocab-fill-meaning-api-upload")

    rows = fetch_api_upload_missing_meaning(
        word_id=args.word_id or None,
        prioritize_usage=True,
    )
    batch = rows[: max(1, args.limit)]
    print(
        f"[api-upload-meaning] total_missing={len(rows)} batch={len(batch)}",
        flush=True,
    )
    if args.scan:
        print(json.dumps(batch, ensure_ascii=False, indent=2))
        return 0
    if not batch:
        print("  无待补释义（api 上传）", flush=True)
        return 0

    source = build_online_source_label()
    updates: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for index, row in enumerate(batch):
        wid = int(row["id"])
        word = str(row.get("word") or "")
        print(f"  [{index + 1}/{len(batch)}] id={wid} word={word!r}", flush=True)
        prompt = build_prompt(row)
        try:
            raw = call_anthropic(prompt, system=(
                "You output concise Chinese glosses for English vocabulary flashcards. "
                "Return ONLY the gloss line."
            ))
            meaning, err = validate_meaning(raw)
            if err or not meaning:
                skipped.append({"id": wid, "word": word, "reason": err or "empty"})
                after_attempt(
                    scope="en-vocab-meaning-api-upload",
                    word_id=wid,
                    word=word,
                    fixed=False,
                    detail=err or "empty",
                )
                print(f"    skip reason={err} raw={raw[:80]!r}", flush=True)
                continue
            updates.append({"word_id": wid, "meaning": meaning, "source": source})
            print(f"    meaning={meaning!r}", flush=True)
            after_attempt(
                scope="en-vocab-meaning-api-upload",
                word_id=wid,
                word=word,
                fixed=True,
            )
        except Exception as exc:
            skipped.append({"id": wid, "word": word, "reason": str(exc)})
            after_attempt(
                scope="en-vocab-meaning-api-upload",
                word_id=wid,
                word=word,
                fixed=False,
                detail=str(exc),
            )
            print(f"    error={exc}", flush=True)

        if index + 1 < len(batch) and args.interval_sec > 0:
            time.sleep(args.interval_sec)

    if not updates:
        print(f"  本批无写入 skipped={len(skipped)}", flush=True)
        return 1 if skipped else 0

    if args.dry_run:
        print(json.dumps({"updates": updates}, ensure_ascii=False, indent=2))
        return 0

    result = call_api(
        MEANING_URL,
        args.token,
        {"mode": "apply", "source": source, "updates": updates},
        user_agent="en-vocab-fill-meaning-api-upload/1.0",
    )
    if not result.get("ok"):
        raise SystemExit(f"apply failed: {result.get('error', result)}")

    print(
        f"  apply updated={result.get('updated')} skipped={len(result.get('skipped') or [])}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
