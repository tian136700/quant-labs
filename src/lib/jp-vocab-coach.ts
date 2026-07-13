import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { filterJpVocabTodayWeakWords } from "@/lib/jp-vocab-export";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

/** 课堂带读列表仅保留最近 N 个北京时间自然日（含今天） */
export const JP_VOCAB_COACH_RETENTION_DAYS = 5;

function addBeijingCalendarDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(dt.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

/** 仍保留的最早带读日期（含）；早于此日期的 batch 应清除 */
export function jpVocabCoachRetentionCutoffDate(
  now = new Date(),
  retentionDays = JP_VOCAB_COACH_RETENTION_DAYS
): string {
  const today = beijingDateString(now);
  return addBeijingCalendarDays(today, -(retentionDays - 1));
}

export function isJpVocabCoachDateWithinRetention(
  coachDate: string,
  now = new Date(),
  retentionDays = JP_VOCAB_COACH_RETENTION_DAYS
): boolean {
  const trimmed = coachDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  return trimmed >= jpVocabCoachRetentionCutoffDate(now, retentionDays);
}

export function jpVocabCoachLevelLabel(level: JpVocabLevel): string {
  if (level === "weak") return "不熟悉";
  if (level === "normal") return "一般";
  return "非常熟悉";
}

export type JpVocabCoachLevelCounts = {
  very: number;
  normal: number;
  weak: number;
};

/** 统计今日抽查目标词条各熟悉程度数量 */
export function countJpVocabCoachLevelCounts(
  words: JpVocabWord[],
  sessionLevel: Record<number, JpVocabLevel | undefined>,
  displayOrder: JpVocabDailyDisplayOrder
): JpVocabCoachLevelCounts {
  const counts: JpVocabCoachLevelCounts = { very: 0, normal: 0, weak: 0 };
  for (const word of words) {
    const level = effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], {
      displayOrder,
    });
    if (level === "very") counts.very += 1;
    else if (level === "normal") counts.normal += 1;
    else if (level === "weak") counts.weak += 1;
  }
  return counts;
}

export function buildJpVocabCoachExportItems(
  words: JpVocabWord[],
  sessionLevel: Record<number, JpVocabLevel | undefined>,
  displayOrder: JpVocabDailyDisplayOrder
): Array<{ word_id: number; level: "normal" | "weak"; display_order: number }> {
  const exportWords = filterJpVocabTodayWeakWords(words, sessionLevel, displayOrder);
  return exportWords
    .map((word, index) => {
      const level = effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], {
        displayOrder,
      });
      if (level !== "normal" && level !== "weak") return null;
      return {
        word_id: word.id,
        level,
        display_order: index + 1,
      };
    })
    .filter(
      (
        item
      ): item is { word_id: number; level: "normal" | "weak"; display_order: number } =>
        item != null
    );
}

export async function postJpVocabCoachBatch(
  locale: "zh" | "en",
  items: Array<{ word_id: number; level: "normal" | "weak"; display_order: number }>,
  coachDate = beijingDateString()
): Promise<{ coach_date: string; item_count: number }> {
  if (!items.length) {
    throw new Error("今日暂无勾选为「一般」或「不熟悉」的词条。");
  }

  const res = await fetch("/api/jp-vocab/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LOCALE_HEADER]: locale,
    },
    credentials: "include",
    body: JSON.stringify({
      action: "export_batch",
      coach_date: coachDate,
      items,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    coach_date?: string;
    item_count?: number;
    error?: string;
  };
  if (!data.ok) {
    throw new Error(data.error || "导出到课堂带读失败");
  }
  return {
    coach_date: data.coach_date ?? coachDate,
    item_count: data.item_count ?? items.length,
  };
}
