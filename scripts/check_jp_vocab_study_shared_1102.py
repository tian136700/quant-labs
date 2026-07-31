#!/usr/bin/env python3
"""回归：今日日语单词 — shared 热路径轻量 + study 页 force-static（整页 1102）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    study = (ROOT / "src/components/JpVocabStudyPage.tsx").read_text(
        encoding="utf-8"
    )
    page = (ROOT / "src/app/jp-vocab/study/page.tsx").read_text(encoding="utf-8")
    traffic = (ROOT / "src/lib/worker-traffic-path.ts").read_text(encoding="utf-8")

    q = share.split("export async function queryJpVocabSharedToday", 1)
    if len(q) < 2:
        errors.append("queryJpVocabSharedToday missing")
    else:
        body = q[1].split("export async function ", 1)[0]
        if "ensureVocabWordSchema(" in body:
            errors.append(
                "queryJpVocabSharedToday must not call ensureVocabWordSchema (cold 1102)"
            )
        if "seedIfEmpty" in body:
            errors.append("queryJpVocabSharedToday must not call seedIfEmpty")
        if "has_class_notes" not in body:
            errors.append("shared list must use has_class_notes flag")
        select = body.split(".prepare(", 1)
        if len(select) >= 2 and "`" in select[1]:
            sql = select[1].split("`", 2)[1]
            stripped = (
                sql.replace("has_class_notes", "")
                .replace("class_notes IS NOT NULL", "")
            )
            if re.search(r"\bw\.class_notes\b", stripped):
                errors.append("shared SELECT must not read class_notes body")

    c = share.split("export async function countJpVocabTodayCheckedWords", 1)
    if len(c) < 2:
        errors.append("countJpVocabTodayCheckedWords missing")
    else:
        body = c[1].split("export async function ", 1)[0]
        if "ensureVocabWordSchema(" in body:
            errors.append(
                "countJpVocabTodayCheckedWords must not call ensureVocabWordSchema"
            )

    if 'dynamic = "force-static"' not in page and "force-static" not in page:
        errors.append("jp-vocab/study page must remain force-static")

    if "fetchShared" not in study or "setTimeout" not in study:
        errors.append(
            "JpVocabStudyPage loadShared should retry once on 500/503 (mobile cold 1102)"
        )

    if '"/jp-vocab/study"' not in traffic or "PAGE_HTML_TRAFFIC_SKIP" not in traffic:
        errors.append(
            "worker-traffic-path must skip /jp-vocab/study HTML traffic "
            "(avoid waitUntil D1 during page cold render → 1102)"
        )

    if errors:
        print("check_jp_vocab_study_shared_1102 FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_vocab_study_shared_1102 OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
