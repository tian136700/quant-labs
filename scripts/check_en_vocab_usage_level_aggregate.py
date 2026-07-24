#!/usr/bin/env python3
"""Regression: en-vocab per-usage familiarity aggregate + wiring guards."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

RANK = {"weak": 0, "normal": 1, "very": 2}
RANK_TO = ("weak", "normal", "very")


def read_en_vocab_db() -> str:
    db = ROOT / "src/lib/en-vocab-db.ts"
    parts = [db.read_text(encoding="utf-8")] if db.is_file() else []
    db_dir = ROOT / "src/lib/en-vocab-db"
    if db_dir.is_dir():
        for p in sorted(db_dir.glob("*.ts")):
            parts.append(p.read_text(encoding="utf-8"))
    return "\n".join(parts)


def combine(a: str, b: str) -> str:
    if a == "normal" and b == "normal":
        return "weak"
    if (a == "very" and b == "weak") or (a == "weak" and b == "very"):
        return "normal"
    return RANK_TO[min(RANK[a], RANK[b])]


def aggregate(levels: list[str]) -> str:
    if not levels:
        raise ValueError("empty")
    acc = levels[0]
    for cur in levels[1:]:
        acc = combine(acc, cur)
    return acc


def must_contain(path: pathlib.Path, needles: list[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [n for n in needles if n not in text]


def main() -> int:
    errors: list[str] = []

    # Truth table (must match src/lib/en-vocab-review.ts)
    cases = [
        (("very", "very"), "very"),
        (("very", "normal"), "normal"),
        (("very", "weak"), "normal"),
        (("normal", "normal"), "weak"),
        (("normal", "weak"), "weak"),
        (("weak", "weak"), "weak"),
        (("normal", "very"), "normal"),
        (("weak", "very"), "normal"),
        (("weak", "normal"), "weak"),
        (("very",), "very"),
        (("very", "normal", "weak"), "weak"),  # very+normal=normal; normal+weak=weak
        (("very", "very", "very"), "very"),
        (("normal", "normal", "normal"), "weak"),
    ]
    for levels, expected in cases:
        got = aggregate(list(levels))
        if got != expected:
            errors.append(f"aggregate{levels!r} -> {got!r}, expected {expected!r}")

    review = ROOT / "src/lib/en-vocab-review.ts"
    if not review.is_file():
        errors.append(f"missing {review.relative_to(ROOT)}")
    else:
        for n in [
            "export function combineEnVocabUsageLevels",
            "export function aggregateEnVocabUsageLevels",
            "export function parseEnVocabLastUsageLevels",
            "export function findFirstIncompleteEnVocabUsageLevelIndex",
            "export function listIncompleteEnVocabUsageLevelIndices",
            "export function formatEnVocabUncheckedUsagesHint",
            "export function areEnVocabUsageLevelsComplete",
            "export function resolveEnVocabUsageDraftLevels",
            'if (a === "normal" && b === "normal") return "weak"',
        ]:
            if n not in review.read_text(encoding="utf-8"):
                errors.append(f"en-vocab-review.ts: missing {n!r}")

    # resolveEnVocabUsageDraftLevels：草稿优先，其次存库；不依赖 selected
    review_src = review.read_text(encoding="utf-8")
    if "sessionDraft && sessionDraft.length === usageSlotCount" not in review_src:
        errors.append(
            "en-vocab-review.ts: resolveEnVocabUsageDraftLevels must prefer session draft"
        )
    if "parseEnVocabLastUsageLevels(storedRaw)" not in review_src:
        errors.append(
            "en-vocab-review.ts: resolveEnVocabUsageDraftLevels must fall back to last_usage_levels"
        )
    db_text = read_en_vocab_db()
    for n in [
        "last_usage_levels",
        'addEnVocabWordColumnIfMissing(db, cols, "last_usage_levels"',
        "recordEnVocabReviewWithUsageLevels",
        "shareToStudy",
        "shared_new",
        "INSERT INTO en_vocab_shared",
        "RecordEnVocabReviewOptions",
    ]:
        if n not in db_text:
            errors.append(f"en-vocab-db/: missing {n!r}")

    route = ROOT / "src/app/api/en-vocab/route.ts"
    route_text = route.read_text(encoding="utf-8")
    for n in [
        "usage_levels",
        "recordEnVocabReviewWithUsageLevels",
        "shareToStudy: true",
        "shared_new",
    ]:
        if n not in route_text:
            errors.append(f"en-vocab/route.ts: missing {n!r}")

    hook = ROOT / "src/hooks/useEnVocabReviewActions.ts"
    if not hook.is_file():
        errors.append(f"missing {hook.relative_to(ROOT)}")
    else:
        hook_text = hook.read_text(encoding="utf-8")
        for n in [
            "notifyEnVocabSharedUpdated",
            "shared_new",
            "今日背英语单词",
            "shareProgressMap",
            "patchShareProgress",
            "JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT",
            "勿乐观标记",
        ]:
            if n not in hook_text:
                errors.append(f"useEnVocabReviewActions.ts: missing {n!r}")
        # recordUsageLevels / recordLevel 禁止在 await 前 setSharedTodayWordIds(nextSharedIds)
        if (
            "nextSharedIds" in hook_text
            and "setSharedTodayWordIds(new Set(nextSharedIds))" in hook_text
        ):
            # applySharedResponse 用 nextSharedIds 可以；record* 里须已删掉乐观写入
            record_usage = hook_text.split("const recordUsageLevels", 1)
            if len(record_usage) > 1:
                body = record_usage[1].split("const shareWord", 1)[0]
                if "setSharedTodayWordIds(new Set(nextSharedIds))" in body:
                    errors.append(
                        "useEnVocabReviewActions.ts: recordUsageLevels must not "
                        "optimistically setSharedTodayWordIds before save completes"
                    )
            record_level = hook_text.split("const recordLevel", 1)
            if len(record_level) > 1:
                body = record_level[1].split("const recordUsageLevels", 1)[0]
                if "setSharedTodayWordIds(new Set(nextSharedIds))" in body:
                    errors.append(
                        "useEnVocabReviewActions.ts: recordLevel must not "
                        "optimistically setSharedTodayWordIds before save completes"
                    )

    flash = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
    flash_dir = ROOT / "src/components/en-vocab-teacher-quiz-flashcard"
    flash_parts = [flash.read_text(encoding="utf-8")] if flash.is_file() else []
    if flash_dir.is_dir():
        for f in sorted(flash_dir.glob("*.tsx")) + sorted(flash_dir.glob("*.ts")):
            flash_parts.append(f.read_text(encoding="utf-8"))
    flash_text = "\n".join(flash_parts)
    for n in [
        "onSelectUsageLevels",
        "usageLevelControls",
        "aggregateEnVocabUsageLevels",
        "listIncompleteEnVocabUsageLevelIndices",
        "formatEnVocabUncheckedUsagesHint",
        "showUncheckedUsagesBlocked",
        "usagesCompleteForShare",
        "resolveEnVocabUsageDraftLevels",
        "勾选已满 1 小时，无法再修改熟悉程度",
        "JpVocabSaveProgressBar",
        "en-vocab-flashcard-page__nav-progress",
        "wordSynced={isShared && !saveBusy}",
    ]:
        if n not in flash_text:
            errors.append(f"EnVocabTeacherQuizFlashcardModal.tsx: missing {n!r}")

    # 勾齐用法写库期间：导航旁必须有橙色进度条；禁止只灰掉「下一个」却无反馈
    if 'disabled={isSaving}' in flash_text and "disabled={saveBusy}" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: next button must disable on saveBusy "
            "(not only isSaving), so sync progress covers queue/share phases"
        )

    if "今日已共享，熟悉程度不可更改" in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: must not say share locks levels"
        )
    # 禁止再加「滚动定位未勾用法」（暗色主题提示条曾看不清）
    for banned in [
        "focusUsageLevelAt",
        "scrollIntoView",
        "focusUncheckedUsageIndex",
        "en-vocab-flashcard-usage-focus-hint",
        "focusIndex",
    ]:
        if banned in flash_text:
            errors.append(
                f"EnVocabTeacherQuizFlashcardModal.tsx: must not use locate/scroll {banned!r}"
            )

    review = ROOT / "src/lib/en-vocab-review.ts"
    review_text = review.read_text(encoding="utf-8") if review.is_file() else ""
    for n in [
        "listIncompleteEnVocabUsageLevelIndices",
        "formatEnVocabUncheckedUsagesHint",
        "findFirstIncompleteEnVocabUsageLevelIndex",
        "areEnVocabUsageLevelsComplete",
    ]:
        if f"export function {n}" not in review_text:
            errors.append(f"en-vocab-review.ts: missing export {n!r}")
    if "此单词的" not in review_text or "还未勾选" not in review_text:
        errors.append(
            "en-vocab-review.ts: formatEnVocabUncheckedUsagesHint must list unchecked usages"
        )

    paired = ROOT / "src/components/EnVocabUsageExamplesPairedContent.tsx"
    paired_text = paired.read_text(encoding="utf-8") if paired.is_file() else ""
    if not paired.is_file():
        errors.append(f"missing {paired.relative_to(ROOT)}")
    else:
        for n in [
            "en-usage-ex-paired-levels",
            "border: 1.5px solid var(--rise)",
            "data-en-usage-level-index",
            "disabledReason",
        ]:
            if n not in paired_text:
                errors.append(
                    f"EnVocabUsageExamplesPairedContent.tsx: missing {n!r}"
                )
        for banned in ["focusIndex", "en-usage-ex-paired-levels--focus"]:
            if banned in paired_text:
                errors.append(
                    f"EnVocabUsageExamplesPairedContent.tsx: must not use locate {banned!r}"
                )

    page = ROOT / "src/components/EnVocabPage.tsx"
    page_dir = ROOT / "src/components/en-vocab-page"
    page_parts = [page.read_text(encoding="utf-8")] if page.is_file() else []
    if page_dir.is_dir():
        for f in sorted(page_dir.glob("*.tsx")) + sorted(page_dir.glob("*.ts")):
            page_parts.append(f.read_text(encoding="utf-8"))
    page_text = "\n".join(page_parts)
    review_actions = ROOT / "src/hooks/useEnVocabReviewActions.ts"
    review_actions_text = (
        review_actions.read_text(encoding="utf-8") if review_actions.is_file() else ""
    )
    teacher_quiz = ROOT / "src/hooks/useEnVocabTeacherQuiz.ts"
    teacher_quiz_text = (
        teacher_quiz.read_text(encoding="utf-8") if teacher_quiz.is_file() else ""
    )
    page_ui = page_text + "\n" + review_actions_text + "\n" + teacher_quiz_text
    for n in [
        "recordUsageLevels",
        "quizCardPreviewWordId",
        "查看抽问卡片",
        "previewMode",
        "areEnVocabUsageLevelsComplete",
        "请先在抽查卡为每条用法勾选熟悉程度",
    ]:
        if n not in page_ui:
            errors.append(f"EnVocabPage/hooks: missing {n!r}")

    # Incomplete draft must not POST
    if "if (!levels.length || levels.some((lv) => lv == null))" not in page_ui:
        errors.append(
            "useEnVocabReviewActions: recordUsageLevels must return early when levels incomplete"
        )

    # 草稿须在 canOperate 校验之前写入，避免点了无勾选态
    draft_idx = page_ui.find(
        "setSessionUsageLevels((prev) => ({ ...prev, [wordId]: levels }))"
    )
    record_start = page_ui.find("const recordUsageLevels")
    auth_idx = page_ui.find(
        'setStatus("请登录后再勾选熟悉程度。")',
        record_start if record_start >= 0 else 0,
    )
    if draft_idx < 0 or auth_idx < 0 or draft_idx > auth_idx:
        errors.append(
            "useEnVocabReviewActions: recordUsageLevels must setSessionUsageLevels before canOperate early-return"
        )
    # 写库失败不得把 sessionUsageLevels 打回未齐 / delete（第二条勾选会消失）
    if "if (prevUsage) next[wordId] = prevUsage" in page_ui:
        errors.append(
            "useEnVocabReviewActions: must not roll back sessionUsageLevels to prevUsage on save failure"
        )
    if "usageLevelSavingRef" not in page_ui:
        errors.append(
            "useEnVocabReviewActions: missing usageLevelSavingRef concurrent-save guard"
        )
    if "setSessionUsageLevels((prev) => ({ ...prev, [wordId]: complete }))" not in page_ui:
        errors.append(
            "useEnVocabReviewActions: on usage-level save failure must keep complete draft"
        )

    # 草稿已齐但 selected 空时，「下一个」应重试写库而非误报未勾选
    if "areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount)" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: tryGoNext must retry when draft complete"
        )
    if "onSelectUsageLevels(w.id, usageDraftLevels)" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal.tsx: tryGoNext must call onSelectUsageLevels to retry"
        )

    # 同日只计总体一次（勿按用法条数 / 15s 短窗重复 +1）
    for n in [
        "export function hasEnVocabTodayCheckCounted",
        "hasEnVocabTodayCheckCounted(word, now)",
        "今日已计过抽查次数",
    ]:
        if n not in review_src:
            errors.append(f"en-vocab-review.ts: missing same-day overall count guard {n!r}")
    # resolveEnVocabPreviousLevel 须看 today_check，不能只靠 15s
    resolve_start = review_src.find("export function resolveEnVocabPreviousLevel")
    if resolve_start < 0:
        errors.append("en-vocab-review.ts: missing resolveEnVocabPreviousLevel")
    else:
        resolve_chunk = review_src[resolve_start : resolve_start + 1200]
        if "hasEnVocabTodayCheckCounted" not in resolve_chunk:
            errors.append(
                "resolveEnVocabPreviousLevel must use hasEnVocabTodayCheckCounted "
                "(same Beijing day → correct overall, do not re-increment)"
            )
        if (
            "nowMs - opts.sessionReviewAtMs <= JP_VOCAB_REVIEW_CORRECTION_MS"
            in resolve_chunk
        ):
            errors.append(
                "resolveEnVocabPreviousLevel must not gate session correction on 15s only"
            )

    db_text = read_en_vocab_db()
    if "EN_VOCAB_WORD_SCHEMA_VERSION" not in db_text:
        errors.append(
            "en-vocab-db/: missing EN_VOCAB_WORD_SCHEMA_VERSION (schema ready bump)"
        )

    schema = ROOT / "schema.sql"
    if schema.is_file() and "last_usage_levels" not in schema.read_text(encoding="utf-8"):
        errors.append("schema.sql: en_vocab_word must declare last_usage_levels")


    # 进度/回显：last_review_at 须北京墙钟（对齐日语），勿 Worker UTC
    daily_check = ROOT / "src/lib/en-vocab-daily-check.ts"
    daily_text = daily_check.read_text(encoding="utf-8") if daily_check.is_file() else ""
    if "export function beijingDateTimeString" not in daily_text:
        errors.append("en-vocab-daily-check.ts: missing beijingDateTimeString")
    if "return beijingDateTimeString(now)" not in review_src:
        errors.append("en-vocab-review.ts formatReviewIso must use beijingDateTimeString")
    if "parseBeijingDateTime" not in review_src:
        errors.append("en-vocab-review.ts reviewTimestampMs must parse Beijing wall clock")
    flash = ROOT / "src/components/EnVocabTeacherQuizFlashcardModal.tsx"
    flash_text = flash.read_text(encoding="utf-8") if flash.is_file() else ""
    if "sessionLocalChecked" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal: must blend sessionLocalChecked into 本轮进度"
        )
    if "Math.max(dailyChecked, sessionLocalChecked)" not in flash_text:
        errors.append(
            "EnVocabTeacherQuizFlashcardModal: progress numerator must max(daily, sessionLocal)"
        )

    if errors:
        print("FAIL: en-vocab usage-level aggregate guards")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: en-vocab usage-level aggregate + wiring")
    return 0


if __name__ == "__main__":
    sys.exit(main())
