import "server-only";

import type { KoPronLetter } from "@/lib/types";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  defaultKoPronTeacherVisibleLimit,
  KO_PRON_VISIBLE_ORDER_ALGO,
  materializeKoPronTeacherVisible,
  normalizeKoPronTeacherVisibleLimit,
  withKoPronTargetAdjustmentMarker,
  type KoPronTeacherVisibleLimit,
} from "@/lib/ko-pron-teacher-visible";
import {
  computeKoPronDailyDisplayOrder,
  mergeKoPronDailyDisplayOrder,
  normalizeKoPronDailyDisplayOrder,
  type KoPronDailyDisplayOrder,
} from "@/lib/ko-pron-daily-order";
import {
  TEACHER_VISIBLE_LIMIT_KEY,
  DAILY_DISPLAY_ORDER_KEY,
} from "./state";
import { getSettingRaw, setSettingRaw } from "./helpers";
import { listKoPronLetters } from "./letters";

export async function getKoPronTeacherVisibleLimit(
  db: D1Database
): Promise<KoPronTeacherVisibleLimit> {
  const raw = await getSettingRaw(db, TEACHER_VISIBLE_LIMIT_KEY);
  if (!raw) return defaultKoPronTeacherVisibleLimit();
  try {
    return normalizeKoPronTeacherVisibleLimit(JSON.parse(raw));
  } catch {
    return defaultKoPronTeacherVisibleLimit();
  }
}

export async function saveKoPronTeacherVisibleLimit(
  db: D1Database,
  visible: KoPronTeacherVisibleLimit
): Promise<KoPronTeacherVisibleLimit> {
  await setSettingRaw(db, TEACHER_VISIBLE_LIMIT_KEY, JSON.stringify(visible));
  return visible;
}

async function readKoPronDailyDisplayOrderRaw(
  db: D1Database
): Promise<KoPronDailyDisplayOrder | null> {
  const raw = await getSettingRaw(db, DAILY_DISPLAY_ORDER_KEY);
  if (!raw) return null;
  try {
    return normalizeKoPronDailyDisplayOrder(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveKoPronDailyDisplayOrder(
  db: D1Database,
  order: KoPronDailyDisplayOrder
): Promise<void> {
  await setSettingRaw(db, DAILY_DISPLAY_ORDER_KEY, JSON.stringify(order));
}

/**
 * 当日已有日序则沿用（合并增删）；跨日按日语同一套熟悉程度加权优先级重排。
 */
export async function ensureKoPronDailyDisplayOrder(
  db: D1Database,
  letters: KoPronLetter[],
  now = new Date()
): Promise<KoPronDailyDisplayOrder> {
  const today = beijingDateString(now);
  if (!letters.length) {
    const empty = { date: today, ids: [] as number[] };
    await saveKoPronDailyDisplayOrder(db, empty);
    return empty;
  }
  const stored = await readKoPronDailyDisplayOrderRaw(db);
  if (stored?.date === today && stored.ids.length > 0) {
    const merged = mergeKoPronDailyDisplayOrder(stored.ids, letters);
    const order = { date: today, ids: merged };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i])
    ) {
      await saveKoPronDailyDisplayOrder(db, order);
    }
    return order;
  }
  const order = {
    date: today,
    ids: computeKoPronDailyDisplayOrder(letters, now),
  };
  await saveKoPronDailyDisplayOrder(db, order);
  return order;
}

export async function ensureKoPronTeacherVisibleLimit(
  db: D1Database,
  ctx?: { letters?: KoPronLetter[]; display_order?: KoPronDailyDisplayOrder }
): Promise<KoPronTeacherVisibleLimit> {
  const letters = ctx?.letters ?? (await listKoPronLetters(db));
  const display_order =
    ctx?.display_order ?? (await ensureKoPronDailyDisplayOrder(db, letters));
  const current = await getKoPronTeacherVisibleLimit(db);
  const today = beijingDateString();
  if (!letters.length) {
    const empty: KoPronTeacherVisibleLimit = {
      ...current,
      date: today,
      quiz_target: current.quiz_target || 10,
      released_today: false,
      visible_ids: [],
      release_count: 0,
      order_algo: KO_PRON_VISIBLE_ORDER_ALGO,
    };
    return saveKoPronTeacherVisibleLimit(db, empty);
  }
  if (
    current.date === today &&
    current.visible_ids?.length &&
    current.released_today &&
    current.order_algo === KO_PRON_VISIBLE_ORDER_ALGO
  ) {
    return current;
  }
  const materialized = materializeKoPronTeacherVisible(
    {
      ...current,
      date: today,
      quiz_target: current.quiz_target || 10,
    },
    letters,
    display_order
  );
  return saveKoPronTeacherVisibleLimit(db, materialized);
}

export async function setKoPronDailyQuizTarget(
  db: D1Database,
  targetCount: number
): Promise<KoPronTeacherVisibleLimit> {
  const letters = await listKoPronLetters(db);
  if (!letters.length) {
    throw new Error("empty_quiz_pool");
  }
  const display_order = await ensureKoPronDailyDisplayOrder(db, letters);
  const current = await getKoPronTeacherVisibleLimit(db);
  const quiz_target = Math.min(
    Math.max(1, Math.floor(targetCount)),
    Math.max(1, letters.length)
  );
  const draft: KoPronTeacherVisibleLimit = {
    ...current,
    quiz_target,
  };
  const materialized = withKoPronTargetAdjustmentMarker(
    materializeKoPronTeacherVisible(draft, letters, display_order)
  );
  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }
  return saveKoPronTeacherVisibleLimit(db, materialized);
}
