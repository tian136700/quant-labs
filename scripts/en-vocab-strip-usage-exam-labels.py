#!/usr/bin/env python3
"""线上清洗：剥掉 en_vocab_word.usage 里的雅思/托福等考试标签。

优先走 API mode=strip_exam_labels（需已部署）；若 API 尚不支持，则用 wrangler D1 remote。

用法：
  python3 scripts/en-vocab-strip-usage-exam-labels.py --dry-run
  python3 scripts/en-vocab-strip-usage-exam-labels.py
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from en_vocab_fill_common import call_api, load_env_file, resolve_token  # noqa: E402

DEFAULT_API_URL = "https://finance.info-quests.com/api/en-vocab/fill-usage"
DB_NAME = "strategy-compare-db"

EXAM_LABEL_RE = re.compile(
    r"雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|ielts|toefl|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b",
    re.IGNORECASE,
)
COMPOUND_RE = re.compile(
    r"IELTS\s*[\/／、&]\s*TOEFL|TOEFL\s*[\/／、&]\s*IELTS|"
    r"雅思\s*[\/／、或和与]\s*托福|托福\s*[\/／、或和与]\s*雅思",
    re.IGNORECASE,
)
NUMBERED_LINE_RE = re.compile(r"^\s*(\d+)\s*[.、．)\]]\s*(.+)$")
HAN_RE = re.compile(r"[\u4E00-\u9FFF]")
IMAGE_LINE_RE = re.compile(r"^!\[[^\]]*\]\([^)]+\)\s*$")


def clean_line_debris(line: str) -> str:
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


def strip_exam_labels(raw: str) -> str:
    if not raw or not EXAM_LABEL_RE.search(raw):
        return raw
    text = COMPOUND_RE.sub("", raw)
    text = EXAM_LABEL_RE.sub("", text)
    lines = [clean_line_debris(ln) for ln in text.splitlines()]
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
            if not body or not HAN_RE.search(body):
                continue
            point_idx += 1
            out.append(f"{point_idx}. {body}")
            continue
        out.append(trimmed)
    return "\n".join(out)


def sql_escape(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def wrangler_d1_json(sql: str) -> list[dict]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(
            f"wrangler d1 failed ({proc.returncode}): {proc.stderr or proc.stdout}"
        )
    raw = proc.stdout.strip()
    data = json.loads(raw)
    # wrangler --json returns list of result objects
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict) and "results" in first:
            return list(first.get("results") or [])
        if isinstance(first, dict) and "result" in first:
            inner = first["result"]
            if isinstance(inner, list) and inner and isinstance(inner[0], dict):
                return list(inner[0].get("results") or [])
    if isinstance(data, dict) and "results" in data:
        return list(data.get("results") or [])
    raise SystemExit(f"unexpected wrangler json: {raw[:500]}")


def via_api(*, dry_run: bool, limit: int | None, token: str, api_url: str) -> int:
    body: dict = {"mode": "strip_exam_labels", "dry_run": dry_run}
    if limit:
        body["limit"] = limit
    try:
        resp = call_api(
            api_url,
            token,
            body,
            user_agent="en-vocab-strip-usage-exam-labels/1.0",
        )
    except Exception as err:
        print(f"[api] failed: {err}", flush=True)
        return 2

    if not resp.get("ok"):
        err = str(resp.get("error") or resp)
        if "Unauthorized" in err:
            raise SystemExit(err)
        # old deploy without mode
        print(f"[api] unsupported or error: {err}", flush=True)
        return 2

    if resp.get("mode") != "strip_exam_labels":
        print(f"[api] unexpected mode={resp.get('mode')}; fallback wrangler", flush=True)
        return 2

    updated = int(resp.get("updated") or 0)
    applied = list(resp.get("applied") or [])
    skipped = list(resp.get("skipped") or [])
    print(
        f"[api] dry_run={dry_run} updated={updated} "
        f"applied={len(applied)} skipped={len(skipped)}",
        flush=True,
    )
    for row in applied[:20]:
        preview = str(row.get("usage") or "").splitlines()[:2]
        print(f"  id={row.get('id')} word={row.get('word')!r} -> {preview}", flush=True)
    if len(applied) > 20:
        print(f"  … and {len(applied) - 20} more", flush=True)
    return 0


def via_wrangler(*, dry_run: bool, limit: int | None) -> int:
    where = """usage IS NOT NULL AND TRIM(usage) != ''
      AND (
        usage LIKE '%雅思%' OR usage LIKE '%托福%' OR usage LIKE '%四六级%'
        OR usage LIKE '%考研%' OR usage LIKE '%专四%' OR usage LIKE '%专八%'
        OR usage LIKE '%IELTS%' OR usage LIKE '%TOEFL%'
        OR usage LIKE '%ielts%' OR usage LIKE '%toefl%'
        OR usage LIKE '%GRE%' OR usage LIKE '%GMAT%' OR usage LIKE '%SAT%'
        OR usage LIKE '%CET%'
      )"""
    sql = f"SELECT id, word, usage FROM en_vocab_word WHERE {where} ORDER BY id"
    if limit:
        sql += f" LIMIT {int(limit)}"

    rows = wrangler_d1_json(sql)
    print(f"[d1] candidates={len(rows)} dry_run={dry_run}", flush=True)

    updates: list[tuple[int, str, str]] = []
    skipped = 0
    for row in rows:
        word_id = int(row["id"])
        word = str(row.get("word") or "")
        prev = str(row.get("usage") or "")
        nxt = strip_exam_labels(prev).strip()
        if not nxt:
            skipped += 1
            print(f"  skip empty_after_strip id={word_id} word={word!r}", flush=True)
            continue
        if nxt == prev.strip():
            skipped += 1
            continue
        updates.append((word_id, word, nxt))
        preview = nxt.splitlines()[:2]
        print(f"  id={word_id} word={word!r} -> {preview}", flush=True)

    if dry_run:
        print(f"[d1] dry-run would update={len(updates)} skipped={skipped}", flush=True)
        return 0

    for word_id, _word, nxt in updates:
        # one-by-one to avoid huge SQL; usage may contain newlines
        cmd_sql = (
            f"UPDATE en_vocab_word SET usage = {sql_escape(nxt)}, "
            f"updated_at = datetime('now') WHERE id = {word_id}"
        )
        wrangler_d1_json(cmd_sql)

    print(f"[d1] updated={len(updates)} skipped={skipped}", flush=True)
    return 0


def main() -> int:
    cfg = load_env_file("en-vocab-fill.env")
    parser = argparse.ArgumentParser(description="Strip exam labels from en-vocab usage")
    parser.add_argument(
        "--api-url",
        default=cfg.get("EN_VOCAB_FILL_USAGE_URL") or DEFAULT_API_URL,
    )
    parser.add_argument("--token", default=resolve_token())
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--via",
        choices=["auto", "api", "wrangler"],
        default="auto",
        help="auto: try API then wrangler",
    )
    args = parser.parse_args()
    limit = args.limit if args.limit > 0 else None

    if args.via in ("auto", "api"):
        if not args.token:
            if args.via == "api":
                raise SystemExit("缺少 JP_REVIEW_UPLOAD_TOKEN")
            print("[api] no token; try wrangler", flush=True)
        else:
            code = via_api(
                dry_run=args.dry_run,
                limit=limit,
                token=args.token,
                api_url=args.api_url,
            )
            if code == 0 or args.via == "api":
                return code

    if args.via in ("auto", "wrangler"):
        return via_wrangler(dry_run=args.dry_run, limit=limit)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
