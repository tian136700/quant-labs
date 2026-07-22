import { beijingDateString, beijingDateTimeString } from "@/lib/jp-vocab-daily-check";
import type { KoPronLetter } from "@/lib/types";

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
};

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
  };
}

/** 按 id 升序取前 N 个作为今日可见池（固定 40 字母） */
export function pickKoPronVisibleIds(
  letters: KoPronLetter[],
  quizTarget: number
): number[] {
  const n = Math.min(Math.max(1, Math.floor(quizTarget)), letters.length || 40);
  return [...letters]
    .sort((a, b) => a.id - b.id)
    .slice(0, n)
    .map((l) => l.id);
}

export function isKoPronLetterInTeacherVisiblePool(
  letterId: number,
  visible: Pick<KoPronTeacherVisibleLimit, "quiz_target" | "visible_ids">,
  lettersSortedById: KoPronLetter[]
): boolean {
  if (visible.visible_ids?.length) {
    return visible.visible_ids.includes(letterId);
  }
  const ids = pickKoPronVisibleIds(lettersSortedById, visible.quiz_target);
  return ids.includes(letterId);
}

export function listKoPronTeacherQuizPoolLetters(
  letters: KoPronLetter[],
  visible: Pick<KoPronTeacherVisibleLimit, "quiz_target" | "visible_ids">
): KoPronLetter[] {
  const sorted = [...letters].sort((a, b) => a.id - b.id);
  if (visible.visible_ids?.length) {
    const idSet = new Set(visible.visible_ids);
    const order = new Map(visible.visible_ids.map((id, i) => [id, i]));
    return sorted
      .filter((l) => idSet.has(l.id))
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }
  const ids = new Set(pickKoPronVisibleIds(sorted, visible.quiz_target));
  return sorted.filter((l) => ids.has(l.id));
}

export function buildKoPronDailySeqMap(
  letters: KoPronLetter[]
): Map<number, number> {
  const sorted = [...letters].sort((a, b) => a.id - b.id);
  const map = new Map<number, number>();
  sorted.forEach((l, i) => map.set(l.id, i + 1));
  return map;
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
  now = new Date()
): KoPronTeacherVisibleLimit {
  const today = beijingDateString(now);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(draft.quiz_target)),
    Math.max(1, letters.length || 40)
  );
  const visible_ids = pickKoPronVisibleIds(letters, quiz_target);
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
