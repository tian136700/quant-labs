import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { filterJpVocabTodayWeakWords } from "@/lib/jp-vocab-export";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

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
