import "server-only";

import { beijingTodayDateString } from "@/lib/jp-lesson-shared";
import type {
  JpLessonManualSchedule,
  JpLessonManualScheduleDraft,
} from "@/lib/jp-lesson-manual-schedule";
import {
  createJpLessonManualSchedule,
  deleteJpLessonManualSchedule,
  deleteJpLessonManualScheduleFutureByRecurringId,
  ensureJpLessonManualScheduleSchema,
  findActiveDuplicateManualScheduleRecurringRule,
  getJpLessonManualScheduleById,
  insertJpLessonManualScheduleInstance,
  listJpLessonManualScheduleClassAtsByRecurringId,
  listJpLessonManualScheduleRecurringRules,
  listJpLessonManualSchedules,
  normalizeJpLessonManualScheduleDraft,
  setJpLessonManualScheduleRecurringActive,
  updateJpLessonManualSchedule,
  updateJpLessonManualScheduleRecurringRule,
  insertJpLessonManualScheduleRecurringRule,
  type JpLessonManualScheduleRecurringRuleRow,
} from "@/lib/jp-lesson-manual-schedule-db";
import {
  expandRecurringClassAts,
  MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS,
  parseClassAtDateAndTime,
  beijingWeekdayFromDateString,
  type JpLessonManualScheduleRecurringMeta,
  type ManualScheduleWeekday,
} from "@/lib/jp-lesson-manual-schedule-recurring";
import { normalizeManualScheduleLinkedLessons } from "@/lib/jp-lesson-manual-schedule-linked";

function ruleToMeta(
  rule: JpLessonManualScheduleRecurringRuleRow
): JpLessonManualScheduleRecurringMeta {
  return {
    id: rule.id,
    weekday: rule.weekday as ManualScheduleWeekday,
    time_hm: rule.time_hm,
    active: rule.active === 1,
  };
}

export function attachRecurringMetaToSchedules(
  schedules: JpLessonManualSchedule[],
  rules: JpLessonManualScheduleRecurringRuleRow[]
): JpLessonManualSchedule[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  return schedules.map((s) => {
    if (s.recurring_id == null) {
      return { ...s, recurring: null };
    }
    const rule = byId.get(s.recurring_id);
    return {
      ...s,
      recurring: rule ? ruleToMeta(rule) : null,
    };
  });
}

export async function listJpLessonManualSchedulesWithRecurring(
  db: D1Database
): Promise<JpLessonManualSchedule[]> {
  const { listJpLessonManualSchedules } = await import(
    "@/lib/jp-lesson-manual-schedule-db"
  );
  const [schedules, rules] = await Promise.all([
    listJpLessonManualSchedules(db),
    listJpLessonManualScheduleRecurringRules(db),
  ]);
  return attachRecurringMetaToSchedules(schedules, rules);
}

export type CreateRecurringManualScheduleResult =
  | {
      ok: true;
      schedule: JpLessonManualSchedule;
      created_count: number;
      recurring_id: number;
      deduped?: boolean;
    }
  | { ok: false; error: string };

export async function createRecurringJpLessonManualSchedule(
  db: D1Database,
  draft: JpLessonManualScheduleDraft
): Promise<CreateRecurringManualScheduleResult> {
  const normalized = normalizeJpLessonManualScheduleDraft(draft);
  if (!normalized) return { ok: false, error: "draft_invalid" };

  const parts = parseClassAtDateAndTime(normalized.class_at);
  if (!parts) return { ok: false, error: "draft_invalid" };
  const weekday = beijingWeekdayFromDateString(parts.dateYmd);
  if (weekday == null) return { ok: false, error: "draft_invalid" };

  const classAts = expandRecurringClassAts({
    weekday,
    timeHm: parts.timeHm,
    fromDateYmd: parts.dateYmd,
    weeks: MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS,
  });
  if (!classAts.length) return { ok: false, error: "recurring_expand_empty" };

  await ensureJpLessonManualScheduleSchema(db);

  const existingRule = await findActiveDuplicateManualScheduleRecurringRule(db, {
    weekday,
    time_hm: parts.timeHm,
    title: normalized.title,
    teacher: normalized.teacher,
    duration_minutes: normalized.duration_minutes,
  });
  if (existingRule) {
    const all = await listJpLessonManualSchedules(db);
    const series = all
      .filter((s) => s.recurring_id === existingRule.id)
      .sort((a, b) => a.class_at.localeCompare(b.class_at));
    const today = beijingTodayDateString();
    const upcoming =
      series.find((s) => s.class_at.slice(0, 10) >= today) ?? series[0] ?? null;
    if (upcoming) {
      return {
        ok: true,
        schedule: { ...upcoming, recurring: ruleToMeta(existingRule) },
        created_count: 0,
        recurring_id: existingRule.id,
        deduped: true,
      };
    }
  }

  const ruleResult = await insertJpLessonManualScheduleRecurringRule(db, {
    weekday,
    time_hm: parts.timeHm,
    duration_minutes: normalized.duration_minutes,
    title: normalized.title,
    teacher: normalized.teacher,
    note: normalized.note,
    linked_lessons: normalizeManualScheduleLinkedLessons(
      normalized.linked_lessons
    ),
  });
  if (!ruleResult.ok) return { ok: false, error: ruleResult.error };

  const recurringId = ruleResult.rule.id;
  let first: JpLessonManualSchedule | null = null;
  let createdCount = 0;

  for (const classAt of classAts) {
    const inserted = await insertJpLessonManualScheduleInstance(db, {
      ...normalized,
      class_at: classAt,
      recurring_id: recurringId,
    });
    if (!inserted.ok) {
      return { ok: false, error: inserted.error };
    }
    createdCount += 1;
    if (!first) first = inserted.schedule;
  }

  if (!first) return { ok: false, error: "insert_failed" };

  return {
    ok: true,
    schedule: {
      ...first,
      recurring: ruleToMeta(ruleResult.rule),
    },
    created_count: createdCount,
    recurring_id: recurringId,
  };
}

export type UpdateRecurringSeriesResult =
  | {
      ok: true;
      schedule: JpLessonManualSchedule;
      rewritten_count: number;
      recurring_id: number;
    }
  | { ok: false; error: string };

export async function updateRecurringJpLessonManualSeries(
  db: D1Database,
  instanceId: number,
  draft: JpLessonManualScheduleDraft
): Promise<UpdateRecurringSeriesResult> {
  const existing = await getJpLessonManualScheduleById(db, instanceId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.recurring_id == null) {
    return { ok: false, error: "not_recurring" };
  }

  const normalized = normalizeJpLessonManualScheduleDraft(draft);
  if (!normalized) return { ok: false, error: "draft_invalid" };

  const parts = parseClassAtDateAndTime(normalized.class_at);
  if (!parts) return { ok: false, error: "draft_invalid" };
  const weekday = beijingWeekdayFromDateString(parts.dateYmd);
  if (weekday == null) return { ok: false, error: "draft_invalid" };

  const today = beijingTodayDateString();
  const classAts = expandRecurringClassAts({
    weekday,
    timeHm: parts.timeHm,
    fromDateYmd: today,
    weeks: MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS,
  });
  if (!classAts.length) return { ok: false, error: "recurring_expand_empty" };

  const linked = normalizeManualScheduleLinkedLessons(normalized.linked_lessons);
  const ruleUpdate = await updateJpLessonManualScheduleRecurringRule(
    db,
    existing.recurring_id,
    {
      weekday,
      time_hm: parts.timeHm,
      duration_minutes: normalized.duration_minutes,
      title: normalized.title,
      teacher: normalized.teacher,
      note: normalized.note,
      linked_lessons: linked,
      active: 1,
    }
  );
  if (!ruleUpdate.ok) return { ok: false, error: ruleUpdate.error };

  await deleteJpLessonManualScheduleFutureByRecurringId(
    db,
    existing.recurring_id,
    `${today} 00:00:00`
  );

  let representative: JpLessonManualSchedule | null = null;
  let rewritten = 0;
  for (const classAt of classAts) {
    const inserted = await insertJpLessonManualScheduleInstance(db, {
      ...normalized,
      class_at: classAt,
      linked_lessons: linked,
      recurring_id: existing.recurring_id,
    });
    if (!inserted.ok) return { ok: false, error: inserted.error };
    rewritten += 1;
    if (!representative) representative = inserted.schedule;
  }

  if (!representative) return { ok: false, error: "insert_failed" };

  return {
    ok: true,
    schedule: {
      ...representative,
      recurring: ruleToMeta(ruleUpdate.rule),
    },
    rewritten_count: rewritten,
    recurring_id: existing.recurring_id,
  };
}

export type CancelRecurringSeriesResult =
  | { ok: true; recurring_id: number; deleted_future: number }
  | { ok: false; error: string };

export async function cancelRecurringJpLessonManualSeries(
  db: D1Database,
  instanceId: number
): Promise<CancelRecurringSeriesResult> {
  const existing = await getJpLessonManualScheduleById(db, instanceId);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.recurring_id == null) {
    return { ok: false, error: "not_recurring" };
  }

  const today = beijingTodayDateString();
  const deleted = await deleteJpLessonManualScheduleFutureByRecurringId(
    db,
    existing.recurring_id,
    `${today} 00:00:00`
  );
  await setJpLessonManualScheduleRecurringActive(
    db,
    existing.recurring_id,
    false
  );

  return {
    ok: true,
    recurring_id: existing.recurring_id,
    deleted_future: deleted,
  };
}

export type ExpandRecurringResult = {
  ok: true;
  rules: number;
  inserted: number;
};

/** Cron：每条 active 规则补齐「今天起约 12 周」缺的实例 */
export async function expandActiveJpLessonManualRecurring(
  db: D1Database
): Promise<ExpandRecurringResult> {
  await ensureJpLessonManualScheduleSchema(db);
  const rules = await listJpLessonManualScheduleRecurringRules(db, {
    activeOnly: true,
  });
  const today = beijingTodayDateString();
  let inserted = 0;

  for (const rule of rules) {
    const desired = expandRecurringClassAts({
      weekday: rule.weekday,
      timeHm: rule.time_hm,
      fromDateYmd: today,
      weeks: MANUAL_SCHEDULE_RECURRING_HORIZON_WEEKS,
    });
    if (!desired.length) continue;

    const existing = new Set(
      await listJpLessonManualScheduleClassAtsByRecurringId(db, rule.id)
    );
    const linked = normalizeManualScheduleLinkedLessons(rule.linked_lessons);

    for (const classAt of desired) {
      if (existing.has(classAt)) continue;
      const result = await insertJpLessonManualScheduleInstance(db, {
        class_at: classAt,
        duration_minutes: rule.duration_minutes,
        title: rule.title,
        teacher: rule.teacher,
        note: rule.note,
        linked_lessons: linked,
        recurring_id: rule.id,
      });
      if (result.ok) {
        inserted += 1;
        existing.add(classAt);
      }
    }
  }

  return { ok: true, rules: rules.length, inserted };
}

/** 关联教材同步用：系列中「今天起最近一堂」；非系列返回自身 */
export async function pickManualScheduleForLinkedLessonSync(
  db: D1Database,
  schedule: JpLessonManualSchedule
): Promise<JpLessonManualSchedule> {
  if (schedule.recurring_id == null) return schedule;
  const today = beijingTodayDateString();
  const classAts = await listJpLessonManualScheduleClassAtsByRecurringId(
    db,
    schedule.recurring_id
  );
  const future = classAts
    .filter((c) => c.slice(0, 10) >= today)
    .sort((a, b) => a.localeCompare(b));
  const targetAt = future[0] || schedule.class_at;
  if (targetAt === schedule.class_at) return schedule;

  const { listJpLessonManualSchedules } = await import(
    "@/lib/jp-lesson-manual-schedule-db"
  );
  const all = await listJpLessonManualSchedules(db);
  const hit = all.find(
    (s) => s.recurring_id === schedule.recurring_id && s.class_at === targetAt
  );
  return hit || schedule;
}

/** 新建入口：recurring=true → 系列；否则单条 */
export async function createJpLessonManualScheduleMaybeRecurring(
  db: D1Database,
  draft: JpLessonManualScheduleDraft
): Promise<
  | CreateRecurringManualScheduleResult
  | {
      ok: true;
      schedule: JpLessonManualSchedule;
      created_count: 0 | 1;
      deduped?: boolean;
    }
  | { ok: false; error: string }
> {
  if (draft.recurring === true) {
    return createRecurringJpLessonManualSchedule(db, draft);
  }
  const result = await createJpLessonManualSchedule(db, draft);
  if (!result.ok) return result;
  return {
    ok: true,
    schedule: result.schedule,
    created_count: result.deduped ? 0 : 1,
    deduped: result.deduped === true,
  };
}

/** 更新入口：实例带 recurring_id → 整系列；否则单条 */
export async function updateJpLessonManualScheduleMaybeRecurring(
  db: D1Database,
  id: number,
  draft: JpLessonManualScheduleDraft
): Promise<
  | UpdateRecurringSeriesResult
  | { ok: true; schedule: JpLessonManualSchedule }
  | { ok: false; error: string }
> {
  const existing = await getJpLessonManualScheduleById(db, id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.recurring_id != null) {
    return updateRecurringJpLessonManualSeries(db, id, draft);
  }
  return updateJpLessonManualSchedule(db, id, draft);
}

/** 删除入口：系列 → 取消未来；否则删单条 */
export async function deleteJpLessonManualScheduleMaybeRecurring(
  db: D1Database,
  id: number
): Promise<
  | CancelRecurringSeriesResult
  | { ok: true }
  | { ok: false; error: string }
> {
  const existing = await getJpLessonManualScheduleById(db, id);
  if (!existing) return { ok: false, error: "not_found" };
  if (existing.recurring_id != null) {
    return cancelRecurringJpLessonManualSeries(db, id);
  }
  return deleteJpLessonManualSchedule(db, id);
}
