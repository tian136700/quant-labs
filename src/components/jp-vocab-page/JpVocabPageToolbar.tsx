"use client";

import {
  SHOW_RANDOM_HIGHLIGHT,
  SHOW_RISK_CHART,
} from "@/lib/jp-vocab-page-constants";

type JpVocabPageToolbarProps = {
  isAdminMode: boolean;
  canOperate: boolean;
  canManualAdd: boolean;
  loading: boolean;
  refreshing: boolean;
  wordsCount: number;
  neverQuizzedCount: number;
  unmarkedCount: number;
  todayCheckStats: { wordCount: number; totalActions: number };
  quizTarget: number;
  quizTargetWordsLength: number;
  teacherQuizInProgress: boolean;
  exporting: boolean;
  resetting: boolean;
  mobileToolbarExpanded: boolean;
  onToggleMobileToolbar: () => void;
  onResumeOrStartQuiz: () => void;
  onPickNext: () => void;
  onOpenExportChoice: () => void;
  onShowRiskChart: () => void;
  onManualAdd: () => void;
  onOpenResetChoice: () => void;
};

export function JpVocabPageToolbar({
  isAdminMode,
  canOperate,
  canManualAdd,
  loading,
  refreshing,
  wordsCount,
  neverQuizzedCount,
  unmarkedCount,
  todayCheckStats,
  quizTarget,
  quizTargetWordsLength,
  teacherQuizInProgress,
  exporting,
  resetting,
  mobileToolbarExpanded,
  onToggleMobileToolbar,
  onResumeOrStartQuiz,
  onPickNext,
  onOpenExportChoice,
  onShowRiskChart,
  onManualAdd,
  onOpenResetChoice,
}: JpVocabPageToolbarProps) {
  return (
    <div
      className="jp-vocab-section-head"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "0.75rem",
      }}
    >
      <h2 style={{ fontSize: "1.1rem", margin: 0 }}>单词表</h2>
      <div className="jp-vocab-toolbar">
        <span
          className="jp-vocab-toolbar-summary"
          style={{ color: "var(--muted)", fontSize: "0.875rem" }}
        >
          {isAdminMode ? (
            <>
              共 {wordsCount} 条
              {wordsCount ? (
                <>
                  {" "}
                  · 从未抽查{" "}
                  <span
                    className={
                      neverQuizzedCount > 0
                        ? "jp-vocab-today-summary-value jp-vocab-today-summary-value--never"
                        : "jp-vocab-today-summary-value"
                    }
                    title="复习合计为 0：历史上从未勾选过熟悉程度的词条数"
                  >
                    {neverQuizzedCount}
                  </span>
                </>
              ) : null}
            </>
          ) : null}
          {isAdminMode && wordsCount ? (
            <>
              {" · "}
              今日抽查{" "}
              <span
                className={
                  todayCheckStats.totalActions > 0
                    ? "jp-vocab-today-summary-value jp-vocab-today-summary-value--active"
                    : "jp-vocab-today-summary-value"
                }
                title={
                  todayCheckStats.totalActions > 0
                    ? `今日已抽查 ${todayCheckStats.wordCount} 个词条，共 ${todayCheckStats.totalActions} 次（北京时间 0 点归零）`
                    : "今日尚未抽查（北京时间 0 点归零）"
                }
              >
                {todayCheckStats.wordCount} 个
                {todayCheckStats.totalActions > todayCheckStats.wordCount
                  ? ` · ${todayCheckStats.totalActions} 次`
                  : null}
              </span>
            </>
          ) : null}
          {canOperate ? (
            <>
              {isAdminMode ? " · " : null}
              本轮未勾选 {unmarkedCount}
            </>
          ) : null}
          {refreshing ? (
            <>
              {isAdminMode || canOperate ? " · " : null}
              加载中…
            </>
          ) : null}
        </span>
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-toolbar-toggle jp-vocab-mobile-only"
          onClick={onToggleMobileToolbar}
          aria-expanded={mobileToolbarExpanded}
          aria-controls="jp-vocab-toolbar-actions"
        >
          {mobileToolbarExpanded ? "收起操作 ▲" : "展开操作 ▼"}
        </button>
        <div
          id="jp-vocab-toolbar-actions"
          className={`jp-vocab-toolbar-actions${
            mobileToolbarExpanded ? " jp-vocab-toolbar-actions--expanded" : ""
          }`}
        >
          {canOperate && quizTarget > 0 && quizTargetWordsLength > 0 ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={onResumeOrStartQuiz}
              disabled={loading}
              title={
                teacherQuizInProgress
                  ? "继续抽查卡片"
                  : "开始抽查（本轮随机打乱顺序）"
              }
            >
              {teacherQuizInProgress ? "继续抽查" : "抽查"}
            </button>
          ) : null}
          {SHOW_RANDOM_HIGHLIGHT ? (
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onPickNext}
              disabled={loading || wordsCount < 2}
            >
              随机高亮
            </button>
          ) : null}
          {isAdminMode ? (
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onOpenExportChoice}
              disabled={loading || exporting || !wordsCount}
              title="导出 Word 或 Excel（复习次数统计）"
            >
              {exporting ? "导出中…" : "导出"}
            </button>
          ) : null}
          {SHOW_RISK_CHART ? (
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onShowRiskChart}
              disabled={loading || !wordsCount}
              title="按抽查优先级查看知识点排行，辅助下节课抽查"
            >
              抽查排行
            </button>
          ) : null}
          {canManualAdd ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={onManualAdd}
              disabled={loading}
            >
              手动添加
            </button>
          ) : null}
          {isAdminMode ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--danger"
              onClick={onOpenResetChoice}
              disabled={loading || resetting || !wordsCount || !canOperate}
              title={canOperate ? undefined : "登录后可重置"}
            >
              {resetting ? "重置中…" : "重置"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
