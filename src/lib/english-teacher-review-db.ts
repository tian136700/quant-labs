import type {
  EnglishTeacherReviewRecord,
  EnglishTeacherReviewSortField,
} from "./types";

const SORT_COLUMNS: Record<EnglishTeacherReviewSortField, string> = {
  teacher_name: "teacher_name",
  class_date: "class_date",
  score: "score",
  updated_at: "updated_at",
};

/** 本地 next dev 无 D1 时的内存存储 */
let devStoreEnabled = false;
const devRecords: EnglishTeacherReviewRecord[] = [];
let devNextId = 1;

export function enableEnglishTeacherReviewDevStore() {
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

export type SaveEnglishTeacherReviewInput = {
  id?: number;
  teacher_name: string;
  class_date: string;
  score: number;
  remark?: string | null;
};

export type SaveEnglishTeacherReviewResult =
  | { ok: true; record: EnglishTeacherReviewRecord }
  | { ok: false; error: string };

export async function saveEnglishTeacherReview(
  db: D1Database,
  input: SaveEnglishTeacherReviewInput
): Promise<SaveEnglishTeacherReviewResult> {
  const teacherName = (input.teacher_name || "").trim();
  if (!teacherName) {
    return { ok: false, error: "teacher_name_required" };
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
      const updated: EnglishTeacherReviewRecord = {
        ...devRecords[idx],
        teacher_name: teacherName,
        class_date: classDate,
        score,
        remark,
        updated_at: ts,
      };
      devRecords[idx] = updated;
      return { ok: true, record: updated };
    }
    const created: EnglishTeacherReviewRecord = {
      id: devNextId++,
      teacher_name: teacherName,
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
        `UPDATE english_teacher_review
         SET teacher_name = ?1, class_date = ?2, score = ?3, remark = ?4, updated_at = ?5
         WHERE id = ?6`
      )
      .bind(teacherName, classDate, score, remark, ts, id)
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }
  } else {
    await db
      .prepare(
        `INSERT INTO english_teacher_review (teacher_name, class_date, score, remark, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(teacherName, classDate, score, remark, ts, ts)
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

  const record = await getEnglishTeacherReviewById(db, savedId);
  if (!record) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true, record };
}

export async function listEnglishTeacherReviewHistory(
  db: D1Database,
  sortField: EnglishTeacherReviewSortField = "updated_at",
  sortOrder: "asc" | "desc" = "desc",
  limit = 2000
): Promise<EnglishTeacherReviewRecord[]> {
  const col = SORT_COLUMNS[sortField] ?? "updated_at";
  const order = sortOrder === "asc" ? "ASC" : "DESC";
  const safeLimit = Math.min(Math.max(1, limit), 5000);

  if (devStoreEnabled) {
    const sorted = [...devRecords].sort((a, b) => {
      const av = a[col as keyof EnglishTeacherReviewRecord];
      const bv = b[col as keyof EnglishTeacherReviewRecord];
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
      `SELECT id, teacher_name, class_date, score, remark, created_at, updated_at
       FROM english_teacher_review
       ORDER BY ${col} ${order}, id ${order}
       LIMIT ?1`
    )
    .bind(safeLimit)
    .all<EnglishTeacherReviewRecord>();

  return results ?? [];
}

export async function getEnglishTeacherReviewById(
  db: D1Database,
  recordId: number
): Promise<EnglishTeacherReviewRecord | null> {
  if (devStoreEnabled) {
    return devRecords.find((r) => r.id === recordId) ?? null;
  }

  return (
    (await db
      .prepare(
        `SELECT id, teacher_name, class_date, score, remark, created_at, updated_at
         FROM english_teacher_review WHERE id = ?1 LIMIT 1`
      )
      .bind(recordId)
      .first<EnglishTeacherReviewRecord>()) ?? null
  );
}

export async function deleteEnglishTeacherReviewRecords(
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
    .prepare(`DELETE FROM english_teacher_review WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  return { deleted: Number.isFinite(deleted) ? deleted : 0 };
}
