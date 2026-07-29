"use client";

import { useEffect, useId, useRef, useState } from "react";
import { jpVocabPriorityLabel } from "@/lib/jp-vocab-shared";
import type { JpVocabKindFilter } from "@/lib/jp-vocab-search";
import type { JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import type { Locale } from "@/i18n/messages";
import {
  clearJpVocabSearchHistory,
  pushJpVocabSearchHistory,
  readStoredJpVocabSearchHistory,
  removeJpVocabSearchHistoryItem,
  writeStoredJpVocabKindFilter,
  writeStoredJpVocabSearchQuery,
} from "@/lib/jp-vocab-page-helpers";

type JpVocabPageSearchProps = {
  locale: Locale;
  loading: boolean;
  searchQuery: string;
  kindFilter: JpVocabKindFilter;
  filterActive: boolean;
  searchActive: boolean;
  useDailyRowOrder: boolean;
  statSort: { key: JpVocabStatSortKey; dir: "asc" | "desc" };
  quizTimeWeight: number;
  hideInoperableRows: boolean;
  dailyQuizComplete: boolean;
  filteredCount: number;
  searchMatchedCount: number;
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: JpVocabKindFilter) => void;
  onClear: () => void;
  onRestoreDailyRowOrder: () => void;
  onToggleStatSort: (key: JpVocabStatSortKey) => void;
};

export function JpVocabPageSearch({
  locale,
  loading,
  searchQuery,
  kindFilter,
  filterActive,
  searchActive,
  useDailyRowOrder,
  statSort,
  quizTimeWeight,
  hideInoperableRows,
  dailyQuizComplete,
  filteredCount,
  searchMatchedCount,
  onSearchChange,
  onKindFilterChange,
  onClear,
  onRestoreDailyRowOrder,
  onToggleStatSort,
}: JpVocabPageSearchProps) {
  const listboxId = useId();
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(readStoredJpVocabSearchHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    };
  }, []);

  const commitHistory = (value: string = searchQuery) => {
    const next = pushJpVocabSearchHistory(value);
    setHistory(next);
  };

  const handleSearchChange = (value: string) => {
    writeStoredJpVocabSearchQuery(value);
    onSearchChange(value);
  };

  const handleKindFilterChange = (value: JpVocabKindFilter) => {
    writeStoredJpVocabKindFilter(value);
    onKindFilterChange(value);
  };

  const handleClear = () => {
    writeStoredJpVocabSearchQuery("");
    writeStoredJpVocabKindFilter("all");
    onClear();
    setHistoryOpen(false);
  };

  const handlePickHistory = (item: string) => {
    writeStoredJpVocabSearchQuery(item);
    onSearchChange(item);
    commitHistory(item);
    setHistoryOpen(false);
  };

  const handleClearHistory = () => {
    if (!window.confirm("确定清除全部搜索记录吗？")) return;
    clearJpVocabSearchHistory();
    setHistory([]);
    setHistoryOpen(false);
  };

  const handleRemoveHistoryItem = (item: string) => {
    setHistory(removeJpVocabSearchHistoryItem(item));
  };

  const showHistory = historyOpen && history.length > 0 && !loading;

  return (
    <>
      <div
        className="jp-vocab-mobile-sort jp-vocab-mobile-only"
        role="group"
        aria-label="单词表排序"
      >
        <button
          type="button"
          className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
            useDailyRowOrder ? " jp-vocab-mobile-sort-btn--active" : ""
          }`}
          onClick={onRestoreDailyRowOrder}
          title="恢复当日固定顺序（北京时间 0 点重排，当天内不变）"
        >
          默认顺序
        </button>
        <button
          type="button"
          className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
            !useDailyRowOrder && statSort.key === "risk"
              ? " jp-vocab-mobile-sort-btn--active"
              : ""
          }`}
          aria-pressed={!useDailyRowOrder && statSort.key === "risk"}
          title={`按${jpVocabPriorityLabel(locale)}（最终得分=基础优先级+天数×${quizTimeWeight}）排序；再次点击切换升降序`}
          onClick={() => onToggleStatSort("risk")}
        >
          {jpVocabPriorityLabel(locale)}
          {!useDailyRowOrder && statSort.key === "risk" ? (
            <span className="jp-vocab-mobile-sort-indicator" aria-hidden="true">
              {statSort.dir === "desc" ? " ↓" : " ↑"}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-sort-btn${
            !useDailyRowOrder && statSort.key === "seq"
              ? " jp-vocab-mobile-sort-btn--active"
              : ""
          }`}
          aria-pressed={!useDailyRowOrder && statSort.key === "seq"}
          title="按当日固定序号排序；再次点击切换升降序"
          onClick={() => onToggleStatSort("seq")}
        >
          当日序号
          {!useDailyRowOrder && statSort.key === "seq" ? (
            <span className="jp-vocab-mobile-sort-indicator" aria-hidden="true">
              {statSort.dir === "desc" ? " ↓" : " ↑"}
            </span>
          ) : null}
        </button>
      </div>
      <div className="jp-vocab-search" role="search">
        <label htmlFor="jp-vocab-search" className="jp-vocab-search__label">
          搜索
        </label>
        <div className="jp-vocab-search__row">
          <div className="jp-vocab-search__input-wrap">
            <input
              id="jp-vocab-search"
              type="search"
              className="jp-vocab-search__input"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (blurCloseTimerRef.current) {
                  clearTimeout(blurCloseTimerRef.current);
                  blurCloseTimerRef.current = null;
                }
                setHistory(readStoredJpVocabSearchHistory());
                setHistoryOpen(true);
              }}
              onBlur={() => {
                blurCloseTimerRef.current = setTimeout(() => {
                  setHistoryOpen(false);
                  commitHistory();
                }, 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHistory();
                  setHistoryOpen(false);
                  (e.currentTarget as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setHistoryOpen(false);
                }
              }}
              placeholder="单词、读音、释义、词性…（搜索全库；有关键词时自动拉最新）"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={showHistory}
              aria-controls={listboxId}
              aria-autocomplete="list"
            />
            {showHistory ? (
              <div
                id={listboxId}
                className="jp-vocab-search__history"
                role="listbox"
                aria-label="最近搜索"
              >
                <div className="jp-vocab-search__history-head">
                  <span>最近搜索</span>
                  <button
                    type="button"
                    className="jp-vocab-search__history-clear"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleClearHistory}
                  >
                    清除记录
                  </button>
                </div>
                <ul className="jp-vocab-search__history-list">
                  {history.map((item) => (
                    <li key={item} className="jp-vocab-search__history-item" role="option">
                      <button
                        type="button"
                        className="jp-vocab-search__history-pick"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handlePickHistory(item)}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        className="jp-vocab-search__history-remove"
                        aria-label={`删除搜索记录「${item}」`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleRemoveHistoryItem(item)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <select
            id="jp-vocab-kind-filter"
            className="jp-vocab-search__kind"
            value={kindFilter}
            onChange={(e) =>
              handleKindFilterChange(e.target.value as JpVocabKindFilter)
            }
            disabled={loading}
            aria-label="类型筛选"
          >
            <option value="all">全部</option>
            <option value="word">单词</option>
            <option value="grammar">语法</option>
          </select>
        </div>
        {filterActive ? (
          <>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-search__clear"
              onClick={handleClear}
            >
              清除
            </button>
            <span className="jp-vocab-search__meta">
              匹配 {filteredCount} / {searchMatchedCount} 条
            </span>
          </>
        ) : null}
      </div>
      {filterActive && filteredCount === 0 ? (
        <p className="jp-vocab-search__empty">
          {searchActive &&
          searchMatchedCount > 0 &&
          hideInoperableRows &&
          !dailyQuizComplete
            ? `全库有匹配「${searchQuery.trim()}」的词条，但超出今日可抽查序号或已满 1 小时不可改，老师端不显示。`
            : searchActive
              ? `没有匹配「${searchQuery.trim()}」的词条，请换个关键词试试。`
              : kindFilter === "grammar"
                ? "当前没有语法条目。"
                : "当前没有单词条目。"}
        </p>
      ) : !filterActive && filteredCount === 0 && hideInoperableRows && dailyQuizComplete ? (
        <p className="jp-vocab-search__empty">
          今日抽查已完成，但暂无已抽查词条记录。
        </p>
      ) : null}
    </>
  );
}
