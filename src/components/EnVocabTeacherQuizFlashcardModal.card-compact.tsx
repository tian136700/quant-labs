"use client";

/**
 * 英语抽问卡 · 窄卡片布局备份（回滚用）
 *
 * 当前线上主组件是同目录的 EnVocabTeacherQuizFlashcardModal.tsx（近全屏网页式弹层）。
 * 若要回滚窄卡片：
 *   1) 用本文件覆盖 EnVocabTeacherQuizFlashcardModal.tsx
 *   2) 把下方导出名改回 EnVocabTeacherQuizFlashcardModal
 *  3) 去掉主组件上的 en-vocab-flashcard-page 类即可（样式留着无害）
 *
 * 本文件故意改名导出，避免被误 import 打进 Worker 包。
 */

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
import { effectiveEnVocabDisplayLevel } from "@/lib/en-vocab-review";
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
import { buildEnVocabUsageExamplePairs } from "@/lib/en-vocab-usage-examples-display";
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
import { EnVocabFlashcardAlerts } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardAlerts";
import { EnVocabFlashcardCompactHeader } from "@/components/en-vocab-teacher-quiz-flashcard/EnVocabFlashcardCompactHeader";
import {
  EN_VOCAB_LEVEL_SYNC_HINT,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED,
  EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT,
  EN_VOCAB_LEVEL_SYNC_HINT_SHORT,
  LEVELS,
  LEVEL_LABEL,
  formatEnVocabClassNotesForDisplay,
  formatEnVocabQuizElapsedLabel,
} from "@/components/en-vocab-teacher-quiz-flashcard/helpers";

type Props = {
  open: boolean;
  session: EnVocabTeacherQuizSession | null;
  wordsById: Map<number, EnVocabWord>;
  refs: Record<string, EnVocabRef>;
  locale: "zh" | "en";
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
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
  onSelectLevel: (wordId: number, level: EnVocabLevel) => void;
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

export function EnVocabTeacherQuizFlashcardModalCardCompact({
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
  onClose,
  onComplete,
  onSelectLevel,
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
  /** 未勾选熟悉程度就点「下一个」 */
  const [nextBlockedHint, setNextBlockedHint] = useState(false);
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
    if (selectedLevel) setNextBlockedHint(false);
  }, [selectedLevel]);

  const wordHasLevel = (wordId: number) => {
    const item = wordsById.get(wordId);
    if (!item) return false;
    return (
      effectiveEnVocabDisplayLevel(item, sessionLevel[wordId], { displayOrder }) !=
      null
    );
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
  const saveBusy = isSharing || isQueued || isSyncing;
  const saveProgressKind: JpVocabSaveProgressKind = isShared
    ? "save_level"
    : selected
      ? "sync_to_student"
      : "share";
  const saveProgressLabel = jpVocabSaveProgressLabel(saveProgressKind, {
    queued: isQueued && !isSyncing,
  });
  const saveProgressPercent = isSharing
    ? sharingPercent
    : jpVocabSaveProgressDisplayPercent(null);
  const levelSyncHintShort = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT
    : EN_VOCAB_LEVEL_SYNC_HINT_SHORT;
  const levelSyncHint = isShared
    ? EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED
    : EN_VOCAB_LEVEL_SYNC_HINT;
  const canGoPrev = session.currentIndex > 0;
  const isLast = session.currentIndex === session.wordIds.length - 1;

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
    <div className="jp-vocab-teacher-quiz-overlay" role="presentation">
      <article
        className={`jp-vocab-teacher-quiz-card${
          showAnswerTimer && answerTimerArmed
            ? " jp-vocab-teacher-quiz-card--with-timer"
            : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-vocab-teacher-quiz-title"
        onClick={stop}
      >
        <EnVocabFlashcardCompactHeader
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


        <div className="jp-vocab-teacher-quiz__scroll-body">
          {studentPeeked && !isStudy ? (
            <p className="jp-vocab-teacher-quiz__student-peek-hint" role="status">
              该学生已查看该单词
            </p>
          ) : null}

          <div className="jp-vocab-teacher-quiz__hero" id="en-vocab-teacher-quiz-title">
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

          <section className="jp-vocab-teacher-quiz__info" aria-label="词条信息">
            <dl className="jp-vocab-teacher-quiz__meta">
              <dt>释义：</dt>
              <dd className={meaningTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
                {meaningTrim ? (
                  <span className="jp-vocab-teacher-quiz__meaning-wrap">
                    <span>{meaningTrim}</span>
                    <JpVocabSourceLabel source={w.meaning_source} />
                  </span>
                ) : null}
              </dd>
              <dt>词性：</dt>
              <dd className={posTrim ? "" : "jp-vocab-teacher-quiz__meta-empty"}>
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
                        disabled={isSaving || isSharing || reviewLocked}
                        title={
                          reviewLocked
                            ? "勾选已满 1 小时，无法再共享"
                            : "共享到学生「今日英语单词」，并标记为不熟悉"
                        }
                        onClick={() => onShare?.(w.id)}
                      >
                        共享
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

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
                />
              </div>
            </section>
          ) : null}

          {hasNotes || canOperate ? (
            <section className="jp-vocab-teacher-quiz__notes">
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
        </div>

        <div className="jp-vocab-teacher-quiz__level">
          <p className="jp-vocab-teacher-quiz__level-label" role="note">
            {isStudy
              ? "老师勾选"
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

      <JpVocabTeacherQuizFlashcardStyles />
    </div>,
    document.body
  );
}
