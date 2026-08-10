"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
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
  enVocabFinalQuizScoreOrNull,
  enVocabPriorityLabel,
  formatEnVocabTotalReviewsDisplay,
} from "@/lib/en-vocab-shared";
import { type EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
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
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { useEnVocabFlashcardClassNotesFetch } from "@/hooks/useEnVocabFlashcardClassNotesFetch";
import { useEnVocabWordContentFetch } from "@/hooks/useEnVocabWordContentFetch";

import {
  EN_VOCAB_LEVEL_SYNC_HINT,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT,
  EN_VOCAB_LEVEL_SYNC_HINT_SHORT,
  EN_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL,
} from "@/components/en-vocab-teacher-quiz-flashcard/helpers";
import { advanceEnVocabTeacherQuizNext } from "@/components/en-vocab-teacher-quiz-flashcard/advanceTeacherQuizNext";
import { EnVocabFlashcardAlerts } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardAlerts";
import { EnVocabFlashcardPageBody } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageBody";
import { EnVocabFlashcardPageFooter } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageFooter";
import { EnVocabFlashcardPageHeader } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardPageHeader";

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
  onShare?: (wordId: number) => void | Promise<boolean | void>;
  /** 点「下一个」前：未共享则同步一次；已共享返回 true */
  onEnsureSharedBeforeNext?: (wordId: number) => Promise<boolean>;
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
  onEnsureSharedBeforeNext,
  onUnshare,
  onWordUpdated,
  nestedModalOpen = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  /** 未勾选熟悉程度就点「下一个」/共享 */
  const [nextBlockedHint, setNextBlockedHint] = useState(false);
  /** 有编号用法未齐时的拦截文案（列出未勾的 N.用法；不滚动定位） */
  const [nextBlockedUsageMessage, setNextBlockedUsageMessage] = useState<
    string | null
  >(null);
  /** 同步给学生未完成时点「下一个」 */
  const [syncWaitHint, setSyncWaitHint] = useState(false);
  /** 点「完成抽查」时会话内仍有未勾选词 */
  const [remainingUncheckedHint, setRemainingUncheckedHint] = useState(false);
  /** 本词答题正计时（秒）；换词归零，勾选熟悉程度后停住 */
  const [answerElapsedSec, setAnswerElapsedSec] = useState(0);
  /** 本词从「未勾选」进入时武装计时（已勾选返回上一词则不显示） */
  const [answerTimerArmed, setAnswerTimerArmed] = useState(false);
  const answerTimerStartedAtRef = useRef<number | null>(null);
  const nextAdvanceBusyRef = useRef(false);
  /** 保存中点了「下一个」：闲下来后自动继续同步并跳词 */
  const pendingNextAfterIdleRef = useRef(false);

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? null : null;
  const { contentWord } = useEnVocabWordContentFetch({
    open,
    word,
    locale,
    onWordUpdated,
  });
  const { notesWord, notesLoading } = useEnVocabFlashcardClassNotesFetch({
    open,
    word: contentWord?.id === word?.id ? contentWord : word,
    locale,
    onWordUpdated,
  });

  const isStudyMode = mode === "study";
  const showAnswerTimer =
    open && !previewMode && !isStudyMode && word != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // 只按 wordId / 开关卡重置 pending——禁止依赖整个 word / updated_at。
  // 勾选写库会乐观更新词条；若因此清掉 pendingNext，点「下一个」后保存成功也不会跳词。
  useEffect(() => {
    if (!open || !word) {
      setRemainingUncheckedHint(false);
      return;
    }
    setNextBlockedHint(false);
    setNextBlockedUsageMessage(null);
    setSyncWaitHint(false);
    nextAdvanceBusyRef.current = false;
    pendingNextAfterIdleRef.current = false;
    // 不在换词时清 remainingUncheckedHint：点「完成抽查」跳到未勾选词后需保留提示
  }, [open, word?.id]);

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

  const currentWordSaveBusy =
    word != null &&
    (savingWordId === word.id ||
      Boolean(shareProgressMap && word.id in shareProgressMap) ||
      wordSyncState[word.id] === "queued" ||
      wordSyncState[word.id] === "syncing");

  useEffect(() => {
    if (!currentWordSaveBusy) setSyncWaitHint(false);
  }, [currentWordSaveBusy]);

  const wordHasLevel = (wordId: number) => {
    if (sessionLevel[wordId] != null) return true;
    const item = wordsById.get(wordId);
    if (!item) return false;
    if (
      effectiveEnVocabDisplayLevel(item, sessionLevel[wordId], { displayOrder }) !=
      null
    ) {
      return true;
    }
    // 本会话用法草稿已勾齐也算已抽（写库失败/未回写 selected 时，「下一个」仍须能跳）
    const slotCount = listEnVocabUsagePointsForDisplay(item.usage).points.length;
    if (slotCount <= 0) return false;
    const draft = sessionUsageLevels[wordId];
    return (
      Array.isArray(draft) && areEnVocabUsageLevelsComplete(draft, slotCount)
    );
  };

  useEffect(() => {
    if (currentWordSaveBusy) return;
    if (!pendingNextAfterIdleRef.current) return;
    if (!open || !session || !word || previewMode || isStudyMode) return;
    const draftSlotCount = listEnVocabUsagePointsForDisplay(word.usage).points
      .length;
    const draftComplete =
      draftSlotCount > 0 &&
      Array.isArray(sessionUsageLevels[word.id]) &&
      areEnVocabUsageLevelsComplete(
        sessionUsageLevels[word.id]!,
        draftSlotCount
      );
    // 用法已齐即可继续；勿死等 selected（写库失败时 selected 会一直空）
    if (selectedLevel == null && !draftComplete) return;
    pendingNextAfterIdleRef.current = false;
    setSyncWaitHint(false);
    const wordId = word.id;
    const alreadyShared = sharedTodayWordIds?.has(wordId) ?? false;
    void (async () => {
      if (nextAdvanceBusyRef.current) return;
      nextAdvanceBusyRef.current = true;
      try {
        if (!alreadyShared && onEnsureSharedBeforeNext) {
          const ok = await onEnsureSharedBeforeNext(wordId);
          if (!ok) {
            // 同步失败：保留 pending，允许再点「下一个」重试
            pendingNextAfterIdleRef.current = true;
            setSyncWaitHint(true);
            return;
          }
        }
        const sessionChecked = session.wordIds.filter((id) =>
          wordHasLevel(id)
        ).length;
        const sessionUnchecked = Math.max(
          0,
          session.wordIds.length - sessionChecked
        );
        const useDaily =
          dailyQuizProgress != null && dailyQuizProgress.total > 0;
        const unchecked = useDaily
          ? Math.max(
              0,
              dailyQuizProgress!.total -
                enVocabDailyQuizProgressDisplayChecked(dailyQuizProgress!)
            )
          : sessionUnchecked;
        const complete = useDaily
          ? Boolean(dailyQuizProgress!.complete) ||
            (session.wordIds.length > 0 && sessionUnchecked === 0)
          : session.wordIds.length > 0 && sessionUnchecked === 0;
        if (complete) {
          onComplete();
          return;
        }
        advanceEnVocabTeacherQuizNext({
          session,
          wordHasLevel,
          uncheckedCount: unchecked,
          onNavigate,
          onComplete,
          setRemainingUncheckedHint,
        });
      } finally {
        nextAdvanceBusyRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentWordSaveBusy,
    open,
    session,
    word?.id,
    selectedLevel,
    sessionUsageLevels,
    previewMode,
    isStudyMode,
    sharedTodayWordIds,
    onEnsureSharedBeforeNext,
  ]);

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
  // 换词后 notesWord 可能仍是上一词：禁止拿旧备注盖住新词正文（否则像「下一个不出现」）
  const hydrated =
    contentWord?.id === word.id ? contentWord : word;
  const w =
    notesWord?.id === word.id
      ? {
          ...hydrated,
          class_notes: notesWord.class_notes,
          class_notes_present: notesWord.class_notes_present,
          updated_at: notesWord.updated_at || hydrated.updated_at,
        }
      : hydrated;
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
  const risk = enVocabFinalQuizScoreOrNull(w);
  const riskBadgeTier =
    risk == null ? "never" : risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatEnVocabTotalReviewsDisplay(w, locale);
  const priorityLabel = enVocabPriorityLabel(locale);
  const hasNotes = hasEnVocabClassNotes(w.class_notes, w.class_notes_present);
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
    previewMode || reviewLocked || isSaving || (!isStudy && !canOperate);
  const usageLevelDisabledReason = previewMode
    ? "预览模式：用法旁熟悉程度仅为展示，不会保存"
    : isStudy
      ? "可改成对自己更严；只保存在本机，不会同步给老师"
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
  const sessionLocalChecked = Math.max(
    0,
    session.wordIds.length - sessionUncheckedCount
  );
  const useDailyProgress = dailyQuizProgress != null && dailyQuizProgress.total > 0;
  // 本轮进度：分母用今日抽查池大小（须稳定，勿用「仅剩未勾选」短分母）；
  // 分子取「页面进度」与「本会话已勾」较大值（防 page 短暂 0 时卡片卡 0/N）
  const dailyChecked = useDailyProgress
    ? enVocabDailyQuizProgressDisplayChecked(dailyQuizProgress)
    : 0;
  const sessionTotal = useDailyProgress
    ? dailyQuizProgress.total
    : session.wordIds.length;
  const sessionChecked = useDailyProgress
    ? Math.min(sessionTotal, Math.max(dailyChecked, sessionLocalChecked))
    : sessionLocalChecked;
  const uncheckedCount = Math.max(0, sessionTotal - sessionChecked);
  const remainingLabel =
    locale === "zh"
      ? `还剩 ${uncheckedCount} 个未抽查`
      : `${uncheckedCount} left to quiz`;
  const sessionPct =
    sessionTotal > 0
      ? Math.min(100, Math.round((sessionChecked / sessionTotal) * 100))
      : 0;
  // 完成态：以页面 progress.complete 为准，或本会话词全部已有熟悉程度；
  // 禁止用 sessionChecked >= sessionTotal 跨「短分母」误判（刷新假已完成）
  const sessionComplete = useDailyProgress
    ? Boolean(dailyQuizProgress.complete) ||
      (session.wordIds.length > 0 && sessionUncheckedCount === 0)
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
  const saveProgressKind: JpVocabSaveProgressKind = isSharing
    ? "sync_to_student"
    : "save_level";
  const saveProgressLabel = isSharing
    ? EN_VOCAB_SYNC_ON_NEXT_PROGRESS_LABEL
    : jpVocabSaveProgressLabel(saveProgressKind, {
        queued: isQueued && !isSyncing,
      });
  const saveProgressPercent = isSharing
    ? sharingPercent
    : jpVocabSaveProgressDisplayPercent(null);
  const levelSyncHintShort = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT
    : usePerUsageLevels
      ? "点「下一个」时同步给学生"
      : EN_VOCAB_LEVEL_SYNC_HINT_SHORT;
  const levelSyncHint = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED
    : usePerUsageLevels
      ? "每条用法都勾完后，点「下一个」才同步给学生复习查看（每词只同步一次）"
      : EN_VOCAB_LEVEL_SYNC_HINT;
  const canGoPrev = session.currentIndex > 0;
  const isLast = session.currentIndex === session.wordIds.length - 1;
  /* 备注在底栏熟悉程度/统计上方，不再占右侧栏 */
  const showSideCol = showUsageExamples;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const runAdvanceAfterShare = () => {
    if (sessionComplete) {
      onComplete();
      return;
    }
    // 当前词：用法草稿已齐即视为已抽（同 tick 内 sessionUsageLevels 可能尚未提交）
    const currentUsagesComplete =
      usePerUsageLevels &&
      areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount);
    const hasLevel = (wordId: number) => {
      if (wordHasLevel(wordId)) return true;
      return wordId === w.id && currentUsagesComplete;
    };
    advanceEnVocabTeacherQuizNext({
      session,
      wordHasLevel: hasLevel,
      uncheckedCount,
      onNavigate,
      onComplete,
      setRemainingUncheckedHint,
    });
  };

  const runShareThenAdvance = async () => {
    if (nextAdvanceBusyRef.current) return;
    nextAdvanceBusyRef.current = true;
    try {
      if (!isShared && onEnsureSharedBeforeNext) {
        const ok = await onEnsureSharedBeforeNext(w.id);
        if (!ok) {
          pendingNextAfterIdleRef.current = true;
          setSyncWaitHint(true);
          return;
        }
      }
      runAdvanceAfterShare();
    } finally {
      nextAdvanceBusyRef.current = false;
    }
  };

  const tryGoNext = () => {
    if (previewMode || isStudy) {
      if (previewMode && session.currentIndex < session.wordIds.length - 1) {
        onNavigate(session.currentIndex + 1);
        return;
      }
      onComplete();
      return;
    }
    const usagesComplete =
      usePerUsageLevels &&
      areEnVocabUsageLevelsComplete(usageDraftLevels, usageSlotCount);
    if (!selected && !usagesComplete) {
      if (usePerUsageLevels) {
        showUncheckedUsagesBlocked(usageDraftLevels, "再点「下一个」");
        return;
      }
      setNextBlockedUsageMessage(null);
      setNextBlockedHint(true);
      return;
    }
    // 用法已齐但 selected 未回写：仍触发写库；跳词不再死等 selected
    if (!selected && usagesComplete && onSelectUsageLevels) {
      onSelectUsageLevels(w.id, usageDraftLevels);
    }
    if (saveBusy || nextAdvanceBusyRef.current) {
      pendingNextAfterIdleRef.current = true;
      setSyncWaitHint(true);
      return;
    }
    setSyncWaitHint(false);
    void runShareThenAdvance();
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
          wordId={w.id}
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
          wordSynced={isShared && !saveBusy}
        />

        {/* 中间可滚：左侧含备注 + 用法 + 熟悉程度/统计；「上一个·下一个」钉在底 */}
        <div className="en-vocab-flashcard-page__scroll">
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
            previewMode={previewMode}
            locale={locale}
            onEditWord={onEditWord}
            onEditRemarks={onEditRemarks}
            onViewRemarks={onViewRemarks}
            hasNotes={hasNotes}
            notesLoading={notesLoading}
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
            canOperate={canOperate}
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
            locale={locale}
            priorityLabel={priorityLabel}
            riskBadgeTier={riskBadgeTier}
            totalDisplay={totalDisplay}
            risk={risk}
            todayChecks={todayChecks}
            hasNotes={hasNotes}
            notesLoading={notesLoading}
            onViewRemarks={onViewRemarks}
            onEditRemarks={onEditRemarks}
            onSelectLevel={onSelectLevel}
            setNextBlockedHint={setNextBlockedHint}
          />
        </div>

        <div className="jp-vocab-teacher-quiz__nav en-vocab-flashcard-page__nav">
          {saveBusy && !isStudy && !previewMode ? (
            <JpVocabSaveProgressBar
              label={saveProgressLabel}
              percent={saveProgressPercent}
              fullWidth
              className="en-vocab-flashcard-page__nav-progress"
            />
          ) : null}
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
              !previewMode && !isStudy && (!selected || saveBusy)
                ? " jp-vocab-teacher-quiz__nav-btn--blocked"
                : ""
            }${isStudy ? " jp-vocab-teacher-quiz__nav-btn--study-close" : ""}`}
            onClick={tryGoNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {isStudy
                ? "关闭"
                : previewMode
                  ? isLast
                    ? "关闭预览"
                    : "下一个"
                  : saveBusy
                    ? "同步中…"
                    : sessionComplete
                      ? "完成抽查"
                      : isLast
                        ? "完成抽查"
                        : "下一个"}
            </span>
            {!isLast && !isStudy && !sessionComplete && !previewMode ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">
                {saveBusy ? "同步完成后再点" : "勾选后可点"}
              </span>
            ) : null}
          </button>
        </div>
      </article>

      <EnVocabFlashcardAlerts
        nextBlockedHint={nextBlockedHint}
        syncWaitHint={syncWaitHint}
        previewMode={previewMode}
        isStudy={isStudy}
        selected={selected}
        nextBlockedUsageMessage={nextBlockedUsageMessage}
        remainingUncheckedHint={remainingUncheckedHint}
        onDismissNextBlocked={() => {
          setNextBlockedHint(false);
          setNextBlockedUsageMessage(null);
        }}
        onDismissSyncWait={() => setSyncWaitHint(false)}
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
