"use client";

import { useEffect, useState } from "react";
import { JP_VOCAB_DEFAULT_STAT_SORT, type JpVocabStatSortKey } from "@/lib/jp-vocab-shared";
import {
  readStoredJpVocabStatSort,
  writeStoredJpVocabStatSort,
} from "@/lib/jp-vocab-page-helpers";

/**
 * 表头排序状态：localStorage 记忆，刷新后仍按上次点的列升/降排。
 * 「恢复当日序号」会写回默认（useDailyRowOrder=true）。
 *
 * 必须先 client mount 再读 storage，再允许写回——否则 SSR 默认值会在
 * useEffect 里把用户已存的排序清掉。
 */
export function useJpVocabPageStatSort(options?: {
  /** 点排序或恢复默认时回调（通常 setPage(1)） */
  onSortChange?: () => void;
}) {
  const onSortChange = options?.onSortChange;
  const [statSort, setStatSort] = useState<{
    key: JpVocabStatSortKey;
    dir: "asc" | "desc";
  }>(() => ({
    key: JP_VOCAB_DEFAULT_STAT_SORT.key,
    dir: JP_VOCAB_DEFAULT_STAT_SORT.dir,
  }));
  const [useDailyRowOrder, setUseDailyRowOrder] = useState(true);
  const [persistReady, setPersistReady] = useState(false);

  useEffect(() => {
    const stored = readStoredJpVocabStatSort();
    setStatSort({ key: stored.key, dir: stored.dir });
    setUseDailyRowOrder(stored.useDailyRowOrder);
    setPersistReady(true);
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    writeStoredJpVocabStatSort({
      key: statSort.key,
      dir: statSort.dir,
      useDailyRowOrder,
    });
  }, [statSort, useDailyRowOrder, persistReady]);

  const toggleStatSort = (key: JpVocabStatSortKey) => {
    setUseDailyRowOrder(false);
    onSortChange?.();
    setStatSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  };

  const restoreDailyRowOrder = () => {
    setUseDailyRowOrder(true);
    setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
    onSortChange?.();
  };

  return {
    statSort,
    useDailyRowOrder,
    toggleStatSort,
    restoreDailyRowOrder,
  };
}
