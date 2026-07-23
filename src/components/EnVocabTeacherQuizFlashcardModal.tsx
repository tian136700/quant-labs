"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { EnVocabUsageExamplesPairedContent } from "@/components/EnVocabUsageExamplesPairedContent";
import {
  hasEnVocabClassNotes,
  parseEnVocabClassNotes,
} from "@/lib/en-vocab-class-notes";
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
  parseEnVocabLastUsageLevels,
} from "@/lib/en-vocab-review";
import {
  enVocabPriorityLabel,
  enVocabRiskIndex,
  enVocabTotalReviewsZeroHint,
  formatEnVocabTotalReviewsDisplay,
} from "@/lib/en-vocab-shared";
import {
  enVocabTeacherQuizModeLabel,
  enVocabTeacherQuizNotesInline,
  findFirstUncheckedEnVocabTeacherQuizIndex,
  mergeEnVocabWordAfterClassNotesFetch,
  type EnVocabTeacherQuizSession,
} from "@/lib/en-vocab-teacher-quiz";
import {
  buildEnVocabUsageExamplePairs,
  listEnVocabUsagePointsForDisplay,
} from "@/lib/en-vocab-usage-examples-display";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  type JpVocabSaveProgressKind,
} from "@/lib/jp-vocab-save-progress";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

/** 老师抽查卡片右上角计时器：MM:SS（从 00:00 起计，不落库） */
function formatEnVocabQuizElapsedLabel(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const LEVEL_LABEL: Record<EnVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};
const EN_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
const EN_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";
const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT = "已共享给学生，勾选仅更新熟悉程度";
const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "已共享给学生，勾选熟悉程度仅更新记录，不会重复发送";

/** 多条历史备注合并为展示用正文（不含时间戳行） */
function formatEnVocabClassNotesForDisplay(raw: string | null | undefined): string {
  return parseEnVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

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
  const storedUsageLevels = parseEnVocabLastUsageLevels(w.last_usage_levels);
  const sessionUsageDraft = sessionUsageLevels[w.id];
  const usageDraftLevels: Array<EnVocabLevel | null | undefined> = (() => {
    if (!usePerUsageLevels) return [];
    if (sessionUsageDraft && sessionUsageDraft.length === usageSlotCount) {
      return sessionUsageDraft;
    }
    if (
      selected &&
      storedUsageLevels &&
      storedUsageLevels.length === usageSlotCount
    ) {
      return storedUsageLevels;
    }
    return Array.from({ length: usageSlotCount }, () => null);
  })();
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
        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              {isStudy ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  今日共享
                </span>
              ) : previewMode ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  管理员预览
                </span>
              ) : session ? (
                <span
                  className="jp-vocab-teacher-quiz__mode"
                  title={
                    session.mode === "random"
                      ? locale === "zh"
                        ? "本轮为随机抽查"
                        : "This round is random order"
                      : locale === "zh"
                        ? "本轮为正序抽查"
                        : "This round is sequential order"
                  }
                >
                  {enVocabTeacherQuizModeLabel(session.mode, locale)}
                </span>
              ) : null}
              {!isStudy && dailySeq != null ? (
                <span className="jp-vocab-teacher-quiz__seq" title="今日固定序号">
                  序号 {dailySeq}
                </span>
              ) : null}
              {!isStudy ? (
                <span className="jp-vocab-teacher-quiz__progress">{progressLabel}</span>
              ) : null}
              {!sessionComplete && !previewMode && !isStudy ? (
                <span className="jp-vocab-teacher-quiz__remaining">{remainingLabel}</span>
              ) : null}
            </div>
            <div className="jp-vocab-teacher-quiz__header-right">
              {showAnswerTimer && answerTimerArmed ? (
                <div
                  className={`jp-vocab-teacher-quiz__answer-timer${
                    selected ? " jp-vocab-teacher-quiz__answer-timer--frozen" : ""
                  }`}
                  role="timer"
                  aria-live="off"
                  aria-atomic="true"
                  title={
                    locale === "zh"
                      ? selected
                        ? "计时器（勾选后已停住）"
                        : "计时器（从打开卡片起）"
                      : selected
                        ? "Timer (paused)"
                        : "Timer"
                  }
                >
                  <span className="jp-vocab-teacher-quiz__answer-timer-label">
                    {locale === "zh" ? "计时器" : "Timer"}
                  </span>
                  <span className="jp-vocab-teacher-quiz__answer-timer-value">
                    {formatEnVocabQuizElapsedLabel(answerElapsedSec)}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="jp-vocab-teacher-quiz__close-x"
                aria-label={
                  isStudy ? "关闭" : previewMode ? "关闭预览" : "关闭抽查"
                }
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </div>
          {!isStudy ? (
            <div
              className={`jp-vocab-teacher-quiz__header-progress${
                sessionComplete
                  ? " jp-vocab-teacher-quiz__header-progress--complete"
                  : ""
              }`}
            >
              <div className="jp-vocab-teacher-quiz__header-progress-head">
                <span className="jp-vocab-teacher-quiz__header-progress-title">
                  {previewMode
                    ? locale === "zh"
                      ? "抽问卡片预览"
                      : "Quiz card preview"
                    : locale === "zh"
                      ? "本轮抽查进度"
                      : "Round progress"}
                </span>
                <span className="jp-vocab-teacher-quiz__header-progress-stats">
                  {sessionComplete ? (
                    <span className="jp-vocab-teacher-quiz__header-progress-done">
                      {locale === "zh" ? "已完成" : "Done"}
                    </span>
                  ) : (
                    <>
                      <strong>{sessionChecked}</strong>
                      <span className="jp-vocab-teacher-quiz__header-progress-sep">
                        /
                      </span>
                      {sessionTotal}
                      <span className="jp-vocab-teacher-quiz__header-progress-remaining">
                        （剩余 {uncheckedCount}）
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div
                className="jp-vocab-teacher-quiz__progress-track"
                role="progressbar"
                aria-valuenow={sessionPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={
                  locale === "zh"
                    ? `本轮已抽查 ${sessionChecked} / ${sessionTotal}`
                    : `Round ${sessionChecked} / ${sessionTotal}`
                }
              >
                <div
                  className="jp-vocab-teacher-quiz__progress-fill"
                  style={{ width: `${sessionPct}%` }}
                />
              </div>
            </div>
          ) : null}
        </header>

        <div className="jp-vocab-teacher-quiz__scroll-body en-vocab-flashcard-page__body">
          {studentPeeked && !isStudy ? (
            <p className="jp-vocab-teacher-quiz__student-peek-hint" role="status">
              该学生已查看该单词
            </p>
          ) : null}

          <div
            className={`en-vocab-flashcard-page__grid${
              showSideCol ? "" : " en-vocab-flashcard-page__grid--single"
            }`}
          >
            <div className="en-vocab-flashcard-page__col-main">
              <div
                className="jp-vocab-teacher-quiz__hero"
                id="en-vocab-teacher-quiz-title"
              >
                <div className="jp-vocab-teacher-quiz__reading-row en-vocab-flashcard-reading-row">
                  <div className="en-vocab-flashcard-lemma-group">
                    {wordTrim ? <EnVocabSpeakButton text={wordTrim} /> : null}
                    <span
                      className={`jp-vocab-teacher-quiz__kind-prefix en-vocab-flashcard-kind${
                        w.kind === "grammar"
                          ? " jp-vocab-teacher-quiz__kind-prefix--grammar"
                          : ""
                      }`}
                    >
                      {w.kind === "grammar" ? "语法：" : "单词："}
                    </span>
                    {w.ref_key ? (
                      <button
                        type="button"
                        className="jp-vocab-teacher-quiz__word-link jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma"
                        title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                        onClick={() => onOpenRef(w.ref_key!, ref)}
                      >
                        {wordTrim || "—"}
                      </button>
                    ) : (
                      <span className="jp-vocab-teacher-quiz__word-main en-vocab-flashcard-lemma">
                        {wordTrim || "—"}
                      </span>
                    )}
                  </div>
                  {readingTrim ? (
                    <span
                      className="jp-vocab-teacher-quiz__kanji en-vocab-flashcard-ipa"
                      title={readingTrim}
                    >
                      {readingTrim}
                    </span>
                  ) : null}
                </div>
                {readingTrim ? (
                  <div className="en-vocab-flashcard-ipa-source">
                    <JpVocabSourceLabel source={w.reading_source} />
                  </div>
                ) : w.kind === "word" ? (
                  <p
                    className="jp-vocab-teacher-quiz__meta-empty"
                    style={{ margin: "0.35rem 0 0", textAlign: "center" }}
                  >
                    音标待补全
                  </p>
                ) : null}
                {w.ref_key ? (
                  <button
                    type="button"
                    className="jp-vocab-teacher-quiz__ref-hint"
                    title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                    onClick={() => onOpenRef(w.ref_key!, ref)}
                  >
                    （点击查看教案）
                  </button>
                ) : null}
              </div>

              <section
                className="jp-vocab-teacher-quiz__info"
                aria-label="词条信息"
              >
                <dl className="jp-vocab-teacher-quiz__meta">
                  <dt>释义：</dt>
                  <dd
                    className={
                      meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"
                    }
                  >
                    {meaningTrim ? (
                      <span className="jp-vocab-teacher-quiz__meaning-wrap">
                        <span>{meaningTrim}</span>
                        <JpVocabSourceLabel source={w.meaning_source} />
                      </span>
                    ) : null}
                  </dd>
                  <dt>词性：</dt>
                  <dd
                    className={posTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}
                  >
                    {posTrim ? (
                      <span className="jp-vocab-teacher-quiz__pos">{posTrim}</span>
                    ) : null}
                  </dd>
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
                    {shareUiEnabled && !isStudy ? (
                      <div
                        className="jp-vocab-teacher-quiz__actions-right"
                        aria-label="共享给学生"
                      >
                        {isShared ? (
                          onUnshare ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn jp-vocab-teacher-quiz__share-btn--unshare"
                              disabled={isSaving || isSharing || reviewLocked}
                              title={
                                reviewLocked
                                  ? "勾选已满 1 小时，无法再操作"
                                  : "从学生「今日英语单词」移除"
                              }
                              onClick={() => onUnshare(w.id)}
                            >
                              取消共享
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn"
                              disabled
                              title="今日已共享到学生「今日英语单词」"
                            >
                              已共享
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className={`btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn jp-vocab-teacher-quiz__share-btn${
                              reviewLocked
                                ? " jp-vocab-teacher-quiz__share-btn--locked"
                                : ""
                            }`}
                            disabled={
                              isSaving ||
                              isSharing ||
                              reviewLocked ||
                              !usagesCompleteForShare
                            }
                            title={
                              reviewLocked
                                ? "勾选已满 1 小时，无法再共享"
                                : !usagesCompleteForShare
                                  ? "请先勾完每条用法的熟悉程度，再共享给学生"
                                  : "共享到学生「今日英语单词」"
                            }
                            onClick={() => {
                              if (!usagesCompleteForShare) {
                                showUncheckedUsagesBlocked(
                                  usageDraftLevels,
                                  "再共享给学生"
                                );
                                return;
                              }
                              onShare?.(w.id);
                            }}
                          >
                            共享
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            {showSideCol ? (
            <div className="en-vocab-flashcard-page__col-side">
              {showUsageExamples ? (
                <section
                  className="jp-vocab-teacher-quiz__examples"
                  aria-label="用法与例句"
                >
                  <div className="jp-vocab-teacher-quiz__examples-head">
                    <h3 className="jp-vocab-teacher-quiz__examples-title">
                      用法与例句
                    </h3>
                  </div>
                  <div className="jp-vocab-teacher-quiz__examples-body">
                    <EnVocabUsageExamplesPairedContent
                      usage={w.usage}
                      exampleSentences={w.example_sentences}
                      usageSource={w.usage_source}
                      exampleSource={w.example_sentences_source}
                      model={usageExampleModel}
                      emptyText="暂无用法与例句"
                      usageLevelControls={
                        usePerUsageLevels
                          ? {
                              levels: usageDraftLevels,
                              disabled:
                                previewMode ||
                                isStudy ||
                                reviewLocked ||
                                isSaving,
                              onSelect: (usageIndex, level) => {
                                if (
                                  previewMode ||
                                  isStudy ||
                                  reviewLocked ||
                                  isSaving
                                ) {
                                  return;
                                }
                                setNextBlockedHint(false);
                                setNextBlockedUsageMessage(null);
                                const next = usageDraftLevels.map((lv, i) =>
                                  i === usageIndex ? level : lv ?? null
                                );
                                onSelectUsageLevels?.(w.id, next);
                              },
                            }
                          : null
                      }
                    />
                  </div>
                </section>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>

        <div className="en-vocab-flashcard-page-footer">
        {/* 备注贴在熟悉程度+统计上方（勿放到两框下面） */}
        {hasNotes || canOperate ? (
          <section className="jp-vocab-teacher-quiz__notes en-vocab-flashcard-page-footer__notes">
            <div className="jp-vocab-teacher-quiz__notes-head">
              <h3 className="jp-vocab-teacher-quiz__notes-title">备注</h3>
              <div className="jp-vocab-teacher-quiz__notes-actions">
                {hasNotes ? (
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-teacher-quiz__action-btn"
                    onClick={() => onViewRemarks(w)}
                  >
                    查看
                  </button>
                ) : null}
                {canOperate ? (
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--success jp-vocab-teacher-quiz__action-btn"
                    title="编辑备注"
                    onClick={() => onEditRemarks?.(w)}
                  >
                    编辑备注
                  </button>
                ) : null}
              </div>
            </div>
            {hasNotes ? (
              notesInline ? (
                <div className="jp-vocab-teacher-quiz__notes-body">
                  <EnVocabClassNoteContent
                    content={formatEnVocabClassNotesForDisplay(w.class_notes)}
                  />
                </div>
              ) : (
                <p className="jp-vocab-teacher-quiz__notes-preview">
                  备注较长，请点「查看」
                </p>
              )
            ) : (
              <p className="jp-vocab-teacher-quiz__notes-preview jp-vocab-teacher-quiz__meta-empty">
                暂无备注
              </p>
            )}
          </section>
        ) : null}
        <div className="en-vocab-flashcard-page-footer__panels">
        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            {isStudy
              ? "老师勾选"
              : previewMode
                ? usePerUsageLevels
                  ? "预览模式：用法旁熟悉程度仅为展示，不会保存"
                  : "预览模式：熟悉程度勾选仅为展示，不会保存"
                : usePerUsageLevels
                  ? "请在每条用法旁勾选熟悉程度（全部勾完后才写入并同步给学生）"
                  : "请根据学生熟悉程度，勾选以下选项"}
          </p>
          <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
            <div className="jp-vocab-teacher-quiz__level-main">
              {usePerUsageLevels ? (
                <p
                  className="en-vocab-flashcard-overall-level"
                  aria-live="polite"
                >
                  总体：
                  {selected
                    ? LEVEL_LABEL[selected]
                    : overallFromUsages
                      ? LEVEL_LABEL[overallFromUsages]
                      : "（请勾完每条用法）"}
                </p>
              ) : (
                <div
                  className="jp-vocab-levels"
                  role="group"
                  aria-label="学生熟悉程度"
                >
                  {LEVELS.map((lv) => {
                    const checked = selected === lv.key;
                    const levelDisabled =
                      previewMode || isStudy || reviewLocked || isSaving;
                    return (
                      <button
                        key={lv.key}
                        type="button"
                        className={`jp-vocab-level-opt${
                          checked ? " is-checked" : ""
                        }${
                          reviewLocked || previewMode || isStudy
                            ? " jp-vocab-level-opt--locked"
                            : ""
                        }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                          lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                        }`}
                        disabled={levelDisabled}
                        aria-pressed={checked}
                        title={
                          isStudy
                            ? "老师已勾选的熟悉程度"
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
              )}
            </div>
            {!isStudy ? (
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
                  {priorityLabel}
                  <span className="jp-vocab-teacher-quiz__stat-hint">
                    （数值越大，越应该被抽查）
                  </span>
                </>
              ) : (
                <>
                  {priorityLabel}
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
                totalDisplay.isZero
                  ? enVocabTotalReviewsZeroHint(locale)
                  : undefined
              }
            >
              {risk.toFixed(1)}
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
              title={
                totalDisplay.isZero
                  ? enVocabTotalReviewsZeroHint(locale)
                  : undefined
              }
            >
              {totalDisplay.label}
            </span>
          </div>
          <div className="jp-vocab-teacher-quiz__stat-grid">
            <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
            <span>一般 {w.cnt_normal}</span>
            <span className="chg-up">不熟悉 {w.cnt_weak}</span>
          </div>
        </div>
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

      {nextBlockedHint && !previewMode && !isStudy && !selected ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => {
            setNextBlockedHint(false);
            setNextBlockedUsageMessage(null);
          }}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="en-vocab-teacher-quiz-alert-title"
            aria-describedby="en-vocab-teacher-quiz-alert-desc"
            onClick={stop}
          >
            <h3
              id="en-vocab-teacher-quiz-alert-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              请先勾选熟悉程度
            </h3>
            <p
              id="en-vocab-teacher-quiz-alert-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              {nextBlockedUsageMessage ??
                "请先勾选学生的熟悉程度，再进入下一词。"}
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => {
                setNextBlockedHint(false);
                setNextBlockedUsageMessage(null);
              }}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {remainingUncheckedHint && !previewMode ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => setRemainingUncheckedHint(false)}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="en-vocab-teacher-quiz-remain-title"
            aria-describedby="en-vocab-teacher-quiz-remain-desc"
            onClick={stop}
          >
            <h3
              id="en-vocab-teacher-quiz-remain-title"
              className="jp-vocab-teacher-quiz-alert__title"
            >
              还有未抽查词条
            </h3>
            <p
              id="en-vocab-teacher-quiz-remain-desc"
              className="jp-vocab-teacher-quiz-alert__desc"
            >
              本轮仍有词条未勾选熟悉程度，已为你跳到下一词。请继续勾选后完成抽查。
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => setRemainingUncheckedHint(false)}
            >
              继续抽查
            </button>
          </div>
        </div>
      ) : null}

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
