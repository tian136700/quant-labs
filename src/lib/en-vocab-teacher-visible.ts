import { beijingDateString } from "@/lib/en-vocab-daily-check";
import { beijingDateTimeString } from "@/lib/jp-vocab-daily-check";
import { EN_VOCAB_DAILY_QUIZ_TOP } from "@/lib/en-vocab-page-constants";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import type { EnVocabWord } from "@/lib/types";

/** 老师默认今日抽查数量（与硬编码时代的 TOP 一致） */
export const EN_VOCAB_TEACHER_VISIBLE_DEFAULT = EN_VOCAB_DAILY_QUIZ_TOP;

export type EnVocabTeacherVisibleLimit = {
  /** 北京时间 YYYY-MM-DD；跨日回到默认 20 */
  date: string;
  limit: number;
  count: number;
  quiz_target: number;
  released_today: boolean;
  release_count: number;
  /** 当日 display_order 前 N；缺省时客户端回退序号 1…quiz_target */
  visible_ids?: number[];
  quiz_target_adjusted_at?: string;
};

export function defaultEnVocabTeacherVisibleLimit(
  now = new Date()
): EnVocabTeacherVisibleLimit {
  const target = EN_VOCAB_TEACHER_VISIBLE_DEFAULT;
  return {
    date: beijingDateString(now),
    limit: target,
    count: target,
    quiz_target: target,
    released_today: false,
    release_count: target,
    visible_ids: undefined,
  };
}

export function normalizeEnVocabTeacherVisibleLimit(
  raw: unknown,
  now = new Date()
): EnVocabTeacherVisibleLimit {
  const fallback = defaultEnVocabTeacherVisibleLimit(now);
  const today = beijingDateString(now);
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const date = typeof obj.date === "string" && obj.date ? obj.date : today;

  /** 跨日：抽查目标回到默认 20，清空可见池 */
  if (date !== today) {
    return {
      date: today,
      limit: EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
      count: EN_VOCAB_TEACHER_VISIBLE_DEFAULT,
      quiz_target: EN_VOCAB_DAILY_QUIZ_TOP,
      released_today: false,
      release_count: EN_VOCAB_DAILY_QUIZ_TOP,
      visible_ids: undefined,
    };
  }

  const quiz_target = Math.min(
    Math.max(1, Math.floor(Number(obj.quiz_target) || fallback.quiz_target)),
    999
  );
  const visible_ids = Array.isArray(obj.visible_ids)
    ? obj.visible_ids.map((id) => Number(id)).filter((id) => id > 0)
    : undefined;
  return {
    date: today,
    limit: quiz_target,
    count: quiz_target,
    quiz_target,
    released_today: Boolean(obj.released_today),
    release_count: visible_ids?.length ?? quiz_target,
    visible_ids: visible_ids?.length ? visible_ids : undefined,
    quiz_target_adjusted_at:
      typeof obj.quiz_target_adjusted_at === "string"
        ? obj.quiz_target_adjusted_at.trim() || undefined
        : undefined,
  };
}

/** 按当日 display_order 取前 N 作为老师可见池 */
export function pickEnVocabVisibleIds(
  words: EnVocabWord[],
  quizTarget: number,
  dailyOrderIds?: number[] | null
): number[] {
  if (!words.length) return [];
  const n = Math.min(
    Math.max(1, Math.floor(quizTarget)),
    words.length
  );
  const byId = new Set(words.map((w) => w.id));
  const orderedIds = (
    dailyOrderIds?.length
      ? dailyOrderIds.filter((id) => byId.has(id))
      : words.map((w) => w.id)
  ).slice();
  const seen = new Set(orderedIds);
  for (const word of words) {
    if (!seen.has(word.id)) orderedIds.push(word.id);
  }
  return orderedIds.slice(0, n);
}

export function withEnVocabTargetAdjustmentMarker(
  visible: EnVocabTeacherVisibleLimit,
  now = new Date()
): EnVocabTeacherVisibleLimit {
  return {
    ...visible,
    quiz_target_adjusted_at: beijingDateTimeString(now),
  };
}

export function materializeEnVocabTeacherVisible(
  draft: EnVocabTeacherVisibleLimit,
  words: EnVocabWord[],
  dailyOrder?: Pick<EnVocabDailyDisplayOrder, "ids"> | number[] | null,
  now = new Date()
): EnVocabTeacherVisibleLimit {
  const today = beijingDateString(now);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(draft.quiz_target)),
    Math.max(1, words.length || EN_VOCAB_DAILY_QUIZ_TOP)
  );
  const orderIds = Array.isArray(dailyOrder)
    ? dailyOrder
    : dailyOrder?.ids ?? null;
  const visible_ids = pickEnVocabVisibleIds(words, quiz_target, orderIds);
  return {
    date: today,
    limit: quiz_target,
    count: quiz_target,
    quiz_target,
    released_today: true,
    release_count: visible_ids.length,
    visible_ids,
    quiz_target_adjusted_at: draft.quiz_target_adjusted_at,
  };
}

export function isEnVocabWordInTeacherVisiblePool(
  wordId: number,
  visible: Pick<EnVocabTeacherVisibleLimit, "quiz_target" | "visible_ids">,
  dailySeqByWordId: ReadonlyMap<number, number>
): boolean {
  if (visible.visible_ids?.length) {
    return visible.visible_ids.includes(wordId);
  }
  const seq = dailySeqByWordId.get(wordId);
  if (!seq || seq <= 0) return false;
  const target = Math.max(0, Math.floor(visible.quiz_target));
  return target > 0 && seq <= target;
}
