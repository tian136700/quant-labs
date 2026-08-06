"use client";

import { useEffect } from "react";
import { EN_VOCAB_SEARCH_FRESH_DEBOUNCE_MS } from "@/lib/en-vocab-page-constants";

/**
 * 搜索关键词非空时强制拉最新词表（绕过本地 SWR TTL），避免管理员/老师
 * 搜到的是 localStorage 里过期的释义、音标、例句等。对齐日语 useJpVocabSearchFreshLoad。
 */
export function useEnVocabSearchFreshLoad(
  searchQuery: string,
  loadWords: (opts?: { force?: boolean }) => void | Promise<void>
) {
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = window.setTimeout(() => {
      void loadWords({ force: true });
    }, EN_VOCAB_SEARCH_FRESH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, loadWords]);
}
