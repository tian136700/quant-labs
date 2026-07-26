import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { filterJpVocabTodayWeakWords } from "@/lib/jp-vocab-export-select";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

/**
 * 已带读保留天数（含当日）。
 * 1 = 北京时间跨日清空前一日及更早的已带读；当日已带读仍保留；未带读不过期。
 */
export const JP_VOCAB_COACH_RETENTION_DAYS = 1;

function addBeijingCalendarDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(dt.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

/** 仍保留的最早已带读日期（含）；早于此的已带读条目可清除 */
export function jpVocabCoachRetentionCutoffDate(
  now = new Date(),
  retentionDays = JP_VOCAB_COACH_RETENTION_DAYS
): string {
  const today = beijingDateString(now);
  return addBeijingCalendarDays(today, -(retentionDays - 1));
}

export function weakerJpVocabCoachLevel(
  a: JpVocabLevel,
  b: JpVocabLevel
): "normal" | "weak" {
  if (a === "weak" || b === "weak") return "weak";
  return "normal";
}

export function jpVocabCoachLevelLabel(level: JpVocabLevel): string {
  if (level === "weak") return "不熟悉";
  if (level === "normal") return "一般";
  return "非常熟悉";
}

export function jpVocabCoachStatusLabel(coachedAt: string | null | undefined): string {
  return coachedAt ? "已带读" : "未带读";
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

/**
 * 从今日抽问勾选结果生成待合并带读项（一般 / 不熟悉）。
 * sessionLevel 可为空对象（服务端无会话时仅看库内今日勾选）。
 */
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

export type JpVocabCoachMergeResult = {
  total: number;
  pending_count: number;
  done_count: number;
  added_count: number;
  merged_count: number;
};

/** 合并进课堂带读队列（剔除已带读 → 与未带读去重） */
export async function postJpVocabCoachMerge(
  locale: "zh" | "en",
  items: Array<{ word_id: number; level: "normal" | "weak"; display_order: number }>
): Promise<JpVocabCoachMergeResult> {
  const res = await fetch("/api/jp-vocab/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LOCALE_HEADER]: locale,
    },
    credentials: "include",
    body: JSON.stringify({
      action: "merge_queue",
      items,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    total?: number;
    pending_count?: number;
    done_count?: number;
    added_count?: number;
    merged_count?: number;
    error?: string;
  };
  if (!data.ok) {
    throw new Error(data.error || "合并到课堂带读失败");
  }
  return {
    total: data.total ?? 0,
    pending_count: data.pending_count ?? 0,
    done_count: data.done_count ?? 0,
    added_count: data.added_count ?? 0,
    merged_count: data.merged_count ?? 0,
  };
}

/** @deprecated 使用 postJpVocabCoachMerge */
export async function postJpVocabCoachBatch(
  locale: "zh" | "en",
  items: Array<{ word_id: number; level: "normal" | "weak"; display_order: number }>,
  _coachDate?: string
): Promise<JpVocabCoachMergeResult & { item_count: number }> {
  if (!items.length) {
    throw new Error("今日暂无勾选为「一般」或「不熟悉」的词条。");
  }
  const result = await postJpVocabCoachMerge(locale, items);
  return { ...result, item_count: result.total };
}

export async function markJpVocabCoachCoachedClient(
  locale: "zh" | "en",
  wordIds: number[]
): Promise<{ marked_count: number }> {
  const res = await fetch("/api/jp-vocab/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LOCALE_HEADER]: locale,
    },
    credentials: "include",
    body: JSON.stringify({
      action: "mark_coached",
      word_ids: wordIds,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    marked_count?: number;
    error?: string;
  };
  if (!data.ok) {
    throw new Error(data.error || "标记已带读失败");
  }
  return { marked_count: data.marked_count ?? wordIds.length };
}

export async function updateJpVocabCoachLevelClient(
  locale: "zh" | "en",
  wordId: number,
  level: JpVocabLevel
): Promise<{ updated: boolean }> {
  const res = await fetch("/api/jp-vocab/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LOCALE_HEADER]: locale,
    },
    credentials: "include",
    body: JSON.stringify({
      action: "update_level",
      word_id: wordId,
      level,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    updated?: boolean;
    error?: string;
  };
  if (!data.ok) {
    throw new Error(data.error || "更新带读熟悉程度失败");
  }
  return { updated: Boolean(data.updated) };
}
