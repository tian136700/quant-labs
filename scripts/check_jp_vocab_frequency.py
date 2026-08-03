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
    # 语法：按用法 [口语n|考试m]；勿再要求词级【出现频率】附录
    if "jpVocabUsagePerUsageFrequencyPromptAppendix" not in usage_ai:
        errors.append("usage-ai prompt must ask for per-usage oral/exam frequency")
    if "wordForFreq" not in usage_ai:
        errors.append(
            "usage-ai: use wordForFreq before jpVocabGrammarNeedsPerUsageFrequency "
            "(input may be undefined — deploy type error)"
        )
    if "missing_frequency" not in usage_ai:
        errors.append("usage-ai validate must reject missing_frequency for normal grammar")

    notes_fields = (ROOT / "src/lib/jp-vocab-db/notes_fields.ts").read_text(
        encoding="utf-8"
    )
    # prevUsage 须提在 if 外（809 曾因块内声明 → 块外使用导致 Type error）
    nu = notes_fields.find("const nextUsage =")
    pu = notes_fields.find("const prevUsage = current.usage ?? null;")
    use_pu = notes_fields.find(
        "jpVocabUsageHasCompletePerUsageFrequency(prevUsage)"
    )
    if nu < 0 or pu < 0 or use_pu < 0 or not (nu < pu < use_pu):
        errors.append(
            "notes_fields.ts: hoist const prevUsage next to nextUsage "
            "(must not declare only inside if input.usage)"
        )

    usage_freq = ROOT / "src/lib/jp-vocab-usage-frequency.ts"
    if not usage_freq.is_file():
        errors.append("missing src/lib/jp-vocab-usage-frequency.ts")
    else:
        uf = usage_freq.read_text(encoding="utf-8")
        for needle in (
            "extractJpVocabUsageLineFrequency",
            "formatJpVocabUsageFrequencyDisplay",
            "口语",
            "/10",
        ):
            if needle not in uf:
                errors.append(f"jp-vocab-usage-frequency.ts: missing {needle}")

    paired = (
        ROOT / "src/components/JpVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    if "jp-usage-ex-paired-freq" not in paired:
        errors.append("UsageExamplesPairedContent must render per-usage freq line")
    if "JpVocabUsageFrequencyBars" not in paired:
        errors.append(
            "UsageExamplesPairedContent must use JpVocabUsageFrequencyBars "
            "(progress bars; not plain text)"
        )
    bars = ROOT / "src/components/JpVocabUsageFrequencyBars.tsx"
    if not bars.is_file():
        errors.append("missing JpVocabUsageFrequencyBars.tsx")
    else:
        bt = bars.read_text(encoding="utf-8")
        if "口语频率" not in bt and "JP_VOCAB_ORAL_FREQUENCY_LABEL" not in bt:
            errors.append("FrequencyBars must show full 口语频率 label")
        if "考试频率" not in bt and "JP_VOCAB_EXAM_FREQUENCY_LABEL" not in bt:
            errors.append("FrequencyBars must show full 考试频率 label")
        if "score / 10" not in bt and "/ 10" not in bt:
            errors.append("FrequencyBars width must be score/10 (7 → 70%)")
        if "jp-usage-ex-paired-freq-fill" not in bt:
            errors.append("FrequencyBars must include fill class styles (self-contained)")
        if "var(--accent" not in bt:
            errors.append("FrequencyBars fill must use solid --accent (visible on dark)")
        if "75%, transparent" in bt or "82%, var(--text)" in bt:
            errors.append("FrequencyBars fill must not use high-transparency color-mix")
    if "jp-usage-ex-paired-freq-fill" not in paired and "JpVocabUsageFrequencyBars" not in paired:
        errors.append("UsageExamplesPairedContent must render FrequencyBars / freq-fill")
    en_paired = (
        ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
    ).read_text(encoding="utf-8")
    if "en-usage-ex-paired-freq-fill" not in en_paired:
        errors.append("EN UsageExamplesPairedContent must style freq-fill")
    if "var(--accent" not in en_paired:
        errors.append("EN freq-fill must use solid --accent")
    if "{score}/10" not in en_paired and "score}/10" not in en_paired:
        errors.append("EN frequency score must show n/10")
    flash_styles = (
        ROOT / "src/components/JpVocabTeacherQuizFlashcardStyles.tsx"
    ).read_text(encoding="utf-8")
    if "meta-freq-fill" not in flash_styles:
        errors.append("flashcard styles must include meta-freq-fill")
    if "var(--accent, #3b82f6)" not in flash_styles:
        errors.append("meta-freq-fill must use solid accent (not only transparent mix)")
    # 纯文案 helper 仍保留（复制/无 UI 场景）
    if "formatJpVocabUsageFrequencyDisplay" not in (
        ROOT / "src/lib/jp-vocab-usage-frequency.ts"
    ).read_text(encoding="utf-8"):
        errors.append("usage-frequency.ts must keep formatJpVocabUsageFrequencyDisplay")

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
        if 'kind === "grammar"' not in sec and 'trim() === "grammar"' not in sec:
            errors.append(
                "CourseFreqMetaSection must hide word-level freq for grammar cards"
            )

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
        if "kind={w.kind}" not in text:
            errors.append(f"{name}: CourseFreqMeta must receive kind={{w.kind}}")
        examples_i = text.find('className="jp-vocab-teacher-quiz__examples"')
        if examples_i < 0:
            examples_i = text.find("<JpVocabUsageExamplesPairedContent")
        notes_i = text.find("<JpVocabFlashcardNotesSection")
        if notes_i < 0:
            notes_i = text.find('className="jp-vocab-teacher-quiz__notes"')
        meta_i = text.find("<JpVocabCourseFreqMetaSection")
        level_i = text.find('className="jp-vocab-teacher-quiz__level"')
        stats_i = text.find('className="jp-vocab-teacher-quiz__stats"')
        after = level_i if level_i >= 0 else stats_i
        if meta_i < 0 or notes_i < 0 or after < 0:
            errors.append(f"{name}: could not locate notes/meta/level-or-stats markers")
        elif not (examples_i < meta_i < notes_i < after):
            errors.append(
                f"{name}: CourseFreqMeta must be after examples and before notes "
                "(more forward than notes)"
            )

    if "buildJpVocabWordFrequencyOnlyAiPrompt" not in (
        ROOT / "src/lib/jp-vocab-frequency.ts"
    ).read_text(encoding="utf-8"):
        errors.append("jp-vocab-frequency.ts: missing buildJpVocabWordFrequencyOnlyAiPrompt")

    fill_freq = ROOT / "src/lib/jp-vocab-fill-frequency.ts"
    if not fill_freq.is_file():
        errors.append("missing src/lib/jp-vocab-fill-frequency.ts")
    else:
        ff = fill_freq.read_text(encoding="utf-8")
        for needle in (
            "listJpVocabMissingFrequency",
            "applyJpVocabFrequencyUpdates",
            "need_usage_frequency",
        ):
            if needle not in ff:
                errors.append(f"jp-vocab-fill-frequency.ts: missing {needle}")

    route = ROOT / "src/app/api/jp-vocab/fill-frequency/route.ts"
    if not route.is_file():
        errors.append("missing fill-frequency/route.ts")

    if "fill-frequency" not in (
        ROOT / "src/lib/worker-api-rate-limit.ts"
    ).read_text(encoding="utf-8"):
        errors.append("worker-api-rate-limit.ts must list /api/jp-vocab/fill-frequency")

    if "/10" not in (
        ROOT / "src/components/JpVocabCourseFreqMetaSection.tsx"
    ).read_text(encoding="utf-8"):
        errors.append("CourseFreqMetaSection must display score as n/10")

    py_lib = ROOT / "scripts/lib/jp_vocab_frequency.py"
    if not py_lib.is_file():
        errors.append("missing scripts/lib/jp_vocab_frequency.py")

    meaning_py = (ROOT / "scripts/jp-vocab-fill-meaning-api.py").read_text(encoding="utf-8")
    if "extract_jp_vocab_frequencies" not in meaning_py:
        errors.append("meaning-api.py must extract frequencies from AI text")

    grammar_py = (
        ROOT / "scripts/jp-vocab-fill-grammar-usage-examples-api.py"
    ).read_text(encoding="utf-8")
    if (
        "extract_jp_vocab_frequencies" not in grammar_py
        and "[口语" not in grammar_py
        and "oral" not in grammar_py.lower()
    ):
        errors.append(
            "grammar-usage-api.py should handle frequency "
            "(word-level extract or per-usage markers)"
        )

    rule = ROOT / ".cursor/rules/jp-vocab-course-freq-meta.mdc"
    if not rule.is_file():
        errors.append("missing .cursor/rules/jp-vocab-course-freq-meta.mdc")

    py_api = ROOT / "scripts/jp-vocab-fill-frequency-online-api.py"
    if not py_api.is_file():
        errors.append("missing scripts/jp-vocab-fill-frequency-online-api.py")

    stage = ROOT / "scripts/jp-vocab-fill-frequency-online-stage.sh"
    if not stage.is_file():
        errors.append("missing scripts/jp-vocab-fill-frequency-online-stage.sh")

    setup = ROOT / "scripts/setup-jp-vocab-fill-frequency-online-mac.sh"
    if not setup.is_file():
        errors.append("missing setup-jp-vocab-fill-frequency-online-mac.sh")

    registry = (
        ROOT / "scripts/maintenance_center/cron_tasks/registry.py"
    ).read_text(encoding="utf-8")
    if "jp-vocab-fill-frequency-online" not in registry:
        errors.append("registry.py must register jp-vocab-fill-frequency-online")
    if '"口语频率"' not in registry and "口语频率" not in registry:
        # fill_content may use Chinese labels
        if "_fill(" not in registry or "考试频率" not in registry:
            errors.append(
                "registry frequency task must fill_content include 口语频率/考试频率"
            )

    breaker = (ROOT / "scripts/lib/vocab_fill_circuit_breaker.py").read_text(
        encoding="utf-8"
    )
    if "jp-vocab-fill-frequency-online" not in breaker:
        errors.append("circuit breaker FILL_TASKS must include frequency temp cron")

    docs = ROOT / "docs/jp-vocab-fill-frequency-api.txt"
    if not docs.is_file():
        errors.append("missing docs/jp-vocab-fill-frequency-api.txt")

    if errors:
        print("FAIL: jp-vocab course/freq meta")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(
        "ok: jp-vocab course_label + oral/exam frequency "
        "(word-level for words; per-usage for grammar; temp fill-frequency cron)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
