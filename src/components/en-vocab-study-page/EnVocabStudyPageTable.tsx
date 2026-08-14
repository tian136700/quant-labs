"use client";

import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnVocabSpeakButton } from "@/components/EnVocabSpeakButton";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import {
  formatEnVocabTotalReviewsDisplay,
  enVocabRiskIndex,
  enVocabTotalReviewsZeroHint,
} from "@/lib/en-vocab-shared";
import type { Locale } from "@/i18n/messages";
import type { EnVocabLevel, EnVocabSharedItem, EnVocabWord } from "@/lib/types";

const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const STAT_COLUMNS = [
  { key: "very", label: "非常熟悉", labelLines: ["非常", "熟悉"] as [string, string], className: "jp-vocab-stat-detail" },
  { key: "normal", label: "一般", className: "jp-vocab-stat-detail" },
  { key: "weak", label: "不熟悉", labelLines: ["不", "熟悉"] as [string, string], className: "jp-vocab-stat-detail" },
  { key: "total", label: "合计", className: "jp-vocab-stat-total" },
] as const;

const SHOW_REMARKS_COLUMN = true;

export type EnVocabStudyPageTableProps = {
  locale: Locale;
  loading: boolean;
  items: EnVocabSharedItem[];
  shareDate: string;
  canViewStudy: boolean;
  canOperate: boolean;
  openRemarksWord: (word: EnVocabWord) => void;
  setEditingWord: (word: EnVocabWord | null) => void;
  setEditingRemarksWord: (word: EnVocabWord | null) => void;
  onViewCard: (item: EnVocabSharedItem) => void;
};

export function EnVocabStudyPageTable(props: EnVocabStudyPageTableProps) {
  const {
    locale,
    loading,
    items,
    shareDate,
    canViewStudy,
    canOperate,
    openRemarksWord,
    setEditingWord,
    setEditingRemarksWord,
    onViewCard,
  } = props;

  return (
      <section className="section etr-panel" aria-label="今日共享单词">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>共享单词</h2>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            {shareDate ? `${shareDate} · ` : ""}
            共 {items.length} 条
          </span>
        </div>

        {loading && canViewStudy ? (
          <p className="empty">加载中…</p>
        ) : !canViewStudy ? null : items.length === 0 ? (
          <p className="empty">今日暂无共享单词。</p>
        ) : (
          <div className="jp-vocab-table-wrap">
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="jp-vocab-seq-col">
                    序号
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
                  <th rowSpan={2} className="jp-vocab-risk-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>抽查</span>
                      <span>优先级</span>
                    </span>
                  </th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>熟悉程度</span>
                      <span className="jp-vocab-th-multiline__sub">(老师勾选)</span>
                    </span>
                  </th>
                  <th colSpan={4} className="jp-vocab-stats-group">
                    复习次数统计
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
                <tr>
                  {STAT_COLUMNS.map((col) => (
                    <th key={col.key} className={col.className}>
                      {"labelLines" in col && col.labelLines ? (
                        <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                          <span>{col.labelLines[0]}</span>
                          <span>{col.labelLines[1]}</span>
                        </span>
                      ) : (
                        <span>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const w = item.word;
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const selected = item.level;
                  const risk = enVocabRiskIndex(w);
                  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const hasNotes = hasEnVocabClassNotes(
                    w.class_notes,
                    w.class_notes_present
                  );
                  const renderReadingMain = () => (
                    <>
                      {w.kind === "word" ? (
                        <EnVocabSpeakButton text={w.word} />
                      ) : null}
                      {readingTrim ? (
                        <span className="en-vocab-reading-text" title={readingTrim}>
                          {readingTrim}
                        </span>
                      ) : w.kind === "word" ? (
                        <span className="en-vocab-reading-text en-vocab-reading-text--pending">
                          待补全
                        </span>
                      ) : null}
                    </>
                  );
                  const renderNotesActions = () => (
                    <div className="jp-vocab-notes-actions">
                      {hasNotes ? (
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-notes-view-btn"
                          title={canOperate ? "查看并编辑备注" : "查看备注"}
                          onClick={() => openRemarksWord(w)}
                        >
                          查看
                        </button>
                      ) : null}
                      {canOperate ? (
                        <EnEditIconButton
                          title="编辑备注"
                          className="jp-vocab-notes-edit-btn"
                          onClick={() => setEditingRemarksWord(w)}
                        />
                      ) : null}
                    </div>
                  );

                  return (
                    <tr key={item.id} id={`jp-vocab-study-row-${w.id}`}>
                      <td className="jp-vocab-seq-col" data-label="序号">
                        <span className="jp-vocab-seq-cell">
                          <span className="jp-vocab-seq-num">{index + 1}</span>
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
                          <button
                            type="button"
                            className="jp-vocab-word-link"
                            title="查看详情卡片"
                            onClick={() => onViewCard(item)}
                          >
                            {w.word}
                          </button>
                          <span className="jp-vocab-ref-hint">（点击查看详情卡片）</span>
                        </div>
                        {/* 手机端读音列被藏掉；音标/喇叭须挂在词条下方（对齐日语 study） */}
                        <div className="jp-vocab-mobile-reading-row jp-vocab-mobile-only">
                          {renderReadingMain()}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                      >
                        <div className="en-vocab-reading-cell">
                          <div className="en-vocab-reading-main">{renderReadingMain()}</div>
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
                            <JpVocabSourceLabel source={w.meaning_source} />
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${
                          !posTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim ? (
                          <span className="jp-vocab-pos-badge">{posTrim}</span>
                        ) : null}
                      </td>
                      <td className="jp-vocab-risk-col" data-label="优先级">
                        <span
                          className={`jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--${riskBadgeTier}`}
                        >
                          {risk.toFixed(1)}
                        </span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度">
                        <div
                          className="jp-vocab-levels"
                          role="group"
                          aria-label={`${w.word} 熟悉程度`}
                        >
                          {LEVELS.map((lv) => {
                            const checked = selected === lv.key;
                            return (
                              <span
                                key={lv.key}
                                className={`jp-vocab-level-opt${
                                  checked ? " is-checked" : ""
                                } jp-vocab-level-opt--readonly${
                                  lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
                                aria-pressed={checked}
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
                      </td>
                      <td className="jp-vocab-stat-detail chg-dn" data-label="非常熟悉">
                        {w.cnt_very}
                      </td>
                      <td className="jp-vocab-stat-detail" data-label="一般">
                        {w.cnt_normal}
                      </td>
                      <td className="jp-vocab-stat-detail chg-up" data-label="不熟悉">
                        {w.cnt_weak}
                      </td>
                      <td className="jp-vocab-stat-total" data-label="复习合计">
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
                          <details className="jp-vocab-notes-fold jp-vocab-mobile-only">
                            <summary className="jp-vocab-notes-fold__summary">
                              <span className="jp-vocab-fold-label">备注</span>
                              <span className="jp-vocab-notes-fold__hint">
                                {hasNotes ? "查看 ›" : canOperate ? "编辑 ›" : "—"}
                              </span>
                            </summary>
                            {renderNotesActions()}
                          </details>
                        </td>
                      ) : null}
                      <td className="jp-vocab-action-col" data-label="操作">
                        <div className="jp-vocab-action-buttons">
                          <div className="jp-vocab-action-row">
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn"
                              title="以老师抽问卡片样式查看本词条"
                              onClick={() => onViewCard(item)}
                            >
                              查看卡片
                            </button>
                            {canOperate ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn"
                                onClick={() => setEditingWord(w)}
                              >
                                编辑
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

  );
}
