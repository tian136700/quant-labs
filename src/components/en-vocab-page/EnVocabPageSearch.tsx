"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { EnVocabKindFilter } from "@/lib/en-vocab-search";
import {
  clearEnVocabSearchHistory,
  pushEnVocabSearchHistory,
  readStoredEnVocabSearchHistory,
  removeEnVocabSearchHistoryItem,
  writeStoredEnVocabKindFilter,
  writeStoredEnVocabSearchQuery,
} from "@/lib/en-vocab-page-helpers";

type EnVocabPageSearchProps = {
  loading: boolean;
  searchQuery: string;
  kindFilter: EnVocabKindFilter;
  filterActive: boolean;
  searchActive: boolean;
  filteredCount: number;
  displayedCount: number;
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: EnVocabKindFilter) => void;
  onClear: () => void;
};

export function EnVocabPageSearch({
  loading,
  searchQuery,
  kindFilter,
  filterActive,
  searchActive,
  filteredCount,
  displayedCount,
  onSearchChange,
  onKindFilterChange,
  onClear,
}: EnVocabPageSearchProps) {
  const listboxId = useId();
  const blurCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(readStoredEnVocabSearchHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    };
  }, []);

  const commitHistory = (value: string = searchQuery) => {
    const next = pushEnVocabSearchHistory(value);
    setHistory(next);
  };

  const handleSearchChange = (value: string) => {
    writeStoredEnVocabSearchQuery(value);
    onSearchChange(value);
  };

  const handleKindFilterChange = (value: EnVocabKindFilter) => {
    writeStoredEnVocabKindFilter(value);
    onKindFilterChange(value);
  };

  const handleClear = () => {
    writeStoredEnVocabSearchQuery("");
    writeStoredEnVocabKindFilter("all");
    onClear();
    setHistoryOpen(false);
  };

  const handlePickHistory = (item: string) => {
    writeStoredEnVocabSearchQuery(item);
    onSearchChange(item);
    commitHistory(item);
    setHistoryOpen(false);
  };

  const handleClearHistory = () => {
    if (!window.confirm("确定清除全部搜索记录吗？")) return;
    clearEnVocabSearchHistory();
    setHistory([]);
    setHistoryOpen(false);
  };

  const handleRemoveHistoryItem = (item: string) => {
    setHistory(removeEnVocabSearchHistoryItem(item));
  };

  const showHistory = historyOpen && history.length > 0 && !loading;

  return (
    <div className="jp-vocab-search" role="search">
      <label htmlFor="en-vocab-search" className="jp-vocab-search__label">
        搜索
      </label>
      <div className="jp-vocab-search__row">
        <div className="jp-vocab-search__input-wrap">
          <input
            id="en-vocab-search"
            type="search"
            className="jp-vocab-search__input"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (blurCloseTimerRef.current) {
                clearTimeout(blurCloseTimerRef.current);
                blurCloseTimerRef.current = null;
              }
              setHistory(readStoredEnVocabSearchHistory());
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
          id="en-vocab-kind-filter"
          className="jp-vocab-search__kind"
          value={kindFilter}
          onChange={(e) =>
            handleKindFilterChange(e.target.value as EnVocabKindFilter)
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
            匹配 {filteredCount} / {displayedCount} 条
          </span>
        </>
      ) : null}
      {filterActive && filteredCount === 0 ? (
        <p className="jp-vocab-search__empty">
          {searchActive
            ? `没有匹配「${searchQuery.trim()}」的词条，请换个关键词试试。`
            : kindFilter === "grammar"
              ? "当前没有语法条目。"
              : "当前没有单词条目。"}
        </p>
      ) : null}
    </div>
  );
}
