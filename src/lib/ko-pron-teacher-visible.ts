import { beijingDateString, beijingDateTimeString } from "@/lib/jp-vocab-daily-check";
import {
  buildKoPronDailySeqMap,
  computeKoPronDailyDisplayOrder,
  type KoPronDailyDisplayOrder,
} from "@/lib/ko-pron-daily-order";
import type { KoPronLetter } from "@/lib/types";

export { buildKoPronDailySeqMap };

/** 每日建议优先抽查的前 N 个字母 */
export const KO_PRON_DAILY_QUIZ_TOP = 10;

/** 老师默认今日抽查数量 */
export const KO_PRON_TEACHER_VISIBLE_DEFAULT = KO_PRON_DAILY_QUIZ_TOP;

export type KoPronTeacherVisibleLimit = {
  date: string;
  limit: number;
  count: number;
  quiz_target: number;
  released_today: boolean;
  release_count: number;
  visible_ids?: number[];
  quiz_target_adjusted_at?: string;
  /** 可见池按熟悉程度加权日序生成；缺省/旧值会触发重算 */
  order_algo?: string;
};

/** 与日语 final_score 日序对齐的可见池算法版本 */
export const KO_PRON_VISIBLE_ORDER_ALGO = "priority_v1";

export function defaultKoPronTeacherVisibleLimit(
  now = new Date()
): KoPronTeacherVisibleLimit {
  const target = KO_PRON_TEACHER_VISIBLE_DEFAULT;
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

export function normalizeKoPronTeacherVisibleLimit(
  raw: unknown,
  now = new Date()
): KoPronTeacherVisibleLimit {
  const fallback = defaultKoPronTeacherVisibleLimit(now);
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const today = beijingDateString(now);
  const date = typeof obj.date === "string" && obj.date ? obj.date : today;
  const quiz_target = Math.min(
    Math.max(1, Math.floor(Number(obj.quiz_target) || fallback.quiz_target)),
    40
  );
  const visible_ids = Array.isArray(obj.visible_ids)
    ? obj.visible_ids.map((id) => Number(id)).filter((id) => id > 0)
    : undefined;
  return {
    date,
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
    order_algo:
      typeof obj.order_algo === "string" && obj.order_algo.trim()
        ? obj.order_algo.trim()
        : undefined,
  };
}

/**
 * 按**日序**取前 N 个作为今日可见池（与日语一致：日序来自熟悉程度加权优先级，不是 id）。
 * `dailyOrderIds` 缺省时现算 `computeKoPronDailyDisplayOrder`。
 */
export function pickKoPronVisibleIds(
  letters: KoPronLetter[],
  quizTarget: number,
  dailyOrderIds?: number[] | null,
  now = new Date()
): number[] {
  const n = Math.min(Math.max(1, Math.floor(quizTarget)), letters.length || 40);
  if (!letters.length) return [];
  const byId = new Map(letters.map((l) => [l.id, l]));
  const orderedIds = (
    dailyOrderIds?.length && dailyOrderIds.length > 0
      ? dailyOrderIds.filter((id) => byId.has(id))
      : computeKoPronDailyDisplayOrder(letters, now)
  ).slice();
  const seen = new Set(orderedIds);
  for (const letter of letters) {
    if (!seen.has(letter.id)) orderedIds.push(letter.id);
  }
  return orderedIds.slice(0, n);
}

export function isKoPronLetterInTeacherVisiblePool(
  letterId: number,
  visible: Pick<KoPronTeacherVisibleLimit, "quiz_target" | "visible_ids">,
  letters: KoPronLetter[],
  dailyOrderIds?: number[] | null
): boolean {
  if (visible.visible_ids?.length) {
    return visible.visible_ids.includes(letterId);
  }
  const ids = pickKoPronVisibleIds(
    letters,
    visible.quiz_target,
    dailyOrderIds
  );
  return ids.includes(letterId);
}

export function listKoPronTeacherQuizPoolLetters(
  letters: KoPronLetter[],
  visible: Pick<KoPronTeacherVisibleLimit, "quiz_target" | "visible_ids">,
  dailyOrderIds?: number[] | null
): KoPronLetter[] {
  const byId = new Map(letters.map((l) => [l.id, l]));
  if (visible.visible_ids?.length) {
    return visible.visible_ids
      .map((id) => byId.get(id))
      .filter((l): l is KoPronLetter => l != null);
  }
  const ids = pickKoPronVisibleIds(letters, visible.quiz_target, dailyOrderIds);
  return ids
    .map((id) => byId.get(id))
    .filter((l): l is KoPronLetter => l != null);
}

export function withKoPronTargetAdjustmentMarker(
  visible: KoPronTeacherVisibleLimit,
  now = new Date()
): KoPronTeacherVisibleLimit {
  return {
    ...visible,
    quiz_target_adjusted_at: beijingDateTimeString(now),
  };
}

export function materializeKoPronTeacherVisible(
  draft: KoPronTeacherVisibleLimit,
  letters: KoPronLetter[],
  dailyOrder?: Pick<KoPronDailyDisplayOrder, "ids"> | number[] | null,
  now = new Date()
): KoPronTeacherVisibleLimit {
  const today = beijingDateString(now);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(draft.quiz_target)),
    Math.max(1, letters.length || 40)
  );
  const orderIds = Array.isArray(dailyOrder)
    ? dailyOrder
    : dailyOrder?.ids ?? null;
  const visible_ids = pickKoPronVisibleIds(
    letters,
    quiz_target,
    orderIds,
    now
  );
  return {
    date: today,
    limit: quiz_target,
    count: quiz_target,
    quiz_target,
    released_today: true,
    release_count: visible_ids.length,
    visible_ids,
    quiz_target_adjusted_at: draft.quiz_target_adjusted_at,
    order_algo: KO_PRON_VISIBLE_ORDER_ALGO,
  };
}
