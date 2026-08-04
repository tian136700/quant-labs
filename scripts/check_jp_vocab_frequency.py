#!/usr/bin/env python3
"""Regression: jp_vocab oral/exam frequency + card meta after notes."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []

    # 解析须接受模型常写的「8/10」、短标签、同行、JSON（曾导致 word_ai_incomplete）
    sys.path.insert(0, str(ROOT / "scripts" / "lib"))
    from jp_vocab_frequency import extract_jp_vocab_frequencies  # noqa: E402

    parse_cases = [
        ("【出现频率】\n口语频率：8\n考试频率：6", 8, 6),
        ("【出现频率】\n口语频率：8/10\n考试频率：6/10", 8, 6),
        ("口语：8\n考试：7", 8, 7),
        ("口语频率：8 考试频率：6", 8, 6),
        ('{"oral_frequency": 9, "exam_frequency": 5}', 9, 5),
        ("- 口语频率：8\n- 考试频率：6", 8, 6),
        ("口语频率 8\n考试频率 6", 8, 6),
    ]
    for raw, want_o, want_e in parse_cases:
        _, got_o, got_e = extract_jp_vocab_frequencies(raw)
        if got_o != want_o or got_e != want_e:
            errors.append(
                f"extract_jp_vocab_frequencies failed for {raw!r}: "
                f"got oral={got_o} exam={got_e}, want {want_o}/{want_e}"
            )

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
            "/\\s*10",  # 须接受 8/10
            "SAME_LINE_RE",
            "frequenciesFromJsonBlob",
            "禁止写成 8/10",
        ):
            if needle not in text:
                errors.append(f"jp-vocab-frequency.ts: missing {needle}")

    online_py = (ROOT / "scripts/jp-vocab-fill-frequency-online-api.py").read_text(
        encoding="utf-8"
    )
    if "freq-parse-retry" not in online_py and "attempt == 0" not in online_py:
        errors.append(
            "frequency-online-api generate_word_freq must retry once on incomplete parse"
        )
    if "禁止写成 n/10" not in online_py and "不要带 /10" not in online_py:
        errors.append("frequency-online-api WORD_SYSTEM must forbid /10 suffix")

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
        if "need_related_compounds" not in ff:
            errors.append(f"jp-vocab-fill-frequency.ts: missing need_related_compounds")
        if "wordNeedsRelatedCompoundsForFrequency" not in ff:
            errors.append(
                "jp-vocab-fill-frequency.ts: must use wordNeedsRelatedCompoundsForFrequency "
                "(body empty → need related; ignore empty source mark)"
            )
        if "中文｜词性" not in ff and "｜词性" not in ff:
            errors.append(
                "jp-vocab-fill-frequency.ts: frequency+related prompt must require ｜词性"
            )
        if "related_compounds_source" in ff and "wordNeedsRelatedCompoundsForFrequency" in ff:
            # ensure frequency helper does not gate on source
            # (source-based skip lives only in related-only queue)
            pass
        for needle in (
            "listJpVocabMissingFrequency",
            "applyJpVocabFrequencyUpdates",
            "need_usage_frequency",
            "need_related_compounds",
            "buildJpVocabWordFrequencyWithRelatedAiPrompt",
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

    online_batch = ROOT / "scripts/jp-vocab-fill-online-batch-api.py"
    if not online_batch.is_file():
        errors.append("missing jp-vocab-fill-online-batch-api.py")
    else:
        ob = online_batch.read_text(encoding="utf-8")
        if "oral_frequency" not in ob or "exam_frequency" not in ob:
            errors.append(
                "online-batch must generate/apply oral_frequency + exam_frequency "
                "with other word fields (persistent unified cron)"
            )
        if "clamp_freq" not in ob:
            errors.append("online-batch must clamp oral/exam frequency 1～10")

    fixed = ROOT / "scripts/lib/jp_vocab_online_batch_fixed.py"
    if fixed.is_file():
        ft = fixed.read_text(encoding="utf-8")
        if "WORD_FREQUENCY_KEYS" not in ft:
            errors.append("jp_vocab_online_batch_fixed must define WORD_FREQUENCY_KEYS")
        if "need_oral_frequency" not in ft:
            errors.append("merge_needs must honor need_oral_frequency")

    online_py = ROOT / "scripts/jp-vocab-fill-frequency-online-api.py"
    if not online_py.is_file():
        errors.append("missing jp-vocab-fill-frequency-online-api.py")
    else:
        op = online_py.read_text(encoding="utf-8")
        if "after_attempt(" not in op:
            errors.append("frequency-online-api must call after_attempt")
        if "fixed=True" not in op or "fixed=False" not in op:
            errors.append(
                "frequency-online-api after_attempt must use fixed=True/False "
                "(not legacy ok=)"
            )
        if "ok=True" in op or "ok=False" in op:
            # allow only if not inside after_attempt kwargs — ban obvious legacy kwargs
            if "ok=False,\n            reason=" in op or "ok=True,\n            reason=" in op:
                errors.append(
                    "frequency-online-api must not pass ok=/reason= to after_attempt"
                )
        if "EXAMPLES_API_URL" not in op or "need_related" not in op:
            errors.append(
                "frequency-online-api must piggyback related_compounds "
                "(EXAMPLES_API_URL + need_related)"
            )
        if "【相关构词】" not in op:
            errors.append("frequency-online-api must ask for 【相关构词】 block when needed")
        if "中文｜词性" not in op and "｜词性" not in op:
            errors.append(
                "frequency-online-api must require ｜词性 on related compounds "
                "(ask AI + write back for card display)"
            )
        if "_normalize_related_line_pos_sep" not in op:
            errors.append(
                "frequency-online-api must normalize related line POS sep "
                "(| → ｜) before apply"
            )
        if "会社員" not in op and "店員" not in op:
            errors.append(
                "frequency-online-api WORD_SYSTEM should mention multi-kanji decomp "
                "(会社員/店員)"
            )
        # 维护中心读 applied，不读 applied_keys → 否则「补全内容」只剩任务名
        if "applied_keys" in op.split("report_word_run")[-1][:400]:
            errors.append(
                "frequency-online-api must report applied= (not applied_keys=) "
                "so 补全内容 shows 口语频率/相关构词"
            )
        if 'report_word_run' in op:
            # success 终态须带 applied 字段
            success_chunk = op
            if '"applied": applied' not in success_chunk and '"applied":applied' not in success_chunk:
                # also accept "applied": applied_keys renamed — must be key name applied
                if not any(
                    x in success_chunk
                    for x in ('"applied": applied', '"applied":applied', '"applied": (')
                ):
                    errors.append(
                        "frequency-online-api success report_word_run must include applied="
                    )
        if "need_related = kind != \"grammar\" and has_kanji" not in op and "need_related = kind != 'grammar' and has_kanji" not in op:
            # allow either quote style / with spaces
            if "has_kanji" not in op or "need_related = kind != \"grammar\" and has_kanji" not in op.replace("'", '"'):
                if not (
                    "has_kanji" in op
                    and "need_related" in op
                    and "grammar" in op
                    and "【相关构词】" in op
                ):
                    errors.append(
                        "frequency-online-api must force need_related for every "
                        "kanji word (ignore empty related_compounds_source mark)"
                    )

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
