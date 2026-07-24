#!/usr/bin/env python3
"""Regression: en-vocab usage fill/UI must not surface exam brand labels."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 存库正文 / UI 面向用户处禁止（与 en-vocab-usage-ai.ts 一致）
EXAM_LABEL_RE = re.compile(
    r"雅思|托福|四六级|考研|专四|专八|IELTS|TOEFL|\bCET\b|\bGRE\b|\bGMAT\b|\bSAT\b",
    re.IGNORECASE,
)


def read(rel: str) -> str:
    path = ROOT / rel
    if rel == "src/lib/en-vocab-db.ts":
        parts = [path.read_text(encoding="utf-8")] if path.is_file() else []
        db_dir = ROOT / "src/lib/en-vocab-db"
        if db_dir.is_dir():
            for p in sorted(db_dir.glob("*.ts")):
                parts.append(p.read_text(encoding="utf-8"))
        return "\n".join(parts)
    return path.read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def assert_no_exam_label(label: str, text: str) -> None:
    if EXAM_LABEL_RE.search(text):
        fail(f"{label} must not contain exam brand labels")


def main() -> None:
    ai = read("src/lib/en-vocab-usage-ai.ts")
    if "EN_VOCAB_USAGE_EXAM_LABEL_RE" not in ai:
        fail("missing EN_VOCAB_USAGE_EXAM_LABEL_RE")
    if "shieldEnVocabUsageUploadText" not in ai:
        fail("missing shieldEnVocabUsageUploadText (upload must strip exam labels)")
    if "enVocabUsageHasExamLabel" not in ai:
        fail("missing enVocabUsageHasExamLabel")
    if "stripEnVocabUsageExamLabels" not in ai:
        fail("missing stripEnVocabUsageExamLabels")
    if "formatEnVocabUsageForDisplay" not in ai:
        fail("missing formatEnVocabUsageForDisplay")
    if "${pointIdx}.用法：" not in ai and "${pointIdx}.用法" not in ai:
        fail("display format must use Arabic 1.用法 style")
    # 上传是屏蔽剥词，不是整段拒收
    if "exam_label_forbidden" in ai and "reject_reasons" in ai:
        # reject_reasons 数组里不应再列 exam_label_forbidden
        m_rej = re.search(r"reject_reasons:\s*\[([\s\S]*?)\]", ai)
        if m_rej and "exam_label_forbidden" in m_rej.group(1):
            fail("upload should strip exam labels, not reject with exam_label_forbidden")

    # format_example 会进 upload_spec，不能带考试标签
    m = re.search(r'format_example:\s*\n?\s*"((?:\\.|[^"\\])*)"', ai)
    if not m:
        fail("format_example not found in en-vocab-usage-ai.ts")
    format_example = bytes(m.group(1), "utf-8").decode("unicode_escape")
    assert_no_exam_label("format_example", format_example)

    # 正向样例不得带考试标签口吻
    if "IELTS/TOEFL 写作与阅读中常考" in ai or "IELTS/TOEFL 常考" in ai:
        fail("prompt/format positive samples must not include IELTS/TOEFL phrasing")
    if "常用于描述位置关系" not in ai:
        fail("expected clean usage example phrase missing")

    edit = read("src/components/EnVocabEditModal.tsx")
    # 用法字段附近（placeholder + hint）
    usage_block = edit.split('htmlFor="en-vocab-edit-usage"')[1].split(
        'htmlFor="en-vocab-edit-notes"'
    )[0]
    assert_no_exam_label("EnVocabEditModal usage field", usage_block)

    page = read("src/components/EnVocabPage.tsx")
    if 'title="雅思/托福常用用法"' in page:
        fail("EnVocabPage usage column title must not say 雅思/托福")

    py = read("scripts/en-vocab-fill-usage-api.py")
    if "shield_usage_upload" not in py:
        fail("Python fill-usage must shield_usage_upload (strip, not reject)")
    if 'return None, "exam_label_forbidden"' in py:
        fail("Python fill-usage must not reject exam_label_forbidden; strip instead")
    # 兜底 prompt 正向样例
    if "请列出 IELTS/TOEFL 相关用法" in py:
        fail("Python fallback prompt must not ask to list IELTS/TOEFL-labeled usage")

    fill = read("src/lib/en-vocab-fill-usage.ts")
    if "stripEnVocabUsageExamLabelsInDb" not in fill:
        fail("missing stripEnVocabUsageExamLabelsInDb")
    if "shieldEnVocabUsageUploadText" not in fill:
        fail("apply path must call shieldEnVocabUsageUploadText")
    route = read("src/app/api/en-vocab/fill-usage/route.ts")
    if 'strip_exam_labels' not in route:
        fail("fill-usage API must support mode strip_exam_labels")

    db = read("src/lib/en-vocab-db.ts")
    if "shieldEnVocabUsageUploadText" not in db:
        fail("edit save must shield usage via shieldEnVocabUsageUploadText")

    modal = read("src/components/EnVocabUsageViewModal.tsx")
    if "EnVocabUsageExamplesPairedContent" not in modal:
        fail("EnVocabUsageViewModal must use paired usage+examples content")
    if "buildEnVocabUsageExamplePairs" not in modal:
        fail("EnVocabUsageViewModal must build usage/example pairs for display")
    # 配对链路内会走 formatEnVocabUsageForDisplay（fallback）
    display = read("src/lib/en-vocab-usage-examples-display.ts")
    if "formatEnVocabUsageForDisplay" not in display:
        fail("paired display must still format usage via formatEnVocabUsageForDisplay")

    strip_script = ROOT / "scripts" / "en-vocab-strip-usage-exam-labels.py"
    if not strip_script.is_file():
        fail("missing scripts/en-vocab-strip-usage-exam-labels.py")

    print("OK: en-vocab usage upload shields exam labels + display wired")


if __name__ == "__main__":
    main()
