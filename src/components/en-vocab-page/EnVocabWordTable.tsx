"use client";

import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { EnVocabUsageExamplesCell } from "@/components/EnVocabUsageExamplesCell";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { displayEnVocabCategory } from "@/lib/en-vocab-category";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import { displayEnVocabUploadSource } from "@/lib/en-vocab-upload-source";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  EN_VOCAB_LEVELS,
  EN_VOCAB_STAT_SORT_COLUMNS,
  SHOW_REMARKS_COLUMN,
} from "@/lib/en-vocab-page-constants";
import {
  enVocabCheckedInRound,
  renderEnVocabUpdatedAt,
} from "@/lib/en-vocab-page-helpers";
import { effectiveEnVocabDisplayLevel } from "@/lib/en-vocab-review";
import {
  enVocabPriorityLabel,
  enVocabRiskIndex,
  formatEnVocabTotalReviewsDisplay,
  enVocabTotalReviewsZeroHint,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

function EnVocabThSortButton({
  sortKey,
  statSort,
  onStatSort,
  title,
  label,
  labelLines,
}: {
  sortKey: EnVocabStatSortKey;
  statSort: { key: EnVocabStatSortKey; dir: "asc" | "desc" };
  onStatSort: (key: EnVocabStatSortKey) => void;
  title: string;
  label?: string;
  labelLines?: [string, string];
}) {
  const active = statSort?.key === sortKey;
  return (
    <button
      type="button"
      className="jp-vocab-sort-btn"
      aria-sort={
        active ? (statSort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      title={title}
      onClick={() => onStatSort(sortKey)}
    >
      {labelLines ? (
        <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
          <span>{labelLines[0]}</span>
          <span>{labelLines[1]}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
      <span className="jp-vocab-sort-indicator" aria-hidden="true">
        {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

export type EnVocabWordTableProps = {
  locale: Locale;
  loading: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  teacherShareUiEnabled: boolean;
  statSort: { key: EnVocabStatSortKey; dir: "asc" | "desc" };
  onStatSort: (key: EnVocabStatSortKey) => void;
  words: EnVocabWord[];
  highlightId: number | null;
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  savingId: number | null;
  sharingId: number | null;
  deletingBatch: boolean;
  sharedTodayWordIds: Set<number>;
  reviewLockedByWordId: Record<number, boolean>;
  refs: Record<string, EnVocabRef>;
  dailySeqByWordId: Map<number, number>;
  quizTarget: number;
  teacherQuizLocksTable: boolean;
  isWordInQuizTarget: (wordId: number) => boolean;
  quizSession: EnVocabTeacherQuizSession | null;
  selectedDeleteIds: Set<number>;
  allPageDeleteSelected: boolean;
  somePageDeleteSelected: boolean;
  pagedDeleteIds: number[];
  onToggleSelectAllPageForDelete: () => void;
  onToggleDeleteSelection: (id: number, checked: boolean) => void;
  onRefPreview: (refKey: string, ref?: EnVocabRef) => void;
  onViewUsage: (word: EnVocabWord) => void;
  onViewMnemonic: (word: EnVocabWord) => void;
  onViewRemarks: (word: EnVocabWord) => void;
  onEditRemarks: (word: EnVocabWord) => void;
  onEditWord: (word: EnVocabWord) => void;
  onPreviewQuizCard: (wordId: number) => void;
  onDeleteWord: (word: EnVocabWord) => void;
  onShareWord: (wordId: number) => void;
  onRecordLevel: (wordId: number, level: EnVocabLevel) => void;
  onResumeQuiz: (wordId: number) => void;
  onRequestQuizMode: (wordId: number) => void;
  onStatus: (message: string) => void;
};

export function EnVocabWordTable({
  locale,
  loading,
  isAdmin,
  canOperate,
  teacherShareUiEnabled,
  statSort,
  onStatSort,
  words,
  highlightId,
  displayOrder,
  sessionLevel,
  savingId,
  sharingId,
  deletingBatch,
  sharedTodayWordIds,
  reviewLockedByWordId,
  refs,
  dailySeqByWordId,
  quizTarget,
  teacherQuizLocksTable,
  isWordInQuizTarget,
  quizSession,
  selectedDeleteIds,
  allPageDeleteSelected,
  somePageDeleteSelected,
  pagedDeleteIds,
  onToggleSelectAllPageForDelete,
  onToggleDeleteSelection,
  onRefPreview,
  onViewUsage,
  onViewMnemonic,
  onViewRemarks,
  onEditRemarks,
  onEditWord,
  onPreviewQuizCard,
  onDeleteWord,
  onShareWord,
  onRecordLevel,
  onResumeQuiz,
  onRequestQuizMode,
  onStatus,
}: EnVocabWordTableProps) {
  return (
          <div className="jp-vocab-table-wrap">
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  {isAdmin ? (
                    <th rowSpan={2} className="jp-vocab-select-col" title="勾选后可批量删除">
                      <input
                        type="checkbox"
                        className="jp-vocab-select-checkbox"
                        checked={allPageDeleteSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = somePageDeleteSelected;
                        }}
                        aria-label="全选本页"
                        disabled={loading || deletingBatch || !pagedDeleteIds.length}
                        onChange={onToggleSelectAllPageForDelete}
                      />
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-seq-col">
                    <EnVocabThSortButton
                      sortKey="seq"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按当日序号排序"
                      label="序号"
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-kind-col">
                    <EnVocabThSortButton
                      sortKey="kind"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按类型排序（单词 / 语法）"
                      label="类型"
                    />
                  </th>
                  <th rowSpan={2} className="en-vocab-category-col">
                    <EnVocabThSortButton
                      sortKey="category"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按分类排序（如雅思托福）"
                      label="分类"
                    />
                  </th>
                  <th rowSpan={2} className="en-vocab-upload-source-col">
                    <EnVocabThSortButton
                      sortKey="upload_source"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按上传类型排序（新课同步 / API / 手动）"
                      labelLines={["上传", "类型"]}
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-word-col">
                    <EnVocabThSortButton
                      sortKey="word"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按单词 / 语法名排序"
                      labelLines={["单词 /", "语法"]}
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-reading-col">
                    <EnVocabThSortButton
                      sortKey="reading"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按音标 / 读音排序"
                      labelLines={["音标 /", "读音"]}
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-meaning-col">
                    <EnVocabThSortButton
                      sortKey="meaning"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按释义排序"
                      label="释义"
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-pos-col">
                    <EnVocabThSortButton
                      sortKey="pos"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按词性排序"
                      label="词性"
                    />
                  </th>
                  <th
                    rowSpan={2}
                    className="jp-vocab-usage-ex-col"
                    title="用法与对应用例（第 N 条用法对应第 N 条例句）"
                  >
                    <EnVocabThSortButton
                      sortKey="usage"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按用法条数排序"
                      labelLines={["用法 /", "例句"]}
                    />
                  </th>
                  {isAdmin ? (
                    <th
                      rowSpan={2}
                      className="jp-vocab-mnemonic-col"
                      title="联想记忆 / 巧记口诀（仅管理员）"
                    >
                      <EnVocabThSortButton
                        sortKey="mnemonic"
                        statSort={statSort}
                        onStatSort={onStatSort}
                        title="按巧记内容排序"
                        label="巧记"
                      />
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-risk-col">
                    <EnVocabThSortButton
                      sortKey="risk"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title={`按${enVocabPriorityLabel(locale)}排序（一般×1 + 不熟悉×2 − 非常熟悉×0.3）`}
                      labelLines={["抽查", "优先级"]}
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    <EnVocabThSortButton
                      sortKey="level"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按熟悉程度排序"
                      labelLines={["熟悉程度", "(老师勾选)"]}
                    />
                  </th>
                  <th rowSpan={2} className="jp-vocab-stats-col">
                    <div className="jp-vocab-stats-col-head">
                      <span className="jp-vocab-stats-col__title">复习次数统计</span>
                      <div className="jp-vocab-stats-sort-grid" aria-label="按复习次数排序">
                        {EN_VOCAB_STAT_SORT_COLUMNS.map((col) => {
                          const active = statSort?.key === col.key;
                          const ariaSort = active
                            ? statSort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none";
                          return (
                            <button
                              key={col.key}
                              type="button"
                              className="jp-vocab-stats-sort-btn"
                              aria-sort={ariaSort}
                              title={`按${col.label}排序`}
                              onClick={() => onStatSort(col.key)}
                            >
                              {col.labelLines ? (
                                <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact jp-vocab-stats-sort-btn__label">
                                  <span>{col.labelLines[0]}</span>
                                  <span>{col.labelLines[1]}</span>
                                </span>
                              ) : (
                                <span className="jp-vocab-stats-sort-btn__label">{col.label}</span>
                              )}
                              <span className="jp-vocab-sort-indicator" aria-hidden="true">
                                {active ? (statSort.dir === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </th>
                  <th rowSpan={2} className="jp-vocab-today-check-col" title="今日抽查次数">
                    <EnVocabThSortButton
                      sortKey="today"
                      statSort={statSort}
                      onStatSort={onStatSort}
                      title="按今日抽查次数排序"
                      labelLines={["今日", "抽查次数"]}
                    />
                  </th>
                  {isAdmin ? (
                    <th
                      rowSpan={2}
                      className="jp-vocab-updated-col"
                      title="词条最近一次更新时间（编辑、补全、勾选熟悉程度等）"
                    >
                      <EnVocabThSortButton
                        sortKey="updated"
                        statSort={statSort}
                        onStatSort={onStatSort}
                        title="按最近更新时间排序"
                        labelLines={["更新", "时间"]}
                      />
                    </th>
                  ) : null}
                  {SHOW_REMARKS_COLUMN ? (
                    <th rowSpan={2} className="jp-vocab-notes-col">
                      <EnVocabThSortButton
                        sortKey="notes"
                        statSort={statSort}
                        onStatSort={onStatSort}
                        title="按是否有备注排序"
                        label="备注"
                      />
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-action-col">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {words.map((w, rowIndex) => {
                  const isHighlight = highlightId === w.id;
                  const isSharedToday = sharedTodayWordIds.has(w.id);
                  const reviewLocked = reviewLockedByWordId[w.id] ?? false;
                  const selected = effectiveEnVocabDisplayLevel(
                    w,
                    sessionLevel[w.id],
                    {
                      displayOrder,
                    }
                  );
                  const isSaving = savingId === w.id;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const risk = enVocabRiskIndex(w);
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const checkedInRound = enVocabCheckedInRound(displayOrder, w);
                  const dailySeq = dailySeqByWordId.get(w.id) ?? rowIndex + 1;
                  const inQuizTarget = isWordInQuizTarget(w.id);
                  const tableQuizLocked = teacherQuizLocksTable && inQuizTarget;
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const riskBadgeTier =
                    risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";

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
                      {isAdmin ? (
                        <td className="jp-vocab-select-col" data-label="选择">
                          <input
                            type="checkbox"
                            className="jp-vocab-select-checkbox"
                            checked={selectedDeleteIds.has(w.id)}
                            aria-label={`选择 ${w.word}`}
                            disabled={deletingBatch}
                            onChange={(e) => onToggleDeleteSelection(w.id, e.target.checked)}
                          />
                        </td>
                      ) : null}
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
                      <td
                        className="en-vocab-category-col"
                        data-label="分类"
                        style={{ color: "var(--muted)" }}
                      >
                        {displayEnVocabCategory(w.category)}
                      </td>
                      <td
                        className="en-vocab-upload-source-col"
                        data-label="上传类型"
                        style={{ color: "var(--muted)", fontSize: "0.82rem" }}
                        title={displayEnVocabUploadSource(w.upload_source)}
                      >
                        {displayEnVocabUploadSource(w.upload_source)}
                      </td>
                      <td className="jp-vocab-word-col" data-label="单词 / 语法">
                        <div className="jp-vocab-word-cell">
                          {w.ref_key ? (
                            <>
                              <button
                                type="button"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => onRefPreview(w.ref_key!, ref)}
                              >
                                {w.word}
                              </button>
                              <span className="jp-vocab-ref-hint">（点击查看教案）</span>
                            </>
                          ) : (
                            <span className="jp-vocab-word-text">{w.word}</span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="音标 / 读音"
                      >
                        <div className="en-vocab-reading-cell">
                          <div className="en-vocab-reading-main">
                            {w.kind === "word" ? (
                              <EnVocabSpeakButton text={w.word} />
                            ) : null}
                            {readingTrim ? (
                              <span
                                className="en-vocab-reading-text"
                                title={readingTrim}
                              >
                                {readingTrim}
                              </span>
                            ) : w.kind === "word" ? (
                              <span className="en-vocab-reading-text en-vocab-reading-text--pending">
                                待补全
                              </span>
                            ) : null}
                          </div>
                          {w.reading_source?.trim() ? (
                            <JpVocabSourceLabel source={w.reading_source} />
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
                        {meaningTrim}
                        {w.meaning_source?.trim() ? (
                          <JpVocabSourceLabel source={w.meaning_source} />
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${!posTrim ? " jp-vocab-field-empty" : ""}`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim}
                      </td>
                      <td
                        className={`jp-vocab-usage-ex-col${
                          !(w.usage || "").trim() &&
                          !(w.example_sentences || "").trim()
                            ? " jp-vocab-field-empty"
                            : ""
                        }`}
                        data-label="用法 / 例句"
                        style={{ color: "var(--muted)" }}
                      >
                        <EnVocabUsageExamplesCell
                          usage={w.usage}
                          exampleSentences={w.example_sentences}
                          onOpen={() => onViewUsage(w)}
                        />
                      </td>
                      {isAdmin ? (
                        <td
                          className={`jp-vocab-mnemonic-col${
                            !(w.mnemonic || "").trim() ? " jp-vocab-field-empty" : ""
                          }`}
                          data-label="巧记"
                        >
                          {(w.mnemonic || "").trim() ? (
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact"
                              title="查看巧记"
                              onClick={() => onViewMnemonic(w)}
                            >
                              查看
                            </button>
                          ) : (
                            <span
                              className="jp-vocab-mnemonic-empty"
                              title="可在「编辑」中填写巧记"
                            >
                              —
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="jp-vocab-risk-col" data-label="优先级">
                        <span
                          className={`jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--${riskBadgeTier}`}
                        >
                          {risk.toFixed(1)}
                        </span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度">
                        {!inQuizTarget && teacherQuizLocksTable ? (
                          <span
                            className="jp-vocab-level-unavailable"
                            title={`仅今日抽查池内的词条可勾选熟悉程度（共 ${quizTarget} 个）`}
                          >
                            不可勾选
                          </span>
                        ) : tableQuizLocked ? (
                          <button
                            type="button"
                            className="jp-vocab-level-card-entry"
                            disabled={isSaving}
                            title="熟悉程度请在单词卡片内勾选"
                            onClick={() => {
                              if (quizSession != null) {
                                onResumeQuiz(w.id);
                              } else {
                                onRequestQuizMode(w.id);
                              }
                              onStatus("请在单词卡片内勾选熟悉程度。");
                            }}
                          >
                            <div
                              className="jp-vocab-levels jp-vocab-levels--locked jp-vocab-levels--readonly"
                              aria-hidden="true"
                            >
                              {EN_VOCAB_LEVELS.map((lv) => {
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
                        ) : (
                          <div
                            className="jp-vocab-levels"
                            role="group"
                            aria-label={`${w.word} 熟悉程度`}
                          >
                            {EN_VOCAB_LEVELS.map((lv) => {
                              const checked = selected === lv.key;
                              return (
                                <button
                                  key={lv.key}
                                  type="button"
                                  className={`jp-vocab-level-opt${
                                    checked ? " is-checked" : ""
                                  }${
                                    !canOperate || reviewLocked
                                      ? " jp-vocab-level-opt--readonly"
                                      : ""
                                  }${lv.key === "very" ? " jp-vocab-level-opt--very" : ""}${
                                    lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                                  }`}
                                  disabled={!canOperate || isSaving || reviewLocked}
                                  title={
                                    reviewLocked
                                      ? "勾选已满 1 小时，无法再修改熟悉程度"
                                      : !canOperate
                                        ? "登录后可勾选"
                                        : isSaving
                                          ? "保存中…"
                                          : undefined
                                  }
                                  aria-pressed={checked}
                                  onClick={() => void onRecordLevel(w.id, lv.key)}
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
                            {(() => {
                              const totalDisplay = formatEnVocabTotalReviewsDisplay(w, locale);
                              if (totalDisplay.isZero) {
                                return (
                                  <span
                                    className="jp-vocab-total-never"
                                    title={enVocabTotalReviewsZeroHint(locale)}
                                  >
                                    {totalDisplay.labelLines ? (
                                      <>
                                        <span>{totalDisplay.labelLines[0]}</span>
                                        <span>{totalDisplay.labelLines[1]}</span>
                                      </>
                                    ) : (
                                      totalDisplay.label
                                    )}
                                  </span>
                                );
                              }
                              return totalDisplay.label;
                            })()}
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
                      {isAdmin ? (
                        <td
                          className={`jp-vocab-updated-col${!w.updated_at ? " jp-vocab-field-empty" : ""}`}
                          data-label="更新时间"
                        >
                          {w.updated_at ? (
                            renderEnVocabUpdatedAt(w.updated_at)
                          ) : (
                            <span className="jp-vocab-mnemonic-empty">—</span>
                          )}
                        </td>
                      ) : null}
                      {SHOW_REMARKS_COLUMN ? (
                        <td
                          className={`jp-vocab-notes-col${
                            !hasEnVocabClassNotes(
                              w.class_notes,
                              w.class_notes_present
                            ) && !canOperate
                              ? " jp-vocab-field-empty"
                              : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-actions">
                            {hasEnVocabClassNotes(
                              w.class_notes,
                              w.class_notes_present
                            ) ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                onClick={() => onViewRemarks(w)}
                              >
                                查看
                              </button>
                            ) : null}
                            {canOperate ? (
                              <EnEditIconButton
                                title="编辑备注"
                                onClick={() => onEditRemarks(w)}
                              />
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${!canOperate ? " jp-vocab-field-empty" : ""}`}
                        data-label="操作"
                      >
                        {canOperate ? (
                          <div className="jp-vocab-action-buttons">
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact"
                              onClick={() => onEditWord(w)}
                            >
                              编辑
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                title="预览老师端抽问卡片显示"
                                onClick={() => onPreviewQuizCard(w.id)}
                              >
                                查看抽问卡片
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                                disabled={deletingBatch}
                                title="删除此词条"
                                onClick={() => void onDeleteWord(w)}
                              >
                                删除
                              </button>
                            ) : null}
                            {teacherShareUiEnabled ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-share-btn"
                                disabled={
                                  sharingId === w.id ||
                                  isSaving ||
                                  isSharedToday ||
                                  reviewLocked
                                }
                                title={
                                  isSharedToday
                                    ? "今日已共享"
                                    : reviewLocked
                                      ? "勾选已满 1 小时，无法再发给学生"
                                      : sharingId === w.id
                                        ? "共享中…"
                                        : "共享到学生「今日背英语单词」，并标记为不熟悉"
                                }
                                onClick={() => void onShareWord(w.id)}
                              >
                                {isSharedToday
                                  ? "已共享"
                                  : sharingId === w.id
                                    ? "共享中…"
                                    : "共享"}
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
