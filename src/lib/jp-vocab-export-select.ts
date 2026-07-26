import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import { jpVocabWordsInOrder } from "@/lib/jp-vocab-page-helpers";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

export type JpVocabExportScope = "all" | "today_weak";

/** 今日抽查后勾选为「一般」或「不熟悉」的词条（用于次日带读 / 导出筛选） */
export function filterJpVocabTodayWeakWords(
  words: JpVocabWord[],
  sessionLevel: Record<number, JpVocabLevel | undefined>,
  displayOrder: JpVocabDailyDisplayOrder
): JpVocabWord[] {
  const weak = words.filter((word) => {
    const level = effectiveJpVocabDisplayLevel(word, sessionLevel[word.id], {
      displayOrder,
    });
    return level === "normal" || level === "weak";
  });
  if (!displayOrder.ids.length) return weak;
  return jpVocabWordsInOrder(weak, displayOrder.ids);
}

export function resolveJpVocabExportWords(
  scope: JpVocabExportScope,
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  sessionLevel: Record<number, JpVocabLevel | undefined>
): JpVocabWord[] {
  if (scope === "today_weak") {
    return filterJpVocabTodayWeakWords(words, sessionLevel, displayOrder);
  }
  if (displayOrder.ids.length > 0) {
    return jpVocabWordsInOrder(words, displayOrder.ids);
  }
  return [...words];
}
