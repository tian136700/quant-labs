import "server-only";

import type {
  EnLessonTeacherReviewRecord,
  EnLessonTeacherReviewSortField,
  EnLessonTeacherReviewSummary,
} from "./types";

const SORT_COLUMNS: Record<EnLessonTeacherReviewSortField, string> = {
  class_date: "class_date",
  score: "score",
  updated_at: "updated_at",
};

let devStoreEnabled = false;
const devRecords: EnLessonTeacherReviewRecord[] = [];
let devNextId = 1;

export function enableEnLessonTeacherReviewDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeClassDate(raw: string): string | null {
  const s = (raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function mapRow(row: Record<string, unknown>): EnLessonTeacherReviewRecord {
  return {
    id: Number(row.id),
    teacher_id: Number(row.teacher_id),
    class_date: String(row.class_date),
    score: Number(row.score),
    remark: row.remark != null ? String(row.remark) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const REVIEW_SELECT = `SELECT id, teacher_id, class_date, score, remark, created_at, updated_at FROM en_lesson_teacher_review`;

export type SaveEnLessonTeacherReviewInput = {
  id?: number;
  teacher_id: number;
  class_date: string;
  score: number;
  remark?: string | null;
};

export type SaveEnLessonTeacherReviewResult =
  | { ok: true; record: EnLessonTeacherReviewRecord }
  | { ok: false; error: string };

export async function saveEnLessonTeacherReview(
  db: D1Database,
  input: SaveEnLessonTeacherReviewInput
): Promise<SaveEnLessonTeacherReviewResult> {
  const teacherId = Number(input.teacher_id);
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return { ok: false, error: "teacher_id_invalid" };
  }

  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { ok: false, error: "score_invalid" };
  }

  const classDate = normalizeClassDate(input.class_date);
  if (!classDate) {
    return { ok: false, error: "class_date_invalid" };
  }

  const remark = (input.remark || "").trim() || null;
  const id = input.id && input.id > 0 ? input.id : 0;

  if (devStoreEnabled) {
    const ts = nowIso();
    if (id > 0) {
      const idx = devRecords.findIndex((r) => r.id === id);
      if (idx < 0) return { ok: false, error: "not_found" };
      if (devRecords[idx].teacher_id !== teacherId) {
        return { ok: false, error: "teacher_mismatch" };
      }
      const updated: EnLessonTeacherReviewRecord = {
        ...devRecords[idx],
        class_date: classDate,
        score,
        remark,
        updated_at: ts,
      };
      devRecords[idx] = updated;
      return { ok: true, record: updated };
    }
    const created: EnLessonTeacherReviewRecord = {
      id: devNextId++,
      teacher_id: teacherId,
      class_date: classDate,
      score,
      remark,
      created_at: ts,
      updated_at: ts,
    };
    devRecords.unshift(created);
    return { ok: true, record: created };
  }

  const ts = nowIso();
  if (id > 0) {
    const result = await db
      .prepare(
        `UPDATE en_lesson_teacher_review
         SET class_date = ?1, score = ?2, remark = ?3, updated_at = ?4
         WHERE id = ?5 AND teacher_id = ?6`
      )
      .bind(classDate, score, remark, ts, id, teacherId)
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }
  } else {
    await db
      .prepare(
        `INSERT INTO en_lesson_teacher_review (teacher_id, class_date, score, remark, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(teacherId, classDate, score, remark, ts, ts)
      .run();
  }

  const savedId =
    id > 0
      ? id
      : (
          await db
            .prepare(`SELECT last_insert_rowid() AS id`)
            .first<{ id: number }>()
        )?.id;

  if (!savedId) {
    return { ok: false, error: "save_failed" };
  }

  const record = await getEnLessonTeacherReviewById(db, savedId);
  if (!record) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, record };
}

export async function listEnLessonTeacherReviews(
  db: D1Database,
  teacherId: number,
  sortField: EnLessonTeacherReviewSortField = "updated_at",
  sortOrder: "asc" | "desc" = "desc",
  limit = 500
): Promise<EnLessonTeacherReviewRecord[]> {
  if (!Number.isInteger(teacherId) || teacherId <= 0) return [];

  const col = SORT_COLUMNS[sortField] ?? "updated_at";
  const order = sortOrder === "asc" ? "ASC" : "DESC";
  const safeLimit = Math.min(Math.max(1, limit), 2000);

  if (devStoreEnabled) {
    const filtered = devRecords.filter((r) => r.teacher_id === teacherId);
    const sorted = [...filtered].sort((a, b) => {
      const av = a[col as keyof EnLessonTeacherReviewRecord];
      const bv = b[col as keyof EnLessonTeacherReviewRecord];
      if (av === bv) return sortOrder === "asc" ? a.id - b.id : b.id - a.id;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortOrder === "asc"
        ? av < bv
          ? -1
          : 1
        : av > bv
          ? -1
          : 1;
    });
    return sorted.slice(0, safeLimit);
  }

  const { results } = await db
    .prepare(
      `${REVIEW_SELECT}
       WHERE teacher_id = ?1
       ORDER BY ${col} ${order}, id ${order}
       LIMIT ?2`
    )
    .bind(teacherId, safeLimit)
    .all<Record<string, unknown>>();

  return (results ?? []).map(mapRow);
}

export async function getEnLessonTeacherReviewById(
  db: D1Database,
  recordId: number
): Promise<EnLessonTeacherReviewRecord | null> {
  if (devStoreEnabled) {
    return devRecords.find((r) => r.id === recordId) ?? null;
  }

  const row = await db
    .prepare(`${REVIEW_SELECT} WHERE id = ?1 LIMIT 1`)
    .bind(recordId)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}

export async function deleteEnLessonTeacherReviewRecords(
  db: D1Database,
  recordIds: number[]
): Promise<{ deleted: number }> {
  const ids = recordIds.filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { deleted: 0 };

  if (devStoreEnabled) {
    const idSet = new Set(ids);
    const before = devRecords.length;
    for (let i = devRecords.length - 1; i >= 0; i--) {
      if (idSet.has(devRecords[i].id)) {
        devRecords.splice(i, 1);
      }
    }
    return { deleted: before - devRecords.length };
  }

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(`DELETE FROM en_lesson_teacher_review WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  return { deleted: Number.isFinite(deleted) ? deleted : 0 };
}

function pickLatestRemarkReview(
  current: EnLessonTeacherReviewRecord | null,
  candidate: EnLessonTeacherReviewRecord
): EnLessonTeacherReviewRecord | null {
  const candidateRemark = candidate.remark?.trim();
  if (!candidateRemark) return current;

  if (!current?.remark?.trim()) return candidate;
  if (candidate.updated_at > current.updated_at) return candidate;
  if (candidate.updated_at < current.updated_at) return current;
  return candidate.id > current.id ? candidate : current;
}

export async function listEnLessonTeacherReviewSummaries(
  db: D1Database
): Promise<EnLessonTeacherReviewSummary[]> {
  if (devStoreEnabled) {
    const map = new Map<
      number,
      { total: number; count: number; latestRemark: EnLessonTeacherReviewRecord | null }
    >();
    for (const r of devRecords) {
      const current = map.get(r.teacher_id) ?? { total: 0, count: 0, latestRemark: null };
      current.total += r.score;
      current.count += 1;
      current.latestRemark = pickLatestRemarkReview(current.latestRemark, r);
      map.set(r.teacher_id, current);
    }
    return [...map.entries()].map(([teacher_id, { total, count, latestRemark }]) => ({
      teacher_id,
      review_count: count,
      avg_score: count > 0 ? Math.round((total / count) * 10) / 10 : null,
      latest_remark: latestRemark?.remark?.trim() ? latestRemark.remark.trim() : null,
      latest_class_date: latestRemark?.class_date ?? null,
    }));
  }

  const { results } = await db
    .prepare(
      `SELECT teacher_id,
              COUNT(*) AS review_count,
              ROUND(AVG(score), 1) AS avg_score,
              (
                SELECT remark FROM en_lesson_teacher_review r2
                WHERE r2.teacher_id = r.teacher_id
                  AND r2.remark IS NOT NULL AND TRIM(r2.remark) != ''
                ORDER BY r2.updated_at DESC, r2.id DESC
                LIMIT 1
              ) AS latest_remark,
              (
                SELECT class_date FROM en_lesson_teacher_review r2
                WHERE r2.teacher_id = r.teacher_id
                  AND r2.remark IS NOT NULL AND TRIM(r2.remark) != ''
                ORDER BY r2.updated_at DESC, r2.id DESC
                LIMIT 1
              ) AS latest_class_date
       FROM en_lesson_teacher_review r
       GROUP BY teacher_id`
    )
    .all<{
      teacher_id: number;
      review_count: number;
      avg_score: number | null;
      latest_remark: string | null;
      latest_class_date: string | null;
    }>();

  return (results ?? []).map((row) => {
    const remark =
      row.latest_remark != null && String(row.latest_remark).trim()
        ? String(row.latest_remark).trim()
        : null;
    return {
      teacher_id: Number(row.teacher_id),
      review_count: Number(row.review_count) || 0,
      avg_score:
        row.avg_score != null && Number.isFinite(Number(row.avg_score))
          ? Number(row.avg_score)
          : null,
      latest_remark: remark,
      latest_class_date:
        row.latest_class_date != null ? String(row.latest_class_date) : null,
    };
  });
}
