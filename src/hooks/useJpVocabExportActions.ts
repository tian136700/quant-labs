"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/messages";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import {
  buildJpVocabCoachExportItems,
  postJpVocabCoachMerge,
} from "@/lib/jp-vocab-coach";
import {
  resolveJpVocabExportWords,
  type JpVocabExportScope,
} from "@/lib/jp-vocab-export-select";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export function useJpVocabExportActions(options: {
  locale: Locale;
  setStatus: (message: string) => void;
  setError: (message: string) => void;
  onCloseExportChoice: () => void;
}) {
  const { locale, setStatus, setError, onCloseExportChoice } = options;
  const [exporting, setExporting] = useState(false);

  const runExport = async (
    scope: JpVocabExportScope,
    words: JpVocabWord[],
    displayOrder: JpVocabDailyDisplayOrder,
    sessionLevel: Record<number, JpVocabLevel | undefined>,
    dailySeqByWordId: Map<number, number>
  ) => {
    if (exporting) return;
    const exportWords = resolveJpVocabExportWords(
      scope,
      words,
      displayOrder,
      sessionLevel
    );
    setExporting(true);
    setStatus("");
    setError("");
    try {
      const { exportJpVocabToWord } = await import("@/lib/jp-vocab-export");
      await exportJpVocabToWord(exportWords, scope, dailySeqByWordId);
      onCloseExportChoice();
      setStatus(
        scope === "today_weak"
          ? `已导出今日未掌握 ${exportWords.length} 条到 Word。`
          : `已导出全部 ${exportWords.length} 条到 Word。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const runExportExcel = async (
    words: JpVocabWord[],
    displayOrder: JpVocabDailyDisplayOrder,
    quizTimeWeight: number
  ) => {
    if (exporting || !words.length) return;
    setExporting(true);
    setStatus("");
    setError("");
    try {
      const { exportJpVocabReviewStatsToExcel } = await import(
        "@/lib/jp-vocab-excel-export"
      );
      await exportJpVocabReviewStatsToExcel(words, displayOrder, quizTimeWeight);
      onCloseExportChoice();
      setStatus(`已导出 ${words.length} 条复习次数统计到 Excel。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const runCoachExport = async (
    words: JpVocabWord[],
    sessionLevel: Record<number, JpVocabLevel | undefined>,
    displayOrder: JpVocabDailyDisplayOrder
  ) => {
    if (exporting) return;
    const items = buildJpVocabCoachExportItems(words, sessionLevel, displayOrder);
    if (!items.length) {
      setError("今日暂无勾选为「一般」或「不熟悉」的词条。");
      return;
    }

    setExporting(true);
    setStatus("");
    setError("");
    try {
      const result = await postJpVocabCoachMerge(locale, items);
      onCloseExportChoice();
      setStatus(
        `已合并到课堂带读：未带读 ${result.pending_count} 条（新增 ${result.added_count}）。可打开「课堂带读」页面带读。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return {
    exporting,
    runExport,
    runExportExcel,
    runCoachExport,
  };
}
