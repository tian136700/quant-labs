"use client";

import type { EnVocabKindFilter } from "@/lib/en-vocab-search";

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
  return (
    <div className="jp-vocab-search" role="search">
      <label htmlFor="jp-vocab-search" className="jp-vocab-search__label">
        搜索
      </label>
      <div className="jp-vocab-search__row">
        <input
          id="jp-vocab-search"
          type="search"
          className="jp-vocab-search__input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="单词、读音、释义、词性…（本地即时搜索）"
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
        />
        <select
          id="jp-vocab-kind-filter"
          className="jp-vocab-search__kind"
          value={kindFilter}
          onChange={(e) => onKindFilterChange(e.target.value as EnVocabKindFilter)}
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
            onClick={onClear}
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
