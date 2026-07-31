#!/usr/bin/env python3
"""回归：今日英语单词 shared 热路径禁止 ensureVocabWordSchema / 全表 TRIM（手机冷启动 1102）。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    share = (ROOT / "src/lib/en-vocab-db/share.ts").read_text(encoding="utf-8")
    daily = (ROOT / "src/lib/en-vocab-db/daily_settings.ts").read_text(
        encoding="utf-8"
    )
    helpers = (ROOT / "src/lib/en-vocab-db/helpers.ts").read_text(encoding="utf-8")
    study = (ROOT / "src/components/EnVocabStudyPage.tsx").read_text(
        encoding="utf-8"
    )
    page = (ROOT / "src/app/en-vocab/study/page.tsx").read_text(encoding="utf-8")

    q = share.split("export async function queryEnVocabSharedToday", 1)
    if len(q) < 2:
        errors.append("queryEnVocabSharedToday missing")
    else:
        body = q[1].split("export async function ", 1)[0]
        if "ensureVocabWordSchema(" in body:
            errors.append(
                "queryEnVocabSharedToday must not call ensureVocabWordSchema (cold 1102)"
            )
        if "seedIfEmpty" in body:
            errors.append("queryEnVocabSharedToday must not call seedIfEmpty")
        if "has_class_notes" not in body:
            errors.append("shared list must use has_class_notes flag")
        if re.search(r"\bw\.class_notes\b", body) and "has_class_notes" in body:
            # SELECT w.class_notes body is forbidden; flag CASE is ok
            select = body.split(".prepare(", 1)
            if len(select) >= 2:
                sql = select[1].split("`", 2)[1] if "`" in select[1] else select[1]
                stripped = (
                    sql.replace("has_class_notes", "")
                    .replace("class_notes IS NOT NULL", "")
                )
                if "w.class_notes" in stripped or ", w.class_notes" in stripped:
                    errors.append("shared SELECT must not read class_notes body")

    c = daily.split("export async function countEnVocabTodayCheckedWords", 1)
    if len(c) < 2:
        errors.append("countEnVocabTodayCheckedWords missing")
    else:
        body = c[1].split("export async function ", 1)[0]
        if "ensureVocabWordSchema(" in body:
            errors.append(
                "countEnVocabTodayCheckedWords must not call ensureVocabWordSchema"
            )

    ensure = helpers.split("export async function ensureVocabWordSchema", 1)
    if len(ensure) < 2:
        errors.append("ensureVocabWordSchema missing")
    else:
        body = ensure[1].split("export async function ensureEnVocabWordSchema", 1)[0]
        if "hadCategory" not in body or "hadUploadSource" not in body:
            errors.append(
                "ensureVocabWordSchema must gate TRIM backfill on newly-added columns"
            )

    if 'dynamic = "force-static"' not in page and "force-static" not in page:
        errors.append("en-vocab/study page must remain force-static")

    if "setTimeout" not in study or "fetchShared" not in study:
        errors.append(
            "EnVocabStudyPage loadShared should retry once on 500/503 (mobile cold 1102)"
        )

    if errors:
        print("check_en_vocab_study_shared_1102 FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_study_shared_1102 OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
