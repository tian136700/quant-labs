"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { useJpVocabFlashcardClassNotesFetch } from "@/hooks/useJpVocabFlashcardClassNotesFetch";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScoreOrNull,
} from "@/lib/jp-vocab-quiz-score";
import {
  jpVocabTeacherQuizModeLabel,
  type JpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz";
import { JpVocabFlashcardNotesSection } from "@/components/jp-vocab-teacher-quiz/JpVocabFlashcardNotesSection";
import {
  jpVocabDailyQuizProgressDisplayChecked,
  type JpVocabDailyQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  type JpVocabSaveProgressKind,
} from "@/lib/jp-vocab-save-progress";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { JpVocabAnnotationSection } from "@/components/JpVocabAnnotationSection";
import { JpVocabCourseFreqMetaSection } from "@/components/JpVocabCourseFreqMetaSection";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import { JpVocabFlashcardWordHero } from "@/components/JpVocabFlashcardWordHero";
import { parseJpVocabExampleSentenceItems } from "@/lib/jp-vocab-example-sentences";
import { JpVocabUsageExamplesCopyButton } from "@/components/JpVocabUsageExamplesCopyButton";
import { JpVocabUsageExamplesPairedContent } from "@/components/JpVocabUsageExamplesPairedContent";
import { JpVocabConnectionSection } from "@/components/JpVocabConnectionSection";
import { JpVocabRelatedCompoundsSection } from "@/components/JpVocabRelatedCompoundsSection";
import { buildJpVocabUsageExamplePairs } from "@/lib/jp-vocab-usage-examples-display";
import { isJpVocabConjugationGrammar, isJpVocabContrastGrammar } from "@/lib/jp-vocab-usage-ai";
import {
  hasJpVocabConnection,
  jpVocabConnectionShownInlineWithUsage,
} from "@/lib/jp-vocab-connection-ai";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { JpVocabFlashcardAlerts } from "@/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardAlerts";
import { JpVocabFlashcardHeader } from "@/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardHeader";
import { JpVocabFlashcardManualFillExamples } from "@/components/jp-vocab-teacher-quiz-flashcard/JpVocabFlashcardManualFillExamples";
import { useJpVocabTeacherQuizNextAdvance } from "@/components/jp-vocab-teacher-quiz-flashcard/useJpVocabTeacherQuizNextAdvance";
import {
  JP_VOCAB_LEVEL_SYNC_HINT,
  JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED,
  JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT,
  JP_VOCAB_LEVEL_SYNC_HINT_SHORT,
  JP_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL,
  LEVELS,
  formatJpVocabQuizElapsedLabel,
} from "@/components/jp-vocab-teacher-quiz-flashcard/helpers";

type Props = {
  open: boolean;
  session: JpVocabTeacherQuizSession | null;
  wordsById: Map<number, JpVocabWord>;
  refs: Record<string, JpVocabRef>;
  locale: "zh" | "en";
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  reviewLockedByWordId: Record<number, boolean>;
  savingWordId: number | null;
  wordSyncState?: Record<number, "queued" | "syncing">;
  dailySeqByWordId: ReadonlyMap<number, number>;
  /** 今日抽查进度（队列仅含未抽查词时，进度条仍按今日目标 已抽/总数 展示） */
  dailyQuizProgress?: JpVocabDailyQuizProgress | null;
  canOperate?: boolean;
  shareUiEnabled?: boolean;
  shareProgressMap?: Record<number, number>;
  sharedTodayWordIds?: ReadonlySet<number>;
  /** 学生已自行查看老师当前抽查词 */
  studentPeeked?: boolean;
  /** 管理员预览抽问卡片样式（只读，不写熟悉程度/不同步给学生） */
  previewMode?: boolean;
  /** 课堂带读 / 学生端今日共享：复用同一套抽问卡片 UI */
  mode?: "quiz" | "coach" | "study";
  /** 课堂带读：导出时熟悉程度快照 */
  coachLevelByWordId?: ReadonlyMap<number, JpVocabLevel>;
  /** 课堂带读：点「已带读，下一个」时标记 */
  onMarkCoached?: (wordId: number) => void;
  onClose: () => void;
  /** 最后一词勾选后点「完成」 */
  onComplete: () => void;
  onSelectLevel: (wordId: number, level: JpVocabLevel) => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: JpVocabRef) => void;
  onViewRemarks: (word: JpVocabWord) => void;
  onEditRemarks?: (word: JpVocabWord) => void;
  /** 学生卡「拉取实时备注」成功后打开只读弹窗（勿走 canOperate 编辑入口） */
  onShowPulledRemarks?: (word: JpVocabWord) => void;
  onEditWord?: (word: JpVocabWord) => void;
  onShare?: (wordId: number) => void | Promise<boolean | void>;
  /** 点「下一个」前：未共享则同步一次；已共享返回 true */
  onEnsureSharedBeforeNext?: (wordId: number) => Promise<boolean>;
  onUnshare?: (wordId: number) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  nestedModalOpen?: boolean;
  /** 久未复习抬升权重（final_score） */
  quizTimeWeight?: number;
  /** 管理员：卡片内手动调线上模型重补用法+例句 */
  canManualFillExamples?: boolean;
};

export function JpVocabTeacherQuizFlashcardModal({
  open,
  session,
  wordsById,
  refs,
  locale,
  displayOrder,
  sessionLevel,
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
  coachLevelByWordId,
  onClose,
  onComplete,
  onSelectLevel,
  onNavigate,
  onOpenRef,
  onViewRemarks,
  onEditRemarks,
  onShowPulledRemarks,
  onEditWord,
  onShare,
  onEnsureSharedBeforeNext,
  onUnshare,
  onWordUpdated,
  nestedModalOpen = false,
  onMarkCoached,
  quizTimeWeight = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  canManualFillExamples = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
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
  const { notesWord, setNotesWord, notesLoading } = useJpVocabFlashcardClassNotesFetch({
    open,
    word,
    locale,
    onWordUpdated,
  });

  const isCoachMode = mode === "coach";
  const isStudyMode = mode === "study";
  const showAnswerTimer =
    open && !previewMode && !isCoachMode && !isStudyMode && word != null;

  const selectedLevel =
    word && session
      ? isCoachMode
        ? sessionLevel[word.id] ?? coachLevelByWordId?.get(word.id)
        : effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], {
            displayOrder,
          })
      : undefined;

  const wordHasLevel = (wordId: number) => {
    const item = wordsById.get(wordId);
    if (!item) return false;
    return (
      effectiveJpVocabDisplayLevel(item, sessionLevel[wordId], { displayOrder }) !=
      null
    );
  };

  const syncPhaseForHook =
    word != null ? wordSyncState[word.id] : undefined;
  const isSharingForHook =
    word != null ? word.id in shareProgressMap : false;
  const saveBusyForHook =
    isSharingForHook ||
    syncPhaseForHook === "queued" ||
    syncPhaseForHook === "syncing";
  const isSharedForHook =
    word != null ? (sharedTodayWordIds?.has(word.id) ?? false) : false;

  const sessionCheckedForHook = session
    ? session.wordIds.filter((id) => wordHasLevel(id)).length
    : 0;
  const sessionTotalForHook = session?.wordIds.length ?? 0;
  const sessionUncheckedForHook = Math.max(
    0,
    sessionTotalForHook - sessionCheckedForHook
  );
  const useDailyProgressForHook =
    !isCoachMode && dailyQuizProgress != null && dailyQuizProgress.total > 0;
  const uncheckedCountForHook = useDailyProgressForHook
    ? Math.max(
        0,
        dailyQuizProgress!.total -
          jpVocabDailyQuizProgressDisplayChecked(dailyQuizProgress!)
      )
    : sessionUncheckedForHook;
  const sessionCompleteForHook = isCoachMode
    ? false
    : dailyQuizProgress != null
      ? dailyQuizProgress.complete
      : sessionTotalForHook > 0 && sessionUncheckedForHook === 0;

  const {
    nextBlockedHint,
    syncWaitHint,
    remainingUncheckedHint,
    setNextBlockedHint,
    setSyncWaitHint,
    setRemainingUncheckedHint,
    tryGoNext,
  } = useJpVocabTeacherQuizNextAdvance({
    session: session ?? {
      mode: "random",
      wordIds: [],
      currentIndex: 0,
    },
    wordId: word?.id ?? 0,
    selected: selectedLevel != null,
    isShared: isSharedForHook,
    saveBusy: saveBusyForHook,
    isCoach: isCoachMode,
    isStudy: isStudyMode,
    previewMode,
    isSaving: word != null && savingWordId === word.id,
    canGoNext: Boolean(
      session && session.currentIndex < session.wordIds.length - 1
    ),
    sessionComplete: sessionCompleteForHook,
    wordHasLevel,
    uncheckedCount: uncheckedCountForHook,
    onNavigate,
    onComplete,
    onMarkCoached,
    onEnsureSharedBeforeNext,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // 不在换词时清 remainingUncheckedHint：点「完成抽查」跳到未勾选词后需保留提示
    if (!open || !word) setRemainingUncheckedHint(false);
  }, [open, word, setRemainingUncheckedHint]);

  useEffect(() => {
    if (!open || nestedModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (syncWaitHint) {
        setSyncWaitHint(false);
        return;
      }
      if (nextBlockedHint) {
        setNextBlockedHint(false);
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
  }, [
    open,
    nestedModalOpen,
    onClose,
    nextBlockedHint,
    remainingUncheckedHint,
    syncWaitHint,
  ]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!showAnswerTimer || !word) {
      setAnswerTimerArmed(false);
      answerTimerStartedAtRef.current = null;
      setAnswerElapsedSec(0);
      return;
    }
    // 仅依赖 word.id：勾选熟悉程度时不重新武装，保留已走秒数
    const alreadyChecked =
      effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], { displayOrder }) !=
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
    if (selectedLevel) setNextBlockedHint(false);
  }, [selectedLevel, setNextBlockedHint]);

  if (!open || !mounted || !session || !word || currentWordId == null) return null;

  const isCoach = isCoachMode;
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
  const risk = jpVocabFinalQuizScoreOrNull(w, quizTimeWeight);
  const riskBadgeTier =
    risk == null ? "never" : risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
  const showReadingPrimary = Boolean(readingTrim);
  const exampleSentences = parseJpVocabExampleSentenceItems(w.example_sentences);
  const isGrammar = w.kind === "grammar";
  const isConjugationGrammar =
    isGrammar && isJpVocabConjugationGrammar(w.word);
  const isContrastGrammar =
    isGrammar &&
    !isConjugationGrammar &&
    isJpVocabContrastGrammar(w.word, w.reading);
  const usageExamplePairs = buildJpVocabUsageExamplePairs(
    w.usage,
    w.example_sentences,
    { word: w.word, reading: w.reading }
  );
  const hasUsageText = Boolean(String(w.usage ?? "").trim());
  const examplesSectionTitle = isConjugationGrammar
    ? "例句"
    : isContrastGrammar
      ? "区别 / 例句"
      : isGrammar || hasUsageText
        ? "用法 / 例句"
        : "例句";
  const showExamples =
    isCoach ||
    isStudy ||
    exampleSentences.length > 0 ||
    Boolean(usageExamplePairs.hasContent) ||
    (canManualFillExamples && !isGrammar);
  // 有用法/例句区就始终露出「接序」块（空也显示「暂无接序」），避免库里还没补时整段消失像没加字段
  const showConnection =
    showExamples || hasJpVocabConnection(w.connection);
  const inlineConnection = jpVocabConnectionShownInlineWithUsage(
    w.usage,
    w.connection
  );
  const dailySeq = dailySeqByWordId.get(w.id);
  const sessionUncheckedCount = isCoach
    ? Math.max(0, session.wordIds.length - session.currentIndex - 1)
    : session.wordIds.reduce((count, id) => {
        const item = wordsById.get(id);
        if (!item) return count + 1;
        return effectiveJpVocabDisplayLevel(item, sessionLevel[id], { displayOrder }) ==
          null
          ? count + 1
          : count;
      }, 0);
  const useDailyProgress = !isCoach && dailyQuizProgress != null && dailyQuizProgress.total > 0;
  const uncheckedCount = useDailyProgress
    ? dailyQuizProgress.remaining
    : sessionUncheckedCount;
  const remainingLabel = isCoach
    ? locale === "zh"
      ? `还剩 ${uncheckedCount} 个未带读`
      : `${uncheckedCount} left to read`
    : locale === "zh"
      ? `还剩 ${uncheckedCount} 个未抽查`
      : `${uncheckedCount} left to quiz`;
  const sessionTotal = useDailyProgress
    ? dailyQuizProgress.total
    : session.wordIds.length;
  const sessionChecked = isCoach
    ? session.currentIndex + 1
    : useDailyProgress
      ? jpVocabDailyQuizProgressDisplayChecked(dailyQuizProgress)
      : Math.max(0, session.wordIds.length - sessionUncheckedCount);
  const sessionPct =
    sessionTotal > 0
      ? Math.min(100, Math.round((sessionChecked / sessionTotal) * 100))
      : 0;
  const sessionComplete = isCoach
    ? session.currentIndex >= session.wordIds.length - 1
    : useDailyProgress
      ? dailyQuizProgress.complete
      : session.wordIds.length > 0 && sessionUncheckedCount === 0;
  const progressLabel = isCoach
    ? `${session.currentIndex + 1} / ${session.wordIds.length}`
    : sessionComplete
      ? locale === "zh"
        ? "已完成"
        : "Done"
      : `${sessionChecked} / ${sessionTotal}`;
  const isSharing = w.id in shareProgressMap;
  const sharingPercent = shareProgressMap[w.id] ?? 0;
  const isShared = sharedTodayWordIds?.has(w.id) ?? false;
  const saveBusy = isSharing || isQueued || isSyncing;
  const saveProgressKind: JpVocabSaveProgressKind = isSharing
    ? "sync_to_student"
    : "save_level";
  const saveProgressLabel = isSharing
    ? JP_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL
    : jpVocabSaveProgressLabel(saveProgressKind, {
        queued: isQueued && !isSyncing,
      });
  const saveProgressPercent = isSharing
    ? sharingPercent
    : jpVocabSaveProgressDisplayPercent(null);
  const levelSyncHintShort = isShared
    ? JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT
    : JP_VOCAB_LEVEL_SYNC_HINT_SHORT;
  const levelSyncHint = isShared
    ? JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED
    : JP_VOCAB_LEVEL_SYNC_HINT;
  const canGoPrev = session.currentIndex > 0;
  const isLast = session.currentIndex === session.wordIds.length - 1;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return createPortal(
    <div className="jp-vocab-teacher-quiz-overlay" role="presentation">
      <article
        className={`jp-vocab-teacher-quiz-card${isCoach ? " jp-vocab-teacher-quiz-card--coach" : ""}${
          showAnswerTimer && answerTimerArmed
            ? " jp-vocab-teacher-quiz-card--with-timer"
            : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-teacher-quiz-title"
        onClick={stop}
      >
        <JpVocabFlashcardHeader
          isStudy={isStudy}
          isCoach={isCoach}
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


        <div className="jp-vocab-teacher-quiz__scroll-body">
        {studentPeeked && !isCoach && !isStudy ? (
          <p className="jp-vocab-teacher-quiz__student-peek-hint" role="status">
            该学生已查看该单词
          </p>
        ) : null}

        <JpVocabFlashcardWordHero
          readingTrim={readingTrim}
          wordTrim={wordTrim}
          kind={w.kind}
          refKey={w.ref_key}
          ref={ref}
          onOpenRef={onOpenRef}
          titleId="jp-vocab-teacher-quiz-title"
        />

        <section className="jp-vocab-teacher-quiz__info" aria-label="词条信息">
          <dl className="jp-vocab-teacher-quiz__meta">
            <dt>释义：</dt>
            <dd className={meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
              {meaningTrim ? (
                <span className="jp-vocab-teacher-quiz__meaning-wrap">
                  <span>{meaningTrim}</span>
                  <JpVocabSourceLabel
                    source={w.meaning_source}
                  />
                </span>
              ) : null}
            </dd>
            <dt>词性：</dt>
            <dd className={posTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
              {posTrim ? <span className="jp-vocab-teacher-quiz__pos">{posTrim}</span> : null}
            </dd>
            {!showReadingPrimary ? (
              <>
                <dt>读音</dt>
                <dd
                  className={
                    readingTrim || w.kind !== "word"
                      ? ""
                      : "jp-vocab-teacher-quiz__meta-empty"
                  }
                >
                  {readingTrim || (w.kind === "word" ? "待补全" : "—")}
                </dd>
              </>
            ) : null}
          </dl>
          {canOperate ? (
            <div className="jp-vocab-teacher-quiz__actions-row">
              <div className="jp-vocab-teacher-quiz__actions-left">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
                  onClick={() => onEditWord?.(w)}
                >
                  编辑
                </button>
                {w.ref_key ? (
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                    title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                    onClick={() => onOpenRef(w.ref_key!, ref)}
                  >
                    查看教案
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
                  title="编辑备注"
                  onClick={() => onEditRemarks?.(w)}
                >
                  编辑备注
                </button>
              </div>
              {shareUiEnabled && !isCoach && !isStudy ? (
                <div className="jp-vocab-teacher-quiz__actions-right" aria-label="发给学生">
                  {isShared ? (
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn jp-vocab-teacher-quiz__share-btn--unshare"
                      disabled={isSaving || isSharing || reviewLocked}
                      title={
                        reviewLocked
                          ? "勾选已满 1 小时，无法再操作"
                          : "从学生「今日日语单词」移除；若共享时自动标记了不熟悉，将一并撤销"
                      }
                      onClick={() => onUnshare?.(w.id)}
                    >
                      取消共享
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn${
                        reviewLocked ? " jp-vocab-teacher-quiz__share-btn--locked" : ""
                      }`}
                      disabled={isSaving || isSharing || reviewLocked}
                      title={
                        reviewLocked
                          ? "勾选已满 1 小时，无法再发给学生"
                          : "发给学生「今日日语单词」，并标记为不熟悉"
                      }
                      onClick={() => onShare?.(w.id)}
                    >
                      发给学生
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {showExamples ? (
          <section
            className="jp-vocab-teacher-quiz__examples"
            aria-label={examplesSectionTitle}
          >
            <div className="jp-vocab-teacher-quiz__examples-head">
              <h3 className="jp-vocab-teacher-quiz__examples-title">
                {examplesSectionTitle}
              </h3>
              <JpVocabFlashcardManualFillExamples
                word={w}
                enabled={canManualFillExamples}
                onPatched={(next) => {
                  setNotesWord(next);
                  onWordUpdated?.(next);
                }}
                endAction={
                  <>
                    {canOperate && onEditWord ? (
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
                        title="修改用法与例句（大模型写错或假名不对时可改）"
                        onClick={() => onEditWord(w)}
                      >
                        编辑用法/例句
                      </button>
                    ) : null}
                    <JpVocabUsageExamplesCopyButton
                      model={usageExamplePairs}
                      wordLabel={w.word}
                      connection={w.connection}
                    />
                  </>
                }
              />
            </div>
            <div className="jp-vocab-teacher-quiz__examples-body">
              <JpVocabUsageExamplesPairedContent
                usage={w.usage}
                exampleSentences={w.example_sentences}
                usageSource={w.usage_source}
                exampleSource={w.example_sentences_source}
                connection={w.connection}
                connectionSource={w.connection_source}
                wordLabel={w.word}
                model={usageExamplePairs}
                emptyText={
                  isGrammar ? "暂无用法与例句" : "暂无例句"
                }
              />
            </div>
          </section>
        ) : null}

        <JpVocabRelatedCompoundsSection
          relatedCompounds={w.related_compounds}
          relatedCompoundsSource={w.related_compounds_source}
          word={w.word}
          reading={w.reading}
          kind={w.kind}
        />

        {showConnection && !inlineConnection ? (
          <JpVocabConnectionSection
            connection={w.connection}
            connectionSource={w.connection_source}
            showWhenEmpty
          />
        ) : null}

        <JpVocabFlashcardNotesSection
          word={w}
          locale={locale}
          notesLoading={notesLoading}
          canOperate={canOperate}
          showPullLiveRemarks={isStudy && onShowPulledRemarks != null}
          onViewRemarks={onViewRemarks}
          onEditRemarks={onEditRemarks}
          onWordUpdated={(updated) => {
            setNotesWord(updated);
            onWordUpdated?.(updated);
          }}
          onShowPulledRemarks={onShowPulledRemarks ?? onViewRemarks}
        />
        <JpVocabAnnotationSection annotation={w.annotation} />
        <JpVocabCourseFreqMetaSection
          courseLabel={w.course_label}
          oralFrequency={w.oral_frequency}
          examFrequency={w.exam_frequency}
        />
        </div>

        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            {isStudy
              ? "熟悉程度（可改成对自己更严；仅本机，不同步老师）"
              : isCoach
                ? "熟悉程度（带读不可勾选，与抽问记录一致）"
                : previewMode
                  ? "预览模式：熟悉程度勾选仅为展示，不会保存"
                  : "请根据学生熟悉程度，勾选以下选项"}
          </p>
          <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
            <div className="jp-vocab-teacher-quiz__level-main">
              <div className="jp-vocab-levels" role="group" aria-label="学生熟悉程度">
                {LEVELS.map((lv) => {
                  const checked = selected === lv.key;
                  const levelDisabled =
                    previewMode || isCoach || reviewLocked || isSaving;
                  return (
                    <button
                      key={lv.key}
                      type="button"
                      className={`jp-vocab-level-opt${
                        checked ? " is-checked" : ""
                      }${
                        reviewLocked || previewMode || isCoach
                          ? " jp-vocab-level-opt--locked"
                          : ""
                      }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                        lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                      }`}
                      disabled={levelDisabled}
                      aria-pressed={checked}
                      title={
                        isStudy
                          ? "可改成对自己更严；只保存在本机，不会同步给老师"
                          : isCoach
                            ? "带读卡片不可勾选熟悉程度"
                            : previewMode
                              ? "预览模式，勾选不会保存"
                              : reviewLocked
                                ? "勾选已满 1 小时，无法再修改"
                                : checked
                                  ? "今日已选此项，可点其他选项改选"
                                  : "勾选学生熟悉程度"
                      }
                      onClick={() => {
                        if (levelDisabled) return;
                        setNextBlockedHint(false);
                        onSelectLevel(w.id, lv.key);
                      }}
                    >
                      <span className="jp-vocab-check-box" aria-hidden="true">
                        {checked ? (
                          <svg viewBox="0 0 12 12" width="10" height="10">
                            <path
                              d="M2 6l3 3 5-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span>{lv.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {!isStudy && !isCoach ? (
              <>
                <span
                  className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--desktop"
                  role="note"
                >
                  {levelSyncHintShort}
                </span>
                <span
                  className="jp-vocab-teacher-quiz__level-sync-hint jp-vocab-teacher-quiz__level-sync-hint--mobile"
                  role="note"
                >
                  {levelSyncHint}
                </span>
              </>
            ) : null}
          </div>
          {saveBusy ? (
            <JpVocabSaveProgressBar
              label={saveProgressLabel}
              percent={saveProgressPercent}
              fullWidth
              className="jp-vocab-teacher-quiz__level-progress"
            />
          ) : null}
        </div>

        <div className="jp-vocab-teacher-quiz__stats">
          <div className="jp-vocab-teacher-quiz__stat jp-vocab-teacher-quiz__stat--weight">
            <span className="jp-vocab-teacher-quiz__stat-label">
              {locale === "zh" ? (
                <>
                  抽查权重
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    （数值越大，越应该被抽查）
                  </span>
                </>
              ) : (
                <>
                  Quiz weight
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    {" "}
                    (higher = more likely to quiz)
                  </span>
                </>
              )}
            </span>
            <span
              className={`jp-vocab-teacher-quiz__risk jp-vocab-teacher-quiz__risk--${riskBadgeTier}`}
              title={
                risk == null
                  ? locale === "zh"
                    ? "从未抽查：不按优先级计分，日序默认置顶"
                    : "Never quizzed: no priority score"
                  : undefined
              }
            >
              {risk == null ? "—" : risk.toFixed(1)}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">今日抽查</span>
            <span
              className={
                todayChecks > 0
                  ? "jp-vocab-teacher-quiz__stat-value jp-vocab-teacher-quiz__stat-value--active"
                  : "jp-vocab-teacher-quiz__stat-value"
              }
            >
              {todayChecks}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">复习合计</span>
            <span
              className="jp-vocab-teacher-quiz__stat-value"
              title={totalDisplay.isZero ? jpVocabTotalReviewsZeroHint(locale) : undefined}
            >
              {totalDisplay.label}
            </span>
          </div>
          {/* 带读与抽问同布局：历史熟悉次数放在统计区，勿挪到熟悉程度区或隐藏 */}
          <div className="jp-vocab-teacher-quiz__stat-grid">
            <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
            <span>一般 {w.cnt_normal}</span>
            <span className="chg-up">不熟悉 {w.cnt_weak}</span>
          </div>
        </div>

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
              !previewMode && !isCoach && !isStudy && (!selected || saveBusy)
                ? " jp-vocab-teacher-quiz__nav-btn--blocked"
                : ""
            }${isStudy ? " jp-vocab-teacher-quiz__nav-btn--study-close" : ""}`}
            disabled={isCoach ? isSaving : false}
            onClick={tryGoNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {isStudy
                ? "关闭"
                : previewMode
                ? "关闭预览"
                : !isCoach && sessionComplete
                ? "完成抽查"
                : isLast
                  ? isCoach
                    ? "完成带读"
                    : "完成抽查"
                  : isCoach
                    ? "已带读，下一个"
                    : "下一个"}
            </span>
            {!isLast && !isCoach && !isStudy && !sessionComplete && !previewMode ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">
                {saveBusy ? "同步完成后再点" : "勾选后可点"}
              </span>
            ) : null}
          </button>
        </div>
      </article>

      <JpVocabFlashcardAlerts
        nextBlockedHint={nextBlockedHint}
        syncWaitHint={syncWaitHint}
        previewMode={previewMode}
        isCoach={isCoach}
        isStudy={isStudy}
        selected={selected}
        remainingUncheckedHint={remainingUncheckedHint}
        onDismissNextBlocked={() => setNextBlockedHint(false)}
        onDismissSyncWait={() => setSyncWaitHint(false)}
        onDismissRemaining={() => setRemainingUncheckedHint(false)}
        stop={stop}
      />

      <JpVocabTeacherQuizFlashcardStyles />
    </div>,
    document.body
  );
}
