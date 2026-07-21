import {
  beijingDateString,
  beijingTomorrowDateString,
} from "@/lib/jp-vocab-daily-check";
import type { JpVocabWord } from "@/lib/types";

/** 管理员标记「明日优先抽查」的队列（存 jp_vocab_setting） */
export type JpVocabQuizPriorityBoost = {
  /** 生效日（北京 YYYY-MM-DD）：该日凌晨重排时按 seq 置顶 */
  target_date: string;
  entries: Array<{ word_id: number; seq: number }>;
};

export function normalizeJpVocabQuizPriorityBoost(
  raw: unknown
): JpVocabQuizPriorityBoost | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<JpVocabQuizPriorityBoost>;
  if (!obj.target_date || !Array.isArray(obj.entries)) return null;
  const entries = obj.entries
    .map((entry) => ({
      word_id: Number(entry?.word_id),
      seq: Number(entry?.seq),
    }))
    .filter((entry) => entry.word_id > 0 && entry.seq > 0)
    .sort((a, b) => a.seq - b.seq);
  if (!entries.length) return null;
  return { target_date: String(obj.target_date), entries };
}

/** 指定生效日：word_id → 置顶序号（1-based，越小越靠前） */
export function buildJpVocabQuizPriorityBoostSeqMap(
  boost: JpVocabQuizPriorityBoost | null | undefined,
  effectiveDate: string
): Map<number, number> {
  const map = new Map<number, number>();
  if (!boost || boost.target_date !== effectiveDate) return map;
  for (const entry of boost.entries) {
    if (!map.has(entry.word_id)) {
      map.set(entry.word_id, entry.seq);
    }
  }
  return map;
}

/** 管理员端：词条是否已排队到明日优先 */
export function jpVocabTomorrowBoostSeq(
  boost: JpVocabQuizPriorityBoost | null | undefined,
  wordId: number,
  now = new Date()
): number | null {
  const tomorrow = beijingTomorrowDateString(now);
  if (!boost || boost.target_date !== tomorrow) return null;
  const entry = boost.entries.find((item) => item.word_id === wordId);
  return entry?.seq ?? null;
}

export function appendJpVocabQuizPriorityBoostEntry(
  boost: JpVocabQuizPriorityBoost | null | undefined,
  wordId: number,
  now = new Date()
): JpVocabQuizPriorityBoost {
  const tomorrow = beijingTomorrowDateString(now);
  const base =
    boost?.target_date === tomorrow
      ? {
          target_date: tomorrow,
          entries: boost.entries.filter((entry) => entry.word_id !== wordId),
        }
      : { target_date: tomorrow, entries: [] as JpVocabQuizPriorityBoost["entries"] };
  const nextSeq =
    base.entries.length > 0
      ? Math.max(...base.entries.map((entry) => entry.seq)) + 1
      : 1;
  return {
    target_date: tomorrow,
    entries: [...base.entries, { word_id: wordId, seq: nextSeq }],
  };
}

export function clearJpVocabQuizPriorityBoostForDate(
  boost: JpVocabQuizPriorityBoost | null | undefined,
  effectiveDate: string
): JpVocabQuizPriorityBoost | null {
  if (!boost || boost.target_date !== effectiveDate) return boost ?? null;
  return null;
}

export function pruneJpVocabQuizPriorityBoostWordIds(
  boost: JpVocabQuizPriorityBoost | null | undefined,
  removedWordIds: Set<number>
): JpVocabQuizPriorityBoost | null {
  if (!boost || removedWordIds.size === 0) return boost ?? null;
  const entries = boost.entries.filter(
    (entry) => !removedWordIds.has(entry.word_id)
  );
  if (!entries.length) return null;
  return { ...boost, entries };
}
