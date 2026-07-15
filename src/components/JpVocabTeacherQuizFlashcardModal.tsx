"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { hasJpVocabClassNotes, formatJpVocabClassNotesForDisplay } from "@/lib/jp-vocab-class-notes";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import {
  jpVocabTeacherQuizNotesInline,
  type JpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz";
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
import { JpVocabTeacherQuizFlashcardStyles } from "@/components/JpVocabTeacherQuizFlashcardStyles";
import { JpVocabFlashcardWordHero } from "@/components/JpVocabFlashcardWordHero";
import { jpVocabCoachLevelLabel } from "@/lib/jp-vocab-coach";
import {
  formatJpVocabExampleGlossLine,
  parseJpVocabExampleSentenceItems,
} from "@/lib/jp-vocab-example-sentences";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const JP_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
const JP_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";
const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT = "已发给学生，勾选仅更新熟悉程度";
const JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "已发给学生，勾选熟悉程度仅更新记录，不会重复发送";

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
  /** 课堂带读：复用卡片 UI，隐藏勾选与发给学生 */
  mode?: "quiz" | "coach";
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
  onEditWord?: (word: JpVocabWord) => void;
  onShare?: (wordId: number) => void;
  onUnshare?: (wordId: number) => void;
  onWordUpdated?: (word: JpVocabWord) => void;
  nestedModalOpen?: boolean;
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
  onEditWord,
  onShare,
  onUnshare,
  onWordUpdated,
  nestedModalOpen = false,
  onMarkCoached,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [notesWord, setNotesWord] = useState<JpVocabWord | null>(null);
  const [nextBlockedHint, setNextBlockedHint] = useState(false);

  const currentWordId =
    session && session.wordIds[session.currentIndex] != null
      ? session.wordIds[session.currentIndex]
      : null;
  const word = currentWordId != null ? wordsById.get(currentWordId) ?? null : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !word) {
      setNotesWord(null);
      return;
    }
    setNotesWord(word);
    setNextBlockedHint(false);
  }, [open, word?.id, word?.updated_at, word]);

  useEffect(() => {
    if (!open || !word) return;
    if (!word.class_notes_present || word.class_notes) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const parsed = await readApiJson<{ ok: boolean; word?: JpVocabWord }>(res);
        if (cancelled || !parsed.ok || !parsed.data.ok || !parsed.data.word) return;
        setNotesWord(parsed.data.word);
        onWordUpdated?.(parsed.data.word);
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
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nestedModalOpen, onClose, nextBlockedHint]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isCoachMode = mode === "coach";
  const selectedLevel =
    word && session
      ? isCoachMode
        ? sessionLevel[word.id] ?? coachLevelByWordId?.get(word.id)
        : effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], { displayOrder })
      : undefined;

  useEffect(() => {
    if (selectedLevel) setNextBlockedHint(false);
  }, [selectedLevel]);

  if (!open || !mounted || !session || !word || currentWordId == null) return null;

  const isCoach = isCoachMode;
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
  const risk = jpVocabRiskIndex(w);
  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
  const todayChecks = effectiveTodayCheckCount(
    w.today_check_count ?? 0,
    w.today_check_date
  );
  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
  const showReadingPrimary = Boolean(readingTrim);
  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
  const notesInline =
    hasNotes && jpVocabTeacherQuizNotesInline(w.class_notes || "");
  const exampleSentences = parseJpVocabExampleSentenceItems(w.example_sentences);
  const showExamples = isCoach || exampleSentences.length > 0;
  const dailySeq = dailySeqByWordId.get(w.id);
  const coachExportLevel = isCoach ? coachLevelByWordId?.get(w.id) : undefined;
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
  const saveProgressKind: JpVocabSaveProgressKind = isCoach || isShared
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
  const levelSyncHintShort = isCoach
    ? "勾选后保存熟悉程度"
    : isShared
      ? JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT
      : JP_VOCAB_LEVEL_SYNC_HINT_SHORT;
  const levelSyncHint = isCoach
    ? "勾选后保存熟悉程度（与日语抽问共用记录）"
    : isShared
      ? JP_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED
      : JP_VOCAB_LEVEL_SYNC_HINT;
  const canGoPrev = session.currentIndex > 0;
  const canGoNext = session.currentIndex < session.wordIds.length - 1;
  const isLast = session.currentIndex === session.wordIds.length - 1;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const tryGoNext = () => {
    if (previewMode) {
      onComplete();
      return;
    }
    if (!isCoach && sessionComplete) {
      onComplete();
      return;
    }
    if (!isCoach && !selected) {
      setNextBlockedHint(true);
      return;
    }
    if (isSaving) return;
    if (isCoach) {
      onMarkCoached?.(w.id);
    }
    if (canGoNext) {
      onNavigate(session.currentIndex + 1);
    } else {
      onComplete();
    }
  };

  return createPortal(
    <div className="jp-vocab-teacher-quiz-overlay" role="presentation">
      <article
        className={`jp-vocab-teacher-quiz-card${isCoach ? " jp-vocab-teacher-quiz-card--coach" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-vocab-teacher-quiz-title"
        onClick={stop}
      >
        <header className="jp-vocab-teacher-quiz__header">
          <div className="jp-vocab-teacher-quiz__header-top">
            <div className="jp-vocab-teacher-quiz__header-left">
              {previewMode ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  管理员预览
                </span>
              ) : isCoach ? (
                <span className="jp-vocab-teacher-quiz__kind jp-vocab-teacher-quiz__kind--coach">
                  课堂带读
                </span>
              ) : null}
              {dailySeq != null ? (
                <span className="jp-vocab-teacher-quiz__seq" title="今日固定序号">
                  序号 {dailySeq}
                </span>
              ) : null}
              <span className="jp-vocab-teacher-quiz__progress">{progressLabel}</span>
              {!sessionComplete && !previewMode ? (
                <span className="jp-vocab-teacher-quiz__remaining">{remainingLabel}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="jp-vocab-teacher-quiz__close-x"
              aria-label={isCoach ? "关闭带读" : previewMode ? "关闭预览" : "关闭抽查"}
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div
            className={`jp-vocab-teacher-quiz__header-progress${
              sessionComplete ? " jp-vocab-teacher-quiz__header-progress--complete" : ""
            }`}
          >
            <div className="jp-vocab-teacher-quiz__header-progress-head">
              <span className="jp-vocab-teacher-quiz__header-progress-title">
                {previewMode
                  ? locale === "zh"
                    ? "抽问卡片预览"
                    : "Quiz card preview"
                  : locale === "zh"
                  ? isCoach
                    ? "本轮带读进度"
                    : "本轮抽查进度"
                  : isCoach
                    ? "Read-along progress"
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
                    <span className="jp-vocab-teacher-quiz__header-progress-sep">/</span>
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
                  ? isCoach
                    ? `本轮已带读 ${sessionChecked} / ${sessionTotal}`
                    : `本轮已抽查 ${sessionChecked} / ${sessionTotal}`
                  : isCoach
                    ? `Read-along ${sessionChecked} / ${sessionTotal}`
                    : `Round ${sessionChecked} / ${sessionTotal}`
              }
            >
              <div
                className="jp-vocab-teacher-quiz__progress-fill"
                style={{ width: `${sessionPct}%` }}
              />
            </div>
          </div>
        </header>

        <div className="jp-vocab-teacher-quiz__scroll-body">
        {studentPeeked && !isCoach ? (
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
              {meaningTrim}
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
              </div>
              {shareUiEnabled && !isCoach ? (
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
          <section className="jp-vocab-teacher-quiz__examples" aria-label="例句">
            <h3 className="jp-vocab-teacher-quiz__examples-title">例句</h3>
            {exampleSentences.length > 0 ? (
              <ol className="jp-vocab-teacher-quiz__examples-list">
                {exampleSentences.map((item, index) => (
                  <li
                    key={`${index}-${item.text}`}
                    className="jp-vocab-teacher-quiz__examples-item"
                  >
                    <span className="jp-vocab-teacher-quiz__examples-index" aria-hidden="true">
                      {index + 1}.
                    </span>
                    <span className="jp-vocab-teacher-quiz__examples-text">
                      <span className="jp-vocab-teacher-quiz__examples-primary">
                        {item.text}
                      </span>
                      {item.glossLines.map((gloss, glossIndex) => (
                        <span
                          key={`${index}-gloss-${glossIndex}`}
                          className="jp-vocab-teacher-quiz__examples-gloss"
                        >
                          {formatJpVocabExampleGlossLine(gloss)}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="jp-vocab-teacher-quiz__examples-empty">暂无例句</p>
            )}
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
                  <JpVocabClassNoteContent
                    content={formatJpVocabClassNotesForDisplay(w.class_notes)}
                  />
                </div>
              ) : (
                <p className="jp-vocab-teacher-quiz__notes-preview">备注较长，请点「查看」</p>
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
          {isCoach && !canOperate ? (
            <>
              <p className="jp-vocab-teacher-quiz__level-label" role="note">
                熟悉程度：
                <strong className="jp-vocab-teacher-quiz__coach-export-level">
                  {coachExportLevel ? jpVocabCoachLevelLabel(coachExportLevel) : "—"}
                </strong>
              </p>
              <div
                className="jp-vocab-teacher-quiz__stat-grid jp-vocab-teacher-quiz__stat-grid--coach"
                aria-label="历史熟悉程度统计"
              >
                <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
                <span>一般 {w.cnt_normal}</span>
                <span className="chg-up">不熟悉 {w.cnt_weak}</span>
              </div>
            </>
          ) : (
            <>
              <p className="jp-vocab-teacher-quiz__level-label" role="note">
                {previewMode
                  ? "预览模式：熟悉程度勾选仅为展示，不会保存"
                  : isCoach
                    ? "请根据学生熟悉程度，勾选以下选项"
                    : "请根据学生熟悉程度，勾选以下选项"}
              </p>
              <div className="jp-vocab-level-wrap jp-vocab-teacher-quiz__level-wrap">
                <div className="jp-vocab-teacher-quiz__level-main">
                  <div className="jp-vocab-levels" role="group" aria-label="学生熟悉程度">
                    {LEVELS.map((lv) => {
                      const checked = selected === lv.key;
                      const levelDisabled = previewMode || reviewLocked || isSaving;
                      return (
                        <button
                          key={lv.key}
                          type="button"
                          className={`jp-vocab-level-opt${
                            checked ? " is-checked" : ""
                          }${reviewLocked || previewMode ? " jp-vocab-level-opt--locked" : ""}${
                            lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                          }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
                          disabled={levelDisabled}
                          aria-pressed={checked}
                          title={
                            previewMode
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
              </div>
              {saveBusy ? (
                <JpVocabSaveProgressBar
                  label={saveProgressLabel}
                  percent={saveProgressPercent}
                  fullWidth
                  className="jp-vocab-teacher-quiz__level-progress"
                />
              ) : null}
              {isCoach ? (
                <div
                  className="jp-vocab-teacher-quiz__stat-grid jp-vocab-teacher-quiz__stat-grid--coach"
                  aria-label="历史熟悉程度统计"
                >
                  <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
                  <span>一般 {w.cnt_normal}</span>
                  <span className="chg-up">不熟悉 {w.cnt_weak}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="jp-vocab-teacher-quiz__stats">
          <div className="jp-vocab-teacher-quiz__stat">
            <span className="jp-vocab-teacher-quiz__stat-label">
              {jpVocabPriorityLabel(locale)}
            </span>
            <span
              className={`jp-vocab-teacher-quiz__risk jp-vocab-teacher-quiz__risk--${riskBadgeTier}`}
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
              title={totalDisplay.isZero ? jpVocabTotalReviewsZeroHint(locale) : undefined}
            >
              {totalDisplay.label}
            </span>
          </div>
          {!isCoach ? (
            <div className="jp-vocab-teacher-quiz__stat-grid">
              <span className="chg-dn">非常熟悉 {w.cnt_very}</span>
              <span>一般 {w.cnt_normal}</span>
              <span className="chg-up">不熟悉 {w.cnt_weak}</span>
            </div>
          ) : null}
        </div>

        <div className="jp-vocab-teacher-quiz__nav">
          <button
            type="button"
            className="btn-rsi-filter jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--prev"
            disabled={!canGoPrev}
            onClick={() => onNavigate(session.currentIndex - 1)}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">上一个</span>
          </button>
          <button
            type="button"
            className={`btn-rsi-filter btn-rfi-filter--primary jp-vocab-teacher-quiz__nav-btn jp-vocab-teacher-quiz__nav-btn--next${
              !previewMode && !isCoach && !selected
                ? " jp-vocab-teacher-quiz__nav-btn--blocked"
                : ""
            }`}
            disabled={isSaving}
            onClick={tryGoNext}
          >
            <span className="jp-vocab-teacher-quiz__nav-btn-main">
              {previewMode
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
            {!isLast && !isCoach && !sessionComplete && !previewMode ? (
              <span className="jp-vocab-teacher-quiz__nav-btn-sub">勾选后可点</span>
            ) : null}
          </button>
        </div>
      </article>

      {nextBlockedHint && !previewMode && !isCoach && !selected ? (
        <div
          className="jp-vocab-teacher-quiz-alert-overlay"
          role="presentation"
          onClick={() => setNextBlockedHint(false)}
        >
          <div
            className="jp-vocab-teacher-quiz-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="jp-vocab-teacher-quiz-alert-title"
            aria-describedby="jp-vocab-teacher-quiz-alert-desc"
            onClick={stop}
          >
            <h3 id="jp-vocab-teacher-quiz-alert-title" className="jp-vocab-teacher-quiz-alert__title">
              请先勾选熟悉程度
            </h3>
            <p id="jp-vocab-teacher-quiz-alert-desc" className="jp-vocab-teacher-quiz-alert__desc">
              请先勾选学生的熟悉程度，再进入下一词。
            </p>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary jp-vocab-teacher-quiz-alert__close"
              onClick={() => setNextBlockedHint(false)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <JpVocabTeacherQuizFlashcardStyles />
    </div>,
    document.body
  );
}
