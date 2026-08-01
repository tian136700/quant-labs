#!/usr/bin/env python3
"""Regression: jp_vocab oral/exam frequency + card meta after notes."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    freq_lib = ROOT / "src/lib/jp-vocab-frequency.ts"
    if not freq_lib.is_file():
        errors.append("missing src/lib/jp-vocab-frequency.ts")
    else:
        text = freq_lib.read_text(encoding="utf-8")
        for needle in (
            "clampJpVocabFrequency",
            "extractJpVocabFrequencyFromAiText",
            "jpVocabFrequencyPromptAppendix",
            "口语频率",
            "考试频率",
        ):
            if needle not in text:
                errors.append(f"jp-vocab-frequency.ts: missing {needle}")

    types = (ROOT / "src/lib/types.ts").read_text(encoding="utf-8")
    if "oral_frequency" not in types or "exam_frequency" not in types:
        errors.append("types.ts: JpVocabWord must include oral_frequency / exam_frequency")

    helpers = (ROOT / "src/lib/jp-vocab-db/helpers.ts").read_text(encoding="utf-8")
    if "ADD COLUMN oral_frequency" not in helpers or "ADD COLUMN exam_frequency" not in helpers:
        errors.append("helpers.ts: must ensure oral_frequency / exam_frequency columns")
    if "oral_frequency, exam_frequency" not in helpers and "oral_frequency" not in helpers:
        errors.append("helpers.ts: WORD_SELECT must include frequency columns")

    share = (ROOT / "src/lib/jp-vocab-db/share.ts").read_text(encoding="utf-8")
    if "w.oral_frequency" not in share or "w.exam_frequency" not in share:
        errors.append("share.ts SELECT must include oral/exam frequency for student cards")

    meaning_ai = (ROOT / "src/lib/jp-vocab-meaning-ai.ts").read_text(encoding="utf-8")
    if "jpVocabFrequencyPromptAppendix" not in meaning_ai:
        errors.append("meaning-ai prompt must ask for oral/exam frequency")

    usage_ai = (ROOT / "src/lib/jp-vocab-usage-ai.ts").read_text(encoding="utf-8")
    if "jpVocabFrequencyPromptAppendix" not in usage_ai:
        errors.append("usage-ai prompt must ask for oral/exam frequency")

    fill_meaning = (ROOT / "src/lib/jp-vocab-fill-meaning.ts").read_text(encoding="utf-8")
    if "oral_frequency" not in fill_meaning or "exam_frequency" not in fill_meaning:
        errors.append("fill-meaning apply must accept frequency fields")

    fill_usage = (ROOT / "src/lib/jp-vocab-fill-usage.ts").read_text(encoding="utf-8")
    if "oral_frequency" not in fill_usage or "exam_frequency" not in fill_usage:
        errors.append("fill-usage apply must accept frequency fields")

    section = ROOT / "src/components/JpVocabCourseFreqMetaSection.tsx"
    if not section.is_file():
        errors.append("missing JpVocabCourseFreqMetaSection.tsx")
    else:
        sec = section.read_text(encoding="utf-8")
        if "课数" not in sec and "JP_VOCAB_COURSE_LABEL_DISPLAY" not in sec:
            errors.append("CourseFreqMetaSection must show 课数")
        if "口语频率" not in sec and "JP_VOCAB_ORAL_FREQUENCY_LABEL" not in sec:
            errors.append("CourseFreqMetaSection must show 口语频率")

    for name in (
        "JpVocabTeacherQuizFlashcardModal.tsx",
        "JpVocabAdminReviewFlashcardModal.tsx",
    ):
        path = ROOT / "src/components" / name
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        if "JpVocabCourseFreqMetaSection" not in text:
            errors.append(f"{name}: must render JpVocabCourseFreqMetaSection")
        if "JpVocabCourseLabelSection" in text:
            errors.append(f"{name}: CourseLabel moved into CourseFreqMeta; remove old section")
        notes_i = text.find('className="jp-vocab-teacher-quiz__notes"')
        meta_i = text.find("<JpVocabCourseFreqMetaSection")
        level_i = text.find('className="jp-vocab-teacher-quiz__level"')
        stats_i = text.find('className="jp-vocab-teacher-quiz__stats"')
        after = level_i if level_i >= 0 else stats_i
        if meta_i < 0 or notes_i < 0 or after < 0:
            errors.append(f"{name}: could not locate notes/meta/level-or-stats markers")
        elif not (notes_i < meta_i < after):
            errors.append(f"{name}: CourseFreqMeta must be after notes and before level/stats")

    py_lib = ROOT / "scripts/lib/jp_vocab_frequency.py"
    if not py_lib.is_file():
        errors.append("missing scripts/lib/jp_vocab_frequency.py")

    meaning_py = (ROOT / "scripts/jp-vocab-fill-meaning-api.py").read_text(encoding="utf-8")
    if "extract_jp_vocab_frequencies" not in meaning_py:
        errors.append("meaning-api.py must extract frequencies from AI text")

    grammar_py = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    if "extract_jp_vocab_frequencies" not in grammar_py:
        errors.append("grammar-usage-api.py must extract frequencies from AI text")

    rule = ROOT / ".cursor/rules/jp-vocab-course-freq-meta.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-vocab-course-freq-meta.mdc")

    if errors:
        print("FAIL: jp-vocab course/freq meta")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("ok: jp-vocab course_label + oral/exam frequency (card after notes + AI)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
