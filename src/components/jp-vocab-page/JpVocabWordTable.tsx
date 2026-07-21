"use client";

import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpVocabMobileNotesCell } from "@/components/JpVocabMobileNotesCell";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { JpVocabStatSortButton } from "@/components/jp-vocab-page/JpVocabStatSortButton";
import { MobileLevelHistorySummary } from "@/components/jp-vocab-page/MobileLevelHistorySummary";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabPriorityLabel,
  jpVocabTotalReviewsZeroHint,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
  jpVocabFinalQuizScoreOrNull,
} from "@/lib/jp-vocab-quiz-score";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { jpVocabFlashcardCopyText } from "@/lib/jp-vocab-flashcard-copy";
import {
  effectiveJpVocabDisplayLevel,
} from "@/lib/jp-vocab-review";
import {
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
} from "@/lib/jp-vocab-save-progress";
import {
  JP_VOCAB_LEVELS,
  JP_VOCAB_STAT_SORT_COLUMNS,
  SHOW_REMARKS_COLUMN,
} from "@/lib/jp-vocab-page-constants";
import { jpVocabCheckedInRound } from "@/lib/jp-vocab-page-helpers";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import {
  jpVocabTomorrowBoostSeq,
  type JpVocabQuizPriorityBoost,
} from "@/lib/jp-vocab-quiz-priority-boost";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { Locale } from "@/i18n/messages";

export type JpVocabWordTableProps = {
  locale: Locale;
  isAdmin: boolean;
  canOperate: boolean;
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" };
  onStatSort: (key: JpVocabStatSortKey) => void;
  words: JpVocabWord[];
  highlightId: number | null;
  displayOrder: JpVocabDailyDisplayOrder;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  sessionReviewAt: Record<number, number>;
  wordSyncState: Record<number, "queued" | "syncing">;
  deletingId: number | null;
  shareProgressMap: Record<number, number>;
  sharedTodayWordIds: Set<number>;
  refs: Record<string, JpVocabRef>;
  dailySeqByWordId: Map<number, number>;
  quizTarget: number;
  teacherQuizLocksTable: boolean;
  isWordInQuizTarget: (wordId: number) => boolean;
  isWordReviewLocked: (word: JpVocabWord, sessionReviewAtMs?: number) => boolean;
  quizSession: JpVocabTeacherQuizSession | null;
  openRemarksWord: (word: JpVocabWord) => void;
  onEditRemarks: (word: JpVocabWord) => void;
  onReadingCopy: (reading: string, word: string) => void;
  onRefPreview: (refKey: string, ref?: JpVocabRef) => void;
  onEditWord: (word: JpVocabWord) => void;
  onDeleteWord: (word: JpVocabWord) => void;
  /** 仅管理员：标记明日优先抽查 */
  onBoostQuizPriority?: (word: JpVocabWord) => void;
  quizPriorityBoost?: JpVocabQuizPriorityBoost | null;
  boostingWordId?: number | null;
  /** 仅管理员：预览老师抽问卡片样式 */
  onPreviewQuizCard?: (word: JpVocabWord) => void;
  onViewMnemonic: (word: JpVocabWord) => void;
  onRecordLevel: (wordId: number, level: JpVocabLevel) => void;
  onResumeQuiz: (wordId?: number) => void;
  onRequestQuizMode: (wordId: number) => void;
  onStatus: (message: string) => void;
  /** 久未复习抬升权重（final_score = priority + days × weight） */
  quizTimeWeight?: number;
};

export function JpVocabWordTable({
  locale,
  isAdmin,
  canOperate,
  statSort,
  onStatSort,
  words: pagedDisplayedWords,
  highlightId,
  displayOrder,
  sessionLevel,
  sessionReviewAt,
  wordSyncState,
  deletingId,
  shareProgressMap,
  sharedTodayWordIds,
  refs,
  dailySeqByWordId,
  quizTarget,
  teacherQuizLocksTable,
  isWordInQuizTarget,
  isWordReviewLocked,
  quizSession,
  openRemarksWord,
  onEditRemarks,
  onReadingCopy,
  onRefPreview,
  onEditWord,
  onDeleteWord,
  onBoostQuizPriority,
  quizPriorityBoost = null,
  boostingWordId = null,
  onPreviewQuizCard,
  onViewMnemonic,
  onRecordLevel,
  onResumeQuiz,
  onRequestQuizMode,
  onStatus,
  quizTimeWeight = JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
}: JpVocabWordTableProps) {
  const toggleStatSort = onStatSort;
  const tryRecordLevel = onRecordLevel;
  const resumeTeacherQuizFlashcard = onResumeQuiz;
  const setEditingRemarksWord = onEditRemarks;
  const showReadingCopyToast = onReadingCopy;
  const openRefPreview = onRefPreview;
  const setEditingWord = onEditWord;
  const deleteWord = onDeleteWord;
  const setViewingMnemonicWord = onViewMnemonic;
  const setPendingQuizWordId = (id: number) => onRequestQuizMode(id);
  const setStatus = onStatus;
  const LEVELS = JP_VOCAB_LEVELS;

  return (
          <div className="jp-vocab-table-wrap">
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="jp-vocab-seq-col">
                    <button
                      type="button"
                      className="jp-vocab-sort-btn"
                      aria-sort={
                        statSort?.key === "seq"
                          ? statSort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      title="按当日固定序号排序"
                      onClick={() => toggleStatSort("seq")}
                    >
                      <span>序号</span>
                      <span className="jp-vocab-sort-indicator" aria-hidden="true">
                        {statSort?.key === "seq"
                          ? statSort.dir === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th rowSpan={2} className="jp-vocab-kind-col">
                    类型
                  </th>
                  <th rowSpan={2} className="jp-vocab-word-col">
                    单词 / 语法
                  </th>
                  <th rowSpan={2} className="jp-vocab-reading-col">
                    读音
                  </th>
                  <th rowSpan={2} className="jp-vocab-meaning-col">
                    释义
                  </th>
                  <th rowSpan={2} className="jp-vocab-pos-col">
                    词性
                  </th>
                  {isAdmin ? (
                    <th rowSpan={2} className="jp-vocab-mnemonic-col" title="联想记忆 / 巧记口诀（仅管理员）">
                      巧记
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-risk-col">
                    <button
                      type="button"
                      className="jp-vocab-sort-btn"
                      aria-sort={
                        statSort?.key === "risk"
                          ? statSort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      title={`按${jpVocabPriorityLabel(locale)}排序（最终得分 = 优先级 + 久未复习天数×时间权重）`}
                      onClick={() => toggleStatSort("risk")}
                    >
                      <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                        <span>抽查</span>
                        <span>优先级</span>
                      </span>
                      <span className="jp-vocab-sort-indicator" aria-hidden="true">
                        {statSort?.key === "risk"
                          ? statSort.dir === "asc"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>熟悉程度</span>
                      <span className="jp-vocab-th-multiline__sub">(老师勾选)</span>
                    </span>
                  </th>
                  <th rowSpan={2} className="jp-vocab-stats-col">
                    <div className="jp-vocab-stats-col-head">
                      <span className="jp-vocab-stats-col__title">复习次数统计</span>
                      <div className="jp-vocab-stats-sort-grid" aria-label="按复习次数排序">
                        {JP_VOCAB_STAT_SORT_COLUMNS.map((col) => (
                          <JpVocabStatSortButton
                            key={col.key}
                            col={col}
                            statSort={statSort}
                            onSort={toggleStatSort}
                          />
                        ))}
                      </div>
                    </div>
                  </th>
                  <th rowSpan={2} className="jp-vocab-today-check-col" title="今日抽查次数">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>今日</span>
                      <span>抽查次数</span>
                    </span>
                  </th>
                  {SHOW_REMARKS_COLUMN ? (
                    <th rowSpan={2} className="jp-vocab-notes-col">
                      备注
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-action-col">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedDisplayedWords.map((w, rowIndex) => {
                  const isHighlight = highlightId === w.id;
                  const reviewLocked = isWordReviewLocked(w, sessionReviewAt[w.id]);
                  const selected =
                    effectiveJpVocabDisplayLevel(w, sessionLevel[w.id], {
                      displayOrder,
                    }) ??
                    (reviewLocked ? w.last_review_level ?? undefined : undefined);
                  const syncState = wordSyncState[w.id];
                  const isQueued = syncState === "queued";
                  const isSyncing = syncState === "syncing";
                  const isDeleting = deletingId === w.id;
                  const sharingPercent = shareProgressMap[w.id] ?? 0;
                  const isSharing = w.id in shareProgressMap;
                  const isSaving = isQueued || isSyncing;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = jpVocabFinalQuizScoreOrNull(w, quizTimeWeight);
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const checkedInRound = jpVocabCheckedInRound(displayOrder, w);
                  const dailySeq = dailySeqByWordId.get(w.id) ?? rowIndex + 1;
                  const inQuizTarget = isWordInQuizTarget(w.id);
                  const tableQuizLocked = teacherQuizLocksTable && inQuizTarget;
                  const readingTrim = (w.reading || "").trim();
                  const wordTrim = (w.word || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const mnemonicTrim = (w.mnemonic || "").trim();
                  const riskBadgeTier =
                    risk == null
                      ? "never"
                      : risk >= 2
                        ? "high"
                        : risk <= 0
                          ? "low"
                          : "mid";
                  const hasNotes = Boolean((w.class_notes || "").trim());
                  const readingCopyText = jpVocabFlashcardCopyText(readingTrim, wordTrim);
                  const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
                  const totalStatLabel = totalDisplay.isZero ? (
                    <span
                      className="jp-vocab-total-never"
                      title={jpVocabTotalReviewsZeroHint(locale)}
                    >
                      {totalDisplay.label}
                    </span>
                  ) : (
                    totalDisplay.label
                  );
                  const renderNotesActions = () => (
                    <div className="jp-vocab-notes-actions">
                      {hasNotes ? (
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-notes-view-btn"
                          title="查看备注"
                          onClick={() => openRemarksWord(w)}
                        >
                          查看
                        </button>
                      ) : null}
                      {canOperate ? (
                        <JpEditIconButton
                          title="编辑备注"
                          className="jp-vocab-notes-edit-btn"
                          onClick={() => setEditingRemarksWord(w)}
                        />
                      ) : null}
                    </div>
                  );

                  return (
                    <tr
                      key={w.id}
                      id={`jp-vocab-row-${w.id}`}
                      style={{
                        background: isHighlight
                          ? "rgba(61, 139, 253, 0.12)"
                          : undefined,
                      }}
                    >
                      <td className="jp-vocab-seq-col" data-label="序号">
                        <span className="jp-vocab-seq-cell">
                          <span className="jp-vocab-seq-num">{dailySeq}</span>
                          {checkedInRound ? (
                            <span
                              className="jp-vocab-seq-checked"
                              title="当前轮次已抽查"
                              aria-label={`序号 ${dailySeq}，当前轮次已抽查`}
                            >
                              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                                <path
                                  d="M2 6l3 3 5-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="jp-vocab-kind-col" data-label="类型">
                        <span
                          className={`jp-vocab-kind-badge${
                            w.kind === "grammar" ? " jp-vocab-kind-badge--grammar" : ""
                          }`}
                        >
                          {w.kind === "grammar" ? "语法" : "单词"}
                        </span>
                      </td>
                      <td className="jp-vocab-word-col" data-label="单词 / 语法">
                        <div className="jp-vocab-word-cell">
                          {w.ref_key ? (
                            <>
                              <button
                                type="button"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                {w.word}
                              </button>
                              <span className="jp-vocab-ref-hint">（点击查看教案）</span>
                            </>
                          ) : (
                            <span className="jp-vocab-word-text">{w.word}</span>
                          )}
                        </div>
                        <div className="jp-vocab-mobile-reading-row jp-vocab-mobile-only">
                          {w.kind === "word" ? (
                            readingTrim ? (
                              <span className="jp-vocab-reading-text">{readingTrim}</span>
                            ) : (
                              <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                                待补全
                              </span>
                            )
                          ) : readingTrim ? (
                            <span className="jp-vocab-reading-text">{readingTrim}</span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                      >
                        <div className="jp-vocab-reading-cell">
                          {readingTrim ? (
                            readingCopyText ? (
                              <button
                                type="button"
                                className="jp-vocab-reading-text jp-vocab-reading-text--copy"
                                title={`点击复制「${readingCopyText}」`}
                                aria-label={`点击复制读音「${readingCopyText}」`}
                                onClick={() => showReadingCopyToast(readingTrim, wordTrim)}
                              >
                                {readingTrim}
                              </button>
                            ) : (
                              <span className="jp-vocab-reading-text">{readingTrim}</span>
                            )
                          ) : w.kind === "word" ? (
                            <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                              待补全
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-meaning-col${
                          !meaningTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="释义"
                        style={{ color: "var(--muted)" }}
                      >
                        {meaningTrim ? (
                          <div className="jp-vocab-meaning-cell">
                            <span className="jp-vocab-meaning-desktop">{meaningTrim}</span>
                            <details className="jp-vocab-meaning-fold jp-vocab-mobile-only">
                              <summary className="jp-vocab-meaning-fold__summary">
                                <span className="jp-vocab-fold-label">释义</span>
                                <span className="jp-vocab-meaning-preview">{meaningTrim}</span>
                              </summary>
                              <p className="jp-vocab-meaning-full">{meaningTrim}</p>
                            </details>
                            <JpVocabSourceLabel
                              source={w.meaning_source}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${!posTrim ? " jp-vocab-field-empty" : ""}`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim ? (
                          <span className="jp-vocab-pos-badge">{posTrim}</span>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <td
                          className={`jp-vocab-mnemonic-col${
                            !mnemonicTrim ? " jp-vocab-field-empty" : ""
                          }`}
                          data-label="巧记"
                          style={{ color: "var(--muted)" }}
                        >
                          {mnemonicTrim ? (
                            <div className="jp-vocab-mnemonic-actions">
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mnemonic-view-btn"
                                title="查看巧记"
                                onClick={() => setViewingMnemonicWord(w)}
                              >
                                查看
                              </button>
                            </div>
                          ) : (
                            <span className="jp-vocab-mnemonic-empty" title="可在「编辑」中填写巧记">
                              —
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="jp-vocab-risk-col" data-label="优先级">
                        {risk == null ? (
                          <span
                            className="jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--never"
                            title="从未抽查：不按优先级计分，日序默认置顶"
                          >
                            —
                          </span>
                        ) : (
                          <span
                            className={`jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--${riskBadgeTier}`}
                          >
                            {risk.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度">
                        {isSharing || isQueued || isSyncing ? (
                          <JpVocabSaveProgressBar
                            label={jpVocabSaveProgressLabel(
                              sharedTodayWordIds.has(w.id)
                                ? "save_level"
                                : "sync_to_student",
                              { queued: isQueued && !isSyncing }
                            )}
                            percent={
                              isSharing
                                ? sharingPercent
                                : jpVocabSaveProgressDisplayPercent(null)
                            }
                          />
                        ) : !inQuizTarget && !isAdmin ? (
                          <span
                            className="jp-vocab-level-unavailable"
                            title={`仅今日抽查池内的词条可勾选熟悉程度（共 ${quizTarget} 个）`}
                          >
                            不可勾选
                          </span>
                        ) : tableQuizLocked ? (
                        <div className="jp-vocab-level-wrap">
                          <MobileLevelHistorySummary word={w} />
                          <button
                            type="button"
                            className="jp-vocab-level-card-entry"
                            disabled={isSaving}
                            title="熟悉程度请在单词卡片内勾选"
                            onClick={() => {
                              if (quizSession != null) {
                                resumeTeacherQuizFlashcard(w.id);
                              } else {
                                onRequestQuizMode(w.id);
                              }
                              setStatus("请在单词卡片内勾选熟悉程度。");
                            }}
                          >
                            <div
                              className="jp-vocab-levels jp-vocab-levels--locked jp-vocab-levels--readonly"
                              aria-hidden="true"
                            >
                              {LEVELS.map((lv) => {
                                const checked = selected === lv.key;
                                return (
                                  <span
                                    key={lv.key}
                                    className={`jp-vocab-level-opt jp-vocab-level-opt--readonly${
                                      checked ? " is-checked" : ""
                                    }${
                                      lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                    }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
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
                                  </span>
                                );
                              })}
                            </div>
                          </button>
                        </div>
                        ) : (
                        <div className="jp-vocab-level-wrap">
                        <MobileLevelHistorySummary word={w} />
                        <div
                          className={`jp-vocab-levels${
                            reviewLocked || tableQuizLocked
                              ? " jp-vocab-levels--locked"
                              : ""
                          }`}
                          role="group"
                          aria-label={`${w.word} 熟悉程度`}
                          title={
                            tableQuizLocked
                              ? "抽查进行中：熟悉程度请在卡片内改选；词条编辑与备注编辑不受限"
                              : reviewLocked
                                ? "没办法操作"
                                : undefined
                          }
                        >
                          {LEVELS.map((lv) => {
                            const checked = selected === lv.key;
                            const levelDisabled =
                              !canOperate || isSaving || reviewLocked;
                            return (
                              <button
                                key={lv.key}
                                type="button"
                                className={`jp-vocab-level-opt${
                                  checked ? " is-checked" : ""
                                }${
                                  !canOperate ? " jp-vocab-level-opt--readonly" : ""
                                }${reviewLocked ? " jp-vocab-level-opt--locked" : ""}${
                                  tableQuizLocked ? " jp-vocab-level-opt--locked" : ""
                                }${
                                  lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
                                disabled={levelDisabled}
                                title={
                                  tableQuizLocked
                                    ? "抽查进行中，熟悉程度请在卡片内改选（编辑词条/备注不受限）"
                                    : reviewLocked
                                    ? "没办法操作"
                                    : !canOperate
                                      ? "登录后可勾选"
                                      : isSaving
                                        ? "保存中…"
                                        : checked
                                          ? "今日已选此项，可点其他选项改选"
                                          : selected
                                            ? "改选后以此为准，今日抽查次数不重复计"
                                            : "勾选熟悉程度"
                                }
                                aria-pressed={checked}
                                onClick={() => {
                                  if (tableQuizLocked) {
                                    resumeTeacherQuizFlashcard(w.id);
                                    setStatus(
                                      "抽查进行中，已重新打开抽查卡片，请继续在卡片内勾选熟悉程度。"
                                    );
                                    return;
                                  }
                                  tryRecordLevel(w.id, lv.key);
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
                        )}
                      </td>
                      <td className="jp-vocab-stats-col" data-label="复习统计">
                        <div className="jp-vocab-stats-grid" aria-label="复习次数统计">
                          <span
                            className="jp-vocab-stats-grid__item jp-vocab-stats-grid__item--very chg-dn"
                            title="非常熟悉"
                          >
                            {w.cnt_very}
                          </span>
                          <span className="jp-vocab-stats-grid__item" title="一般">
                            {w.cnt_normal}
                          </span>
                          <span
                            className="jp-vocab-stats-grid__item jp-vocab-stats-grid__item--weak chg-up"
                            title="不熟悉"
                          >
                            {w.cnt_weak}
                          </span>
                          <span
                            className="jp-vocab-stats-grid__item jp-vocab-stats-grid__item--total"
                            title="合计"
                          >
                            {totalStatLabel}
                          </span>
                        </div>
                      </td>
                      <td className="jp-vocab-today-check-col" data-label="今日抽查次数">
                        <span
                          className={`jp-vocab-today-check-value${
                            todayChecks > 0 ? " jp-vocab-today-check-value--active" : ""
                          }`}
                          title={todayChecks > 0 ? `今日已抽查 ${todayChecks} 次` : "今日尚未抽查"}
                        >
                          {todayChecks}
                        </span>
                      </td>
                      {SHOW_REMARKS_COLUMN ? (
                        <td
                          className={`jp-vocab-notes-col${
                            !hasNotes && !canOperate ? " jp-vocab-field-empty" : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-desktop">{renderNotesActions()}</div>
                          <JpVocabMobileNotesCell
                            classNotes={w.class_notes}
                            hasNotes={hasNotes}
                            canOperate={canOperate}
                            onView={() => openRemarksWord(w)}
                            onEdit={() => setEditingRemarksWord(w)}
                          />
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${!canOperate ? " jp-vocab-field-empty" : ""}`}
                        data-label="操作"
                      >
                        {canOperate ? (
                          <div className="jp-vocab-action-buttons">
                            {w.ref_key ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-mobile-action-btn--full jp-vocab-mobile-only"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v7A2.5 2.5 0 0 1 13.5 16h-7A2.5 2.5 0 0 1 4 13.5v-7Z"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  />
                                  <path
                                    d="M8 10.5l1.5 1.5L12.5 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                查看教案
                              </button>
                            ) : null}
                            <div className="jp-vocab-action-row">
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn"
                                onClick={() => setEditingWord(w)}
                              >
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5Z"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                编辑
                              </button>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger jp-vocab-mobile-action-btn"
                                  disabled={
                                    isSaving ||
                                    isDeleting ||
                                    deletingId != null
                                  }
                                  title="删除此词条（不可恢复）"
                                  onClick={() => void deleteWord(w)}
                                >
                                  {isDeleting ? "删除中…" : "删除"}
                                </button>
                              ) : null}
                            </div>
                            {isAdmin && onPreviewQuizCard ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-mobile-action-btn--full"
                                title="以老师抽问卡片样式预览本词条（仅管理员，不保存勾选）"
                                onClick={() => onPreviewQuizCard(w)}
                              >
                                查看抽问卡片
                              </button>
                            ) : null}
                            {isAdmin && onBoostQuizPriority ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-mobile-action-btn--full"
                                disabled={
                                  boostingWordId != null ||
                                  deletingId != null ||
                                  Boolean(wordSyncState[w.id])
                                }
                                title="次日凌晨重排时按点击顺序置顶，便于重新抽到该词"
                                onClick={() => onBoostQuizPriority(w)}
                              >
                                {boostingWordId === w.id
                                  ? "设置中…"
                                  : (() => {
                                      const seq = jpVocabTomorrowBoostSeq(
                                        quizPriorityBoost,
                                        w.id
                                      );
                                      return seq != null
                                        ? `明日第 ${seq} 位`
                                        : "明日优先抽查";
                                    })()}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  );
}
