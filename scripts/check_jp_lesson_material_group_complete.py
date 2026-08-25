#!/usr/bin/env python3
"""回归：日语新课共用教材 material_group_id — 挂图写组、完成级联、多课分片 sync。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    types = (ROOT / "src/lib/types.ts").read_text(encoding="utf-8")
    lesson_db = (ROOT / "src/lib/jp-lesson-db.ts").read_text(encoding="utf-8")
    group = (ROOT / "src/lib/jp-lesson-material-group.ts").read_text(
        encoding="utf-8"
    )
    attach = (ROOT / "src/lib/jp-lesson-ref-attach.ts").read_text(
        encoding="utf-8"
    )
    attach_batch = (
        ROOT / "src/app/api/jp-lesson/ref/attach-batch/route.ts"
    ).read_text(encoding="utf-8")
    route = (ROOT / "src/app/api/jp-lesson/route.ts").read_text(encoding="utf-8")
    client = (
        ROOT / "src/components/jp-lesson-page/runJpLessonVocabSyncChunks.ts"
    ).read_text(encoding="utf-8")
    actions = (
        ROOT / "src/components/jp-lesson-page/useJpLessonPageActions.ts"
    ).read_text(encoding="utf-8")
    api_doc = (ROOT / "docs/jp-lesson-api.txt").read_text(encoding="utf-8")
    batch_doc = (ROOT / "docs/jp-lesson-ref-attach-batch-api.txt").read_text(
        encoding="utf-8"
    )
    feature_index = (ROOT / "docs/feature-index.md").read_text(encoding="utf-8")
    rule = (
        ROOT / ".cursor/rules/jp-lesson-complete-vocab-sync-chunked.mdc"
    ).read_text(encoding="utf-8")

    if "material_group_id" not in types:
        errors.append("JpLessonRecord must include material_group_id")
    if "material_group_id" not in lesson_db or "ALTER TABLE jp_lesson ADD COLUMN material_group_id" not in lesson_db:
        errors.append("jp-lesson-db must migrate material_group_id")
    if "listJpLessonsByMaterialGroup" not in group:
        errors.append("material-group must export listJpLessonsByMaterialGroup")
    if "assignJpLessonsMaterialGroup" not in group:
        errors.append("material-group must export assignJpLessonsMaterialGroup")
    if "updateJpLessonProgressWithMaterialGroup" not in group:
        errors.append(
            "material-group must export updateJpLessonProgressWithMaterialGroup"
        )
    if "assignJpLessonsMaterialGroup" not in attach:
        errors.append("single attach must assign singleton material_group_id when missing")
    if "assignJpLessonsMaterialGroup" not in attach_batch:
        errors.append("attach-batch must assign shared material_group_id")
    if "material_group_id" not in attach_batch:
        errors.append("attach-batch response must include material_group_id")
    if "updateJpLessonProgressWithMaterialGroup" not in route:
        errors.append("POST progress must use updateJpLessonProgressWithMaterialGroup")
    if "vocab_syncs" not in route or "sibling_lesson_ids" not in route:
        errors.append("progress response must include vocab_syncs and sibling_lesson_ids")
    if "runJpLessonMaterialGroupVocabSyncs" not in client:
        errors.append("client must define runJpLessonMaterialGroupVocabSyncs")
    if "runJpLessonMaterialGroupVocabSyncs" not in actions:
        errors.append("useJpLessonPageActions must call runJpLessonMaterialGroupVocabSyncs")
    if "revertMaterialGroupProgress" not in actions:
        errors.append("sync failure must revertMaterialGroupProgress")
    if "vocab_syncs" not in actions:
        errors.append("client must read vocab_syncs from progress response")
    if "material_group_id" not in api_doc or "vocab_syncs" not in api_doc:
        errors.append("docs/jp-lesson-api.txt must document material_group cascade")
    if "material_group_id" not in batch_doc:
        errors.append(
            "docs/jp-lesson-ref-attach-batch-api.txt must document material_group_id"
        )
    if "material_group_id" not in feature_index:
        errors.append("feature-index must mention material_group_id")
    if "material_group_id" not in rule:
        errors.append("jp-lesson-complete-vocab-sync-chunked.mdc must cover material group")
    # 禁止用 course_group_id 当教材组写进完成级联
    if "course_group_id" in group and "material_group_id" not in group:
        errors.append("cascade must key off material_group_id not only course_group_id")
    if "listJpLessonsByMaterialGroup" in group and 'course_group_id = ?' in group:
        errors.append("listByGroup must not filter by course_group_id")

    # 部署曾炸：Actions 用类型却未 import；EnLessonRecord 继承 Jp 字段却漏 map
    if "type JpLessonVocabSyncProgress" not in actions:
        errors.append(
            "useJpLessonPageActions must import type JpLessonVocabSyncProgress "
            "from runJpLessonVocabSyncChunks"
        )
    en_db = (ROOT / "src/lib/en-lesson-db.ts").read_text(encoding="utf-8")
    en_sched = (ROOT / "src/lib/en-lesson-schedule-list.ts").read_text(
        encoding="utf-8"
    )
    if en_db.count("material_group_id") < 3:
        errors.append(
            "en-lesson-db mapRow/seed/create must set material_group_id "
            "(EnLessonRecord extends JpLessonRecord)"
        )
    if "material_group_id" not in en_sched:
        errors.append(
            "en-lesson-schedule-list mapScheduleRow must set material_group_id"
        )

    if errors:
        print("check_jp_lesson_material_group_complete FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_jp_lesson_material_group_complete OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
