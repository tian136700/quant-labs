import "server-only";

import { beijingDateString } from "@/lib/jp-vocab-daily-check";

/**
 * 北京日是否在统一日程上有课（日语/英语排课 + 手动日程）。
 * 供轮询降频：凌晨静默时若今日有课则仍用日间频率。
 */
export async function beijingDateHasAnyScheduleClass(
  db: D1Database,
  dateStr = beijingDateString()
): Promise<boolean> {
  const date = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const prefix = `${date}%`;

  const row = await db
    .prepare(
      `SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM jp_lesson_class_schedule WHERE class_at LIKE ?1 LIMIT 1
         )
         OR EXISTS (
           SELECT 1 FROM en_lesson_class_schedule WHERE class_at LIKE ?1 LIMIT 1
         )
         OR EXISTS (
           SELECT 1 FROM jp_lesson_manual_schedule WHERE class_at LIKE ?1 LIMIT 1
         )
         THEN 1 ELSE 0
       END AS has_class`
    )
    .bind(prefix)
    .first<{ has_class: number }>();

  return Number(row?.has_class) === 1;
}
