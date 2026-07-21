import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import { jpVocabTotalReviews } from "@/lib/jp-vocab-shared";
import type { JpVocabWord } from "@/lib/types";

/**
 * 管理员端导出复习次数统计到 Excel（艾宾浩斯等算法复盘用）。
 * 列：单词名、ID、不熟悉/一般/非常熟悉次数、总共抽查次数。
 * `xlsx` 仅在点击导出时动态加载，避免打进 Worker 主包。
 */
export async function exportJpVocabReviewStatsToExcel(
  words: JpVocabWord[],
  displayOrder?: JpVocabDailyDisplayOrder
): Promise<void> {
  if (!words.length) {
    throw new Error("单词表为空，无法导出。");
  }

  const ordered =
    displayOrder && displayOrder.ids.length > 0
      ? jpVocabWordsInOrder(words, displayOrder.ids)
      : [...words];

  const XLSX = await import("xlsx");

  const rows = ordered.map((w) => ({
    单词ID: w.id,
    单词名字: w.word,
    类型: w.kind === "grammar" ? "语法" : "单词",
    不熟悉次数: w.cnt_weak,
    一般次数: w.cnt_normal,
    非常熟悉次数: w.cnt_very,
    总共抽查次数: jpVocabTotalReviews(w),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "复习次数统计");

  const date = beijingDateString();
  XLSX.writeFile(wb, `日语复习次数统计-${date}.xlsx`);
}
