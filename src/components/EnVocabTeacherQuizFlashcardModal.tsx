"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { EnVocabFlashcardAlerts } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardAlerts";
import { EnVocabFlashcardPageBody } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody";
import { EnVocabFlashcardPageFooter } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageFooter";
import { EnVocabFlashcardPageHeader } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageHeader";
import {
  EN_VOCAB_LEVEL_SYNC_HINT,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT,
  EN_VOCAB_LEVEL_SYNC_HINT_SHORT,
} from "@/components/en-vocab-teacher-quiz-flashcard/helpers";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { type EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  enVocabDailyQuizProgressDisplayChecked,
  type EnVocabDailyQuizProgress,
} from "@/lib/en-vocab-daily-quiz-progress";
import {
  aggregateEnVocabUsageLevels,
  areEnVocabUsageLevelsComplete,
  effectiveEnVocabDisplayLevel,
  formatEnVocabUncheckedUsagesHint,
  listIncompleteEnVocabUsageLevelIndices,
  resolveEnVocabUsageDraftLevels,
} from "@/lib/en-vocab-review";
import {
  enVocabPriorityLabel,
  enVocabRiskIndex,
  formatEnVocabTotalReviewsDisplay,
} from "@/lib/en-vocab-shared";
import {
  enVocabTeacherQuizNotesInline,
  findFirstUncheckedEnVocabTeacherQuizIndex,
  mergeEnVocabWordAfterClassNotesFetch,
  type EnVocabTeacherQuizSession,
} from "@/lib/en-vocab-teacher-quiz";
import {
  buildEnVocabUsageExamplePairs,
  listEnVocabUsagePointsForDisplay,
} from "@/lib/en-vocab-usage-examples-display";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  type JpVocabSaveProgressKind,
} from "@/lib/jp-vocab-save-progress";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  session: EnVocabTeacherQuizSession | null;
  wordsById: Map<number, EnVocabWord>;
  refs: Record<string, EnVocabRef>;
  locale: "zh" | "en";
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  /** 按用法勾选草稿 / 已选（与编号用法条数对齐） */
  sessionUsageLevels?: Record<number, Array<EnVocabLevel | null | undefined>>;
  reviewLockedByWordId: Record<number, boolean>;
  savingWordId: number | null;
  wordSyncState?: Record<number, "queued" | "syncing">;
  dailySeqByWordId: ReadonlyMap<number, number>;
  /** 今日抽查进度（队列仅含未抽查词时，进度条仍按今日目标 已抽/总数 展示） */
  dailyQuizProgress?: EnVocabDailyQuizProgress | null;
  canOperate?: boolean;
  shareUiEnabled?: boolean;
  shareProgressMap?: Record<number, number>;
  sharedTodayWordIds?: ReadonlySet<number>;
  /** 学生已自行查看老师当前抽查词 */
  studentPeeked?: boolean;
  /** 管理员预览抽问卡片样式（只读，不写熟悉程度/不同步给学生） */
  previewMode?: boolean;
  /** 老师抽问 / 学生端今日共享：复用同一套抽问卡片 UI */
  mode?: "quiz" | "study";
  onClose: () => void;
  /** 最后一词勾选后点「完成」 */
  onComplete: () => void;
  /** 无编号用法时的整词勾选兜底 */
  onSelectLevel: (wordId: number, level: EnVocabLevel) => void;
  /** 有编号用法：每条用法旁勾选（可未齐）；齐了由父组件汇总写库 */
  onSelectUsageLevels?: (
    wordId: number,
    levels: Array<EnVocabLevel | null | undefined>
  ) => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: EnVocabRef) => void;
  onViewRemarks: (word: EnVocabWord) => void;
  onEditRemarks?: (word: EnVocabWord) => void;
  onEditWord?: (word: EnVocabWord) => void;
  onShare?: (wordId: number) => void;
  onUnshare?: (wordId: number) => void;
  onWordUpdated?: (word: EnVocabWord) => void;
  nestedModalOpen?: boolean;
};

export function EnVocabTeacherQuizFlashcardModal({
  open,
  session,
  wordsById,
  refs,
  locale,
  displayOrder,
  sessionLevel,
  sessionUsageLevels = {},
  reviewLockedByWordId,
  savingWordId,
  wordSyncState = {},
  dailySeqByWordId,
  dailyQuizProgress = null,
  canOperate = false,
  shareUiEnabled = false,
  shareProgressMap = {},
  sharedTodayWordIds,
  studentPeeked = false,
  previewMode = false,
  mode = "quiz",
  onClose,
  onComplete,
  onSelectLevel,
  onSelectUsageLevels,
  onNavigate,
  onOpenRef,
  onViewRemarks,
  onEditRemarks,
  onEditWord,
  onShare,
  onUnshare,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<EnVocabWord | null>(null);
  /** 未勾选熟悉程度就点「下一个」/共享 */
  const [nextBlockedHint, setNextBlockedHint] = useState(false);
  /** 有编号用法未齐时的拦截文案（列出未勾的 N.用法；不滚动定位） */
  const [nextBlockedUsageMessage, setNextBlockedUsageMessage] = useState<
    string | null
  >(null);
  /** 点「完成抽查」时会话内仍有未勾选词 */
  const [remainingUncheckedHint, setRemainingUncheckedHint] = useState(false);
  /** 本词答题正计时（秒）；换词归零，勾选熟悉程度后停住 */
  const [answerElapsedSec, setAnswerElapsedSec] = useState(0);
  /** 本词从「未勾选」进入时武装计时（已勾选返回上一词则不显示） */
  const [answerTimerArmed, setAnswerTimerArmed] = useState(false);
  const answerTimerStartedAtRef = useRef<number | null>(null);

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? null : null;

  const isStudyMode = mode === "study";
  const showAnswerTimer =
    open && !previewMode && !isStudyMode && word != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !word) {
      setNotesWord(null);
      setRemainingUncheckedHint(false);
      return;
    }
    setNotesWord(word);
    setNextBlockedHint(false);
    setNextBlockedUsageMessage(null);
    // 不在换词时清 remainingUncheckedHint：点「完成抽查」跳到未勾选词后需保留提示
  }, [open, word?.id, word?.updated_at, word]);

  useEffect(() => {
    if (!open || !word) return;
    if (!word.class_notes_present || word.class_notes) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const parsed = await readApiJson<{ ok: boolean; word?: EnVocabWord }>(res);
        if (cancelled || !parsed.ok || !parsed.data.ok || !parsed.data.word) return;
        const merged = mergeEnVocabWordAfterClassNotesFetch(word, parsed.data.word);
        setNotesWord(merged);
        onWordUpdated?.(merged);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    word?.id,
    word?.class_notes_present,
    word?.class_notes,
    locale,
    onWordUpdated,
    word,
  ]);

  useEffect(() => {
    if (!open || nestedModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (nextBlockedHint) {
        setNextBlockedHint(false);
        setNextBlockedUsageMessage(null);
        return;
      }
      if (remainingUncheckedHint) {
        setRemainingUncheckedHint(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nestedModalOpen, onClose, nextBlockedHint, remainingUncheckedHint]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const selectedLevel =
    word && session
      ? effectiveEnVocabDisplayLevel(word, sessionLevel[word.id], {
          displayOrder,
        })
      : undefined;

  useEffect(() => {
    if (!showAnswerTimer || !word) {
      setAnswerTimerArmed(false);
      answerTimerStartedAtRef.current = null;
      setAnswerElapsedSec(0);
      return;
    }
    // 仅依赖 word.id：勾选熟悉程度时不重新武装，保留已走秒数
    const alreadyChecked =
      effectiveEnVocabDisplayLevel(word, sessionLevel[word.id], { displayOrder }) !=
      null;
    if (alreadyChecked) {
      setAnswerTimerArmed(false);
      answerTimerStartedAtRef.current = null;
      setAnswerElapsedSec(0);
      return;
    }
    setAnswerTimerArmed(true);
    answerTimerStartedAtRef.current = Date.now();
    setAnswerElapsedSec(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 换词才重置；勾选不得清零
  }, [showAnswerTimer, word?.id]);

  useEffect(() => {
    if (!answerTimerArmed || answerTimerStartedAtRef.current == null) return;
    if (selectedLevel) {
      const started = answerTimerStartedAtRef.current;
      setAnswerElapsedSec(Math.floor((Date.now() - started) / 1000));
      return;
    }
    const tick = window.setInterval(() => {
      const started = answerTimerStartedAtRef.current;
      if (started == null) return;
      setAnswerElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(tick);
  }, [answerTimerArmed, selectedLevel, word?.id]);

  useEffect(() => {
    if (selectedLevel) {
      setNextBlockedHint(false);
      setNextBlockedUsageMessage(null);
    }
  }, [selectedLevel]);

  const wordHasLevel = (wordId: number) => {
    const item = wordsById.get(wordId);
    if (!item) return false;
    return (
      effectiveEnVocabDisplayLevel(item, sessionLevel[wordId], { displayOrder }) !=
      null
    );
  };

  const showUncheckedUsagesBlocked = (
    levels: ReadonlyArray<EnVocabLevel | null | undefined>,
    actionHint: string
  ) => {
    const incomplete = listIncompleteEnVocabUsageLevelIndices(levels);
    setNextBlockedUsageMessage(
      formatEnVocabUncheckedUsagesHint(incomplete, actionHint)
    );
    setNextBlockedHint(true);
  };

  if (!open || !mounted || !session || !word || currentWordId == null) return null;

  const isStudy = isStudyMode;
  const w = notesWord ?? word;
  const ref = w.ref_key ? refs[w.ref_key] : undefined;
  const readingTrim = (w.reading || "").trim();
  const wordTrim = w.word.trim();
  const meaningTrim = (w.meaning || "").trim();
  const posTrim = (w.pos || "").trim();
  const selected = selectedLevel;
  const reviewLocked = reviewLockedByWordId[w.id] ?? false;
  const syncPhase = wordSyncState[w.id];
  const isQueued = syncPhase === "queued";
  const isSyncing = syncPhase === "syncing";
  const isSaving = savingWordId === w.id;
  const risk = enVocabRiskIndex(w);
  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatEnVocabTotalReviewsDisplay(w, locale);
  const priorityLabel = enVocabPriorityLabel(locale);
  const hasNotes = hasEnVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && enVocabTeacherQuizNotesInline(w.class_notes || "");
  const usageExampleModel = buildEnVocabUsageExamplePairs(
    w.usage,
    w.example_sentences
  );
  const usageSlotCount = listEnVocabUsagePointsForDisplay(w.usage).points.length;
  const usePerUsageLevels = usageSlotCount > 0;
  const usageDraftLevels = resolveEnVocabUsageDraftLevels(
    usageSlotCount,
    sessionUsageLevels[w.id],
    w.last_usage_levels
  );
  const usageLevelDisabled =
    previewMode || isStudy || reviewLocked || isSaving || !canOperate;
  const usageLevelDisabledReason = previewMode
    ? "预览模式：用法旁熟悉程度仅为展示，不会保存"
    : isStudy
      ? "老师已勾选的熟悉程度"
      : reviewLocked
        ? "勾选已满 1 小时，无法再修改熟悉程度"
        : isSaving
          ? "正在保存熟悉程度…"
          : !canOperate
            ? "请登录后再勾选熟悉程度"
            : undefined;
  const overallFromUsages =
    usePerUsageLevels &&
    areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount)
      ? aggregateEnVocabUsageLevels(usageDraftLevels as EnVocabLevel[])
      : null;
  const usagesCompleteForShare =
    !usePerUsageLevels ||
    areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount) ||
    selected != null;
  const showUsageExamples = isStudy || usageExampleModel.hasContent;
  const dailySeq = dailySeqByWordId.get(w.id);
  const sessionUncheckedCount = session.wordIds.reduce((count, id) => {
    const item = wordsById.get(id);
    if (!item) return count + 1;
    return effectiveEnVocabDisplayLevel(item, sessionLevel[id], { displayOrder }) ==
      null
      ? count + 1
      : count;
  }, 0);
  const useDailyProgress = dailyQuizProgress != null && dailyQuizProgress.total > 0;
  const uncheckedCount = useDailyProgress
    ? dailyQuizProgress.remaining
    : sessionUncheckedCount;
  const remainingLabel =
    locale === "zh"
      ? `还剩 ${uncheckedCount} 个未抽查`
      : `${uncheckedCount} left to quiz`;
  const sessionTotal = useDailyProgress
    ? dailyQuizProgress.total
    : session.wordIds.length;
  const sessionChecked = useDailyProgress
    ? enVocabDailyQuizProgressDisplayChecked(dailyQuizProgress)
    : Math.max(0, session.wordIds.length - sessionUncheckedCount);
  const sessionPct =
    sessionTotal > 0
      ? Math.min(100, Math.round((sessionChecked / sessionTotal) * 100))
      : 0;
  const sessionComplete = useDailyProgress
    ? dailyQuizProgress.complete
    : session.wordIds.length > 0 && sessionUncheckedCount === 0;
  const progressLabel = sessionComplete
    ? locale === "zh"
      ? "已完成"
      : "Done"
    : `${sessionChecked} / ${sessionTotal}`;
  const isSharing = w.id in shareProgressMap;
  const sharingPercent = shareProgressMap[w.id] ?? 0;
  const isShared = sharedTodayWordIds?.has(w.id) ?? false;
  const saveBusy = isSharing || isQueued || isSyncing || isSaving;
  const saveProgressKind: JpVocabSaveProgressKind = isShared
    ? "save_level"
    : selected || isSaving
      ? "sync_to_student"
      : "share";
  const saveProgressLabel = jpVocabSaveProgressLabel(
    isSaving && !isSharing && !isQueued && !isSyncing
      ? "save_level"
      : saveProgressKind,
    {
      queued: isQueued && !isSyncing,
    }
  );
  const saveProgressPercent = isSharing
    ? sharingPercent
    : jpVocabSaveProgressDisplayPercent(null);
  const levelSyncHintShort = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT
    : usePerUsageLevels
      ? "全部用法勾完后同步给学生"
      : EN_VOCAB_LEVEL_SYNC_HINT_SHORT;
  const levelSyncHint = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED
    : usePerUsageLevels
      ? "每条用法都勾完后，才会写入并同步给学生复习查看"
      : EN_VOCAB_LEVEL_SYNC_HINT;
  const canGoPrev = session.currentIndex > 0;
  const isLast = session.currentIndex === session.wordIds.length - 1;
  /* 备注在底栏熟悉程度/统计上方，不再占右侧栏 */
  const showSideCol = showUsageExamples;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const tryGoNext = () => {
    if (previewMode || isStudy) {
      onComplete();
      return;
    }
    if (sessionComplete) {
      onComplete();
      return;
    }
    if (!selected) {
      if (usePerUsageLevels) {
        // 草稿已齐但写库失败时 selected 仍空：再提交一次，勿误报「未勾选」
        if (
          areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount) &&
          onSelectUsageLevels
        ) {
          onSelectUsageLevels(w.id, usageDraftLevels);
          return;
        }
        showUncheckedUsagesBlocked(usageDraftLevels, "再点「下一个」");
        return;
      }
      setNextBlockedUsageMessage(null);
      setNextBlockedHint(true);
      return;
    }
    if (isSaving) return;
    // 「下一个」跳过已勾选词，避免漏掉中间未勾选却卡在最后一词点「完成」无反应
    const nextUnchecked = findFirstUncheckedEnVocabTeacherQuizIndex(
      session,
      wordHasLevel,
      session.currentIndex + 1
    );
    if (nextUnchecked >= 0) {
      onNavigate(nextUnchecked);
      return;
    }
    const remainingUnchecked = findFirstUncheckedEnVocabTeacherQuizIndex(
      session,
      wordHasLevel,
      0
    );
    if (remainingUnchecked >= 0) {
      if (remainingUnchecked !== session.currentIndex) {
        onNavigate(remainingUnchecked);
      }
      setRemainingUncheckedHint(true);
      return;
    }
    // 进度条仍显示剩余，但会话词都已勾选：交给 onComplete 补全队列
    if (uncheckedCount > 0) {
      setRemainingUncheckedHint(true);
      onComplete();
      return;
    }
    onComplete();
  };

  return createPortal(
    <div
      className="jp-vocab-teacher-quiz-overlay en-vocab-flashcard-page-overlay"
      role="presentation"
    >
      <article
        className={`jp-vocab-teacher-quiz-card en-vocab-flashcard-page${
          showAnswerTimer && answerTimerArmed
            ? " jp-vocab-teacher-quiz-card--with-timer"
            : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-vocab-teacher-quiz-title"
        onClick={stop}
      >
        <EnVocabFlashcardPageHeader
          isStudy={isStudy}
          previewMode={previewMode}
          session={session}
          locale={locale}
          dailySeq={dailySeq}
          progressLabel={progressLabel}
          remainingLabel={remainingLabel}
          sessionComplete={sessionComplete}
          showAnswerTimer={showAnswerTimer}
          answerTimerArmed={answerTimerArmed}
          selected={selected}
          answerElapsedSec={answerElapsedSec}
          onClose={onClose}
          sessionChecked={sessionChecked}
          sessionTotal={sessionTotal}
          uncheckedCount={uncheckedCount}
          sessionPct={sessionPct}
          studentPeeked={studentPeeked}
        />

        <EnVocabFlashcardPageBody
          showSideCol={showSideCol}
          wordTrim={wordTrim}
          readingTrim={readingTrim}
          meaningTrim={meaningTrim}
          posTrim={posTrim}
          w={w}
          vocabRef={ref}
          onOpenRef={onOpenRef}
          canOperate={canOperate}
          onEditWord={onEditWord}
          onEditRemarks={onEditRemarks}
          shareUiEnabled={shareUiEnabled}
          isStudy={isStudy}
          isShared={isShared}
          onUnshare={onUnshare}
          isSaving={isSaving}
          isSharing={isSharing}
          reviewLocked={reviewLocked}
          usagesCompleteForShare={usagesCompleteForShare}
          showUncheckedUsagesBlocked={showUncheckedUsagesBlocked}
          usageDraftLevels={usageDraftLevels}
          onShare={onShare}
          showUsageExamples={showUsageExamples}
          usageExampleModel={usageExampleModel}
          usePerUsageLevels={usePerUsageLevels}
          usageLevelDisabled={usageLevelDisabled}
          usageLevelDisabledReason={usageLevelDisabledReason}
          setNextBlockedHint={setNextBlockedHint}
          setNextBlockedUsageMessage={setNextBlockedUsageMessage}
          onSelectUsageLevels={onSelectUsageLevels}
        />

        <EnVocabFlashcardPageFooter
          hasNotes={hasNotes}
          canOperate={canOperate}
          notesInline={notesInline}
          w={w}
          isStudy={isStudy}
          previewMode={previewMode}
          usePerUsageLevels={usePerUsageLevels}
          selected={selected}
          overallFromUsages={overallFromUsages}
          reviewLocked={reviewLocked}
          isSaving={isSaving}
          levelSyncHintShort={levelSyncHintShort}
          levelSyncHint={levelSyncHint}
          saveBusy={saveBusy}
          saveProgressLabel={saveProgressLabel}
          saveProgressPercent={saveProgressPercent}
          locale={locale}
          priorityLabel={priorityLabel}
          riskBadgeTier={riskBadgeTier}
          totalDisplay={totalDisplay}
          risk={risk}
          todayChecks={todayChecks}
          onViewRemarks={onViewRemarks}
          onEditRemarks={onEditRemarks}
          onSelectLevel={onSelectLevel}
          setNextBlockedHint={setNextBlockedHint}
        />

        <div className="jp-vocab-teacher-quiz__nav">
          {!isStudy ? (
            <button
              type="button"
              className="btn-rsi-filter jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--prev"
              disabled={!canGoPrev}
              onClick={() => onNavigate(session.currentIndex - 1)}
            >
              <span className="jp-vocab-teacher-quiz__nav-btn-main">上一个</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--next${
              !previewMode && !isStudy && !selected
                ? " jp-vocab-teacher-quiz__nav-btn--blocked"
                : ""
            }${isStudy ? " jp-vocab-teacher-quiz__nav-btn--study-close" : ""}`}
            disabled={isSaving}
            onClick={tryGoNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {isStudy
                ? "关闭"
                : previewMode
                  ? "关闭预览"
                  : sessionComplete
                    ? "完成抽查"
                    : isLast
                      ? "完成抽查"
                      : "下一个"}
            </span>
            {!isLast && !isStudy && !sessionComplete && !previewMode ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">勾选后可点</span>
            ) : null}
          </button>
        </div>
      </article>

      <EnVocabFlashcardAlerts
        nextBlockedHint={nextBlockedHint}
        previewMode={previewMode}
        isStudy={isStudy}
        selected={selected}
        nextBlockedUsageMessage={nextBlockedUsageMessage}
        remainingUncheckedHint={remainingUncheckedHint}
        onDismissNextBlocked={() => {
          setNextBlockedHint(false);
          setNextBlockedUsageMessage(null);
        }}
        onDismissRemaining={() => setRemainingUncheckedHint(false)}
        stop={stop}
      />

      <style>{`
        .en-vocab-flashcard-overall-level {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
        }
      `}</style>
      <JpVocabTeacherQuizFlashcardStyles />
    </div>,
    document.body
  );
}
