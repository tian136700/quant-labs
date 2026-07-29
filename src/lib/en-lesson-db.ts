import "server-only";

import type { EnLessonKind, EnLessonRecord, EnLessonUploadInput } from "@/lib/types";
import { parseLessonContent, normalizeLessonContentForStorage, compareEnLessonsByProgress, type EnLessonProgressStatus, enLessonProgressToFields, normalizeClassDurationMinutes } from "@/lib/en-lesson-shared";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import { normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";
import {
  removeEnVocabLessonWords,
  syncLessonNotesToVocab,
  upsertEnVocabFromLesson,
} from "@/lib/en-vocab-db";
import { getLessonTeacherIdsByLessonIds, replaceLessonTeachers } from "@/lib/en-lesson-teacher-db";
import {
  getClassSchedulesByLessonIds,
  replaceLessonClassSchedules,
} from "@/lib/en-lesson-class-schedule-db";
import type { EnLessonClassScheduleInput } from "@/lib/types";

const SEED_LESSONS: EnLessonUploadInput[] = [
  {
    kind: "grammar",
    content: "～ばかり, ～ようになる, ～に来る",
    ref_key: "lesson02-grammar",
  },
];

let devStoreEnabled = false;
const devLessons: EnLessonRecord[] = [];
let devNextId = 1;
let devSeeded = false;
let enLessonLinkCopyCountColumnReady = false;
let enLessonCategoryColumnReady = false;

async function ensureEnLessonLinkCopyCountColumn(db: D1Database): Promise<void> {
  if (devStoreEnabled || enLessonLinkCopyCountColumnReady) return;
  try {
    await db
      .prepare(`ALTER TABLE en_lesson ADD COLUMN link_copy_count INTEGER NOT NULL DEFAULT 0`)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(msg)) {
      /* column may already exist under other errors; still mark ready */
    }
  }
  enLessonLinkCopyCountColumnReady = true;
}

/** 分类标签；旧库缺列时幂等补上，空值回填默认「雅思托福」 */
async function ensureEnLessonCategoryColumn(db: D1Database): Promise<void> {
  if (devStoreEnabled || enLessonCategoryColumnReady) return;
  try {
    await db
      .prepare(
        `ALTER TABLE en_lesson ADD COLUMN category TEXT NOT NULL DEFAULT '雅思托福'`
      )
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(msg)) {
      /* column may already exist */
    }
  }
  try {
    await db
      .prepare(
        `UPDATE en_lesson
         SET category = '雅思托福'
         WHERE category IS NULL OR TRIM(category) = ''`
      )
      .run();
  } catch {
    /* ignore */
  }
  enLessonCategoryColumnReady = true;
}

async function ensureEnLessonSchemaColumns(db: D1Database): Promise<void> {
  await ensureEnLessonLinkCopyCountColumn(db);
  await ensureEnLessonCategoryColumn(db);
}

export function enableEnLessonDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeKind(raw?: EnLessonKind | null): EnLessonKind {
  return raw === "grammar" ? "grammar" : "word";
}

function mapRow(row: Record<string, unknown>): EnLessonRecord {
  const nextClassAt =
    row.next_class_at != null && String(row.next_class_at).trim()
      ? String(row.next_class_at).trim()
      : null;
  const classDurationMinutes = normalizeClassDurationMinutes(
    row.class_duration_minutes != null ? Number(row.class_duration_minutes) : null
  );

  return {
    id: Number(row.id),
    kind: row.kind === "grammar" ? "grammar" : "word",
    content: String(row.content),
    meanings: null,
    example_sentences: null,
    category: normalizeEnVocabCategory(
      row.category != null ? String(row.category) : null
    ),
    title: row.title != null ? String(row.title) : null,
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    completed: Number(row.completed) === 1,
    learning: Number(row.learning) === 1,
    status_updated_at:
      row.status_updated_at != null ? String(row.status_updated_at) : null,
    status_updated_by:
      row.status_updated_by != null ? String(row.status_updated_by) : null,
    teacher_ids: [],
    teacher_other:
      row.teacher_other != null && String(row.teacher_other).trim()
        ? String(row.teacher_other).trim()
        : null,
    class_schedules: [],
    next_class_at: nextClassAt,
    class_duration_minutes: classDurationMinutes,
    link_copy_count: Number(row.link_copy_count) || 0,
    uploaded_at: String(row.uploaded_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function attachTeacherIds(
  db: D1Database,
  lessons: EnLessonRecord[]
): Promise<EnLessonRecord[]> {
  if (!lessons.length) return lessons;
  const linkMap = await getLessonTeacherIdsByLessonIds(
    db,
    lessons.map((l) => l.id)
  );
  const scheduleMap = await getClassSchedulesByLessonIds(
    db,
    lessons.map((l) => l.id)
  );
  return lessons.map((lesson) => {
    const schedules = scheduleMap.get(lesson.id) ?? [];
    const legacySchedules =
      schedules.length > 0
        ? schedules
        : lesson.next_class_at
          ? [
              {
                id: 0,
                class_at: lesson.next_class_at,
                duration_minutes: lesson.class_duration_minutes,
              },
            ]
          : [];
    const first = legacySchedules[0];
    return {
      ...lesson,
      teacher_ids: linkMap.get(lesson.id) ?? [],
      class_schedules: legacySchedules,
      next_class_at: first?.class_at ?? null,
      class_duration_minutes: first?.duration_minutes ?? null,
    };
  });
}

const LESSON_SELECT = `SELECT id, kind, content, category, title, ref_key, completed, learning,
  status_updated_at, status_updated_by, teacher_other, next_class_at, class_duration_minutes, link_copy_count, uploaded_at, created_at, updated_at FROM en_lesson`;

async function seedIfEmpty(_db: D1Database): Promise<void> {
  if (!devStoreEnabled) return;

  if (devSeeded || devLessons.length > 0) return;
  const ts = nowIso();
  for (const item of SEED_LESSONS) {
    devLessons.push({
      id: devNextId++,
      kind: normalizeKind(item.kind),
      content: item.content.trim(),
      meanings: null,
      example_sentences: null,
      category: normalizeEnVocabCategory(item.category),
      title: (item.title || "").trim() || null,
      ref_key: item.ref_key ? normalizeEnVocabRefKey(item.ref_key) || null : null,
      completed: false,
      learning: false,
      status_updated_at: null,
      status_updated_by: null,
      teacher_ids: [],
      teacher_other: null,
      class_schedules: [],
      next_class_at: null,
      class_duration_minutes: null,
      link_copy_count: 0,
      uploaded_at: ts,
      created_at: ts,
      updated_at: ts,
    });
  }
  devSeeded = true;
}

async function refKeyExists(db: D1Database, refKey: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM en_vocab_ref WHERE ref_key = ?1 LIMIT 1")
    .bind(refKey)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

function lessonContentMatchesNormalized(
  storedContent: string,
  normalizedContent: string
): boolean {
  return normalizeLessonContentForStorage(storedContent) === normalizedContent;
}

async function enLessonContentExists(
  db: D1Database,
  kind: EnLessonKind,
  normalizedContent: string
): Promise<boolean> {
  if (devStoreEnabled) {
    return devLessons.some(
      (lesson) =>
        lesson.kind === kind &&
        lessonContentMatchesNormalized(lesson.content, normalizedContent)
    );
  }

  const exact = await db
    .prepare("SELECT 1 AS ok FROM en_lesson WHERE kind = ?1 AND content = ?2 LIMIT 1")
    .bind(kind, normalizedContent)
    .first<{ ok: number }>();
  if (exact?.ok) return true;

  const result = await db
    .prepare("SELECT content FROM en_lesson WHERE kind = ?1")
    .bind(kind)
    .all<{ content: string }>();

  return (result.results ?? []).some((row) =>
    lessonContentMatchesNormalized(String(row.content), normalizedContent)
  );
}

export async function listEnLessons(db: D1Database): Promise<EnLessonRecord[]> {
  await seedIfEmpty(db);
  await ensureEnLessonSchemaColumns(db);

  if (devStoreEnabled) {
    return attachTeacherIds(db, [...devLessons].sort(compareEnLessonsByProgress));
  }

  const result = await db
    .prepare(
      `${LESSON_SELECT}
       ORDER BY
         CASE
           WHEN completed = 1 THEN 2
           WHEN learning = 1 THEN 0
           ELSE 1
         END ASC,
         COALESCE(status_updated_at, uploaded_at) DESC,
         id DESC`
    )
    .all<Record<string, unknown>>();

  return attachTeacherIds(db, (result.results || []).map(mapRow));
}

export async function getEnLessonById(
  db: D1Database,
  lessonId: number
): Promise<EnLessonRecord | null> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return null;

  await seedIfEmpty(db);
  await ensureEnLessonSchemaColumns(db);

  if (devStoreEnabled) {
    const lesson = devLessons.find((l) => l.id === lessonId) ?? null;
    if (!lesson) return null;
    const [withTeachers] = await attachTeacherIds(db, [lesson]);
    return withTeachers;
  }

  const row = await db
    .prepare(`${LESSON_SELECT} WHERE id = ?1`)
    .bind(lessonId)
    .first<Record<string, unknown>>();

  if (!row) return null;
  const [lesson] = await attachTeacherIds(db, [mapRow(row)]);
  return lesson;
}

export async function getEnLessonByRefKey(
  db: D1Database,
  refKey: string
): Promise<EnLessonRecord | null> {
  const key = normalizeEnVocabRefKey(refKey);
  if (!key) return null;

  await seedIfEmpty(db);
  await ensureEnLessonSchemaColumns(db);

  if (devStoreEnabled) {
    const lesson = devLessons.find((l) => l.ref_key === key) ?? null;
    if (!lesson) return null;
    const [withTeachers] = await attachTeacherIds(db, [lesson]);
    return withTeachers;
  }

  const row = await db
    .prepare(`${LESSON_SELECT} WHERE ref_key = ?1 LIMIT 1`)
    .bind(key)
    .first<Record<string, unknown>>();

  if (!row) return null;
  const [lesson] = await attachTeacherIds(db, [mapRow(row)]);
  return lesson;
}

export async function updateEnLessonRefKey(
  db: D1Database,
  lessonId: number,
  refKey: string
): Promise<EnLessonRecord | null> {
  const key = normalizeEnVocabRefKey(refKey);
  if (!key || !Number.isInteger(lessonId) || lessonId <= 0) return null;

  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return null;
    devLessons[idx] = {
      ...devLessons[idx],
      ref_key: key,
      updated_at: ts,
    };
    return devLessons[idx];
  }

  const result = await db
    .prepare(
      `UPDATE en_lesson SET ref_key = ?1, updated_at = ?2 WHERE id = ?3`
    )
    .bind(key, ts, lessonId)
    .run();

  if (!result.meta?.changes) return null;

  return getEnLessonById(db, lessonId);
}

async function syncLessonToVocab(
  db: D1Database,
  lesson: EnLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;

  const refKey = lesson.ref_key;
  const refs = refKey
    ? [
        {
          ref_key: refKey,
          title: lesson.title,
          media_type: "image" as const,
        },
      ]
    : [];

  await upsertEnVocabFromLesson(
    db,
    items.map((word) => ({
      word,
      kind: lesson.kind,
      ref_key: refKey,
      category: lesson.category,
    })),
    refs
  );
  await syncLessonNotesToVocab(db, lesson);
}

async function unsyncLessonFromVocab(
  db: D1Database,
  lesson: EnLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;
  await removeEnVocabLessonWords(db, items, lesson.ref_key, lesson.kind);
}

export type CreateEnLessonResult =
  | { ok: true; lesson: EnLessonRecord }
  | { ok: false; error: string };

export async function createEnLesson(
  db: D1Database,
  input: EnLessonUploadInput
): Promise<CreateEnLessonResult> {
  const content = (input.content || "").trim();
  const items = parseLessonContent(content);
  if (!items.length) {
    return { ok: false, error: "content_empty" };
  }

  const kind = normalizeKind(input.kind);
  const storedContent = normalizeLessonContentForStorage(content);

  if (await enLessonContentExists(db, kind, storedContent)) {
    return { ok: false, error: "content_duplicate" };
  }
  const title = (input.title || "").trim() || null;
  const category = normalizeEnVocabCategory(input.category);
  const refKey = input.ref_key
    ? normalizeEnVocabRefKey(input.ref_key) || null
    : null;
  const ts = nowIso();

  if (devStoreEnabled) {
    await seedIfEmpty(db);
    const lesson: EnLessonRecord = {
      id: devNextId++,
      kind,
      content: storedContent,
      meanings: null,
      example_sentences: null,
      category,
      title,
      ref_key: refKey,
      completed: false,
      learning: false,
      status_updated_at: null,
      status_updated_by: null,
      teacher_ids: [],
      teacher_other: null,
      class_schedules: [],
      next_class_at: null,
      class_duration_minutes: null,
      link_copy_count: 0,
      uploaded_at: ts,
      created_at: ts,
      updated_at: ts,
    };
    devLessons.unshift(lesson);
    return { ok: true, lesson };
  }

  if (refKey && !(await refKeyExists(db, refKey))) {
    return { ok: false, error: "ref_key_not_found" };
  }

  await ensureEnLessonSchemaColumns(db);

  const result = await db
    .prepare(
      `INSERT INTO en_lesson (kind, content, category, title, ref_key, completed, learning, uploaded_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6, ?6)`
    )
    .bind(kind, storedContent, category, title, refKey, ts)
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };

  const row = await db
    .prepare(`${LESSON_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "insert_failed" };
  return { ok: true, lesson: mapRow(row) };
}

export async function syncLessonNotesToVocabIfCompleted(
  db: D1Database,
  lessonId: number
): Promise<void> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return;
  const lessons = await listEnLessons(db);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson?.completed) return;
  await syncLessonNotesToVocab(db, lesson);
}

export type UpdateEnLessonProgressResult =
  | { ok: true; lesson: EnLessonRecord }
  | { ok: false; error: string; message?: string };

export async function updateEnLessonProgress(
  db: D1Database,
  lessonId: number,
  progressStatus: EnLessonProgressStatus,
  operatorUsername: string
): Promise<UpdateEnLessonProgressResult> {
  const operator = operatorUsername.trim();
  if (!operator) {
    return { ok: false, error: "operator_invalid" };
  }
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const { completed, learning } = enLessonProgressToFields(progressStatus);

  await seedIfEmpty(db);
  await ensureEnLessonSchemaColumns(db);

  let before: EnLessonRecord | undefined;
  if (devStoreEnabled) {
    before = devLessons.find((l) => l.id === lessonId);
  } else {
    const prevRow = await db
      .prepare(`${LESSON_SELECT} WHERE id = ?1`)
      .bind(lessonId)
      .first<Record<string, unknown>>();
    before = prevRow ? mapRow(prevRow) : undefined;
  }
  if (!before) return { ok: false, error: "not_found" };

  const ts = nowIso();
  const completedFlag = completed ? 1 : 0;
  const learningFlag = learning ? 1 : 0;

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    devLessons[idx] = {
      ...devLessons[idx],
      completed,
      learning,
      status_updated_at: ts,
      status_updated_by: operator,
      updated_at: ts,
    };
    const lesson = devLessons[idx];
    if (completed && !before.completed) {
      await syncLessonToVocab(db, lesson);
    } else if (!completed && before.completed) {
      await unsyncLessonFromVocab(db, before);
    }
    return { ok: true, lesson };
  }

  const result = await db
    .prepare(
      `UPDATE en_lesson SET completed = ?1, learning = ?2, status_updated_at = ?3, status_updated_by = ?4, updated_at = ?3 WHERE id = ?5`
    )
    .bind(completedFlag, learningFlag, ts, operator, lessonId)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const lesson = await getEnLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };

  if (completed && !before.completed) {
    await syncLessonToVocab(db, lesson);
  } else if (!completed && before.completed) {
    await unsyncLessonFromVocab(db, before);
  }

  return { ok: true, lesson };
}

/** @deprecated 使用 updateEnLessonProgress */
export async function updateEnLessonCompleted(
  db: D1Database,
  lessonId: number,
  completed: boolean,
  operatorUsername: string
): Promise<UpdateEnLessonProgressResult> {
  return updateEnLessonProgress(
    db,
    lessonId,
    completed ? "completed" : "pending",
    operatorUsername
  );
}

export type UpdateEnLessonTeacherResult =
  | { ok: true; lesson: EnLessonRecord }
  | { ok: false; error: string };

export async function updateEnLessonTeacherAssignment(
  db: D1Database,
  lessonId: number,
  teacherIds: number[],
  teacherOther?: string | null
): Promise<UpdateEnLessonTeacherResult> {
  await seedIfEmpty(db);

  const existing = await getEnLessonById(db, lessonId);
  if (!existing) return { ok: false, error: "not_found" };

  const linkResult = await replaceLessonTeachers(db, lessonId, teacherIds);
  if (!linkResult.ok) return linkResult;

  const normalizedOther =
    teacherOther === undefined
      ? existing.teacher_other
      : teacherOther?.trim() || null;
  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    devLessons[idx] = {
      ...devLessons[idx],
      teacher_ids: linkResult.teacher_ids,
      teacher_other: normalizedOther,
      updated_at: ts,
    };
    return { ok: true, lesson: devLessons[idx] };
  }

  await db
    .prepare(`UPDATE en_lesson SET teacher_other = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(normalizedOther, ts, lessonId)
    .run();

  const lesson = await getEnLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}

export type UpdateEnLessonClassSchedulesResult =
  | { ok: true; lesson: EnLessonRecord }
  | { ok: false; error: string };

export async function updateEnLessonClassSchedules(
  db: D1Database,
  lessonId: number,
  schedules: EnLessonClassScheduleInput[]
): Promise<UpdateEnLessonClassSchedulesResult> {
  await seedIfEmpty(db);

  const existing = await getEnLessonById(db, lessonId);
  if (!existing) return { ok: false, error: "not_found" };

  const replaceResult = await replaceLessonClassSchedules(db, lessonId, schedules);
  if (!replaceResult.ok) return replaceResult;

  const first = replaceResult.schedules[0];
  const nextClassAt = first?.class_at ?? null;
  const durationValue = first?.duration_minutes ?? null;
  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    devLessons[idx] = {
      ...devLessons[idx],
      class_schedules: replaceResult.schedules,
      next_class_at: nextClassAt,
      class_duration_minutes: durationValue,
      updated_at: ts,
    };
    return { ok: true, lesson: devLessons[idx] };
  }

  await db
    .prepare(
      `UPDATE en_lesson SET next_class_at = ?1, class_duration_minutes = ?2, updated_at = ?3 WHERE id = ?4`
    )
    .bind(nextClassAt, durationValue, ts, lessonId)
    .run();

  const lesson = await getEnLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}

/** @deprecated 使用 updateEnLessonClassSchedules */
export async function updateEnLessonNextClassAt(
  db: D1Database,
  lessonId: number,
  nextClassAt: string | null,
  classDurationMinutes?: number | null
): Promise<UpdateEnLessonClassSchedulesResult> {
  if (nextClassAt == null || !nextClassAt.trim()) {
    return updateEnLessonClassSchedules(db, lessonId, []);
  }
  return updateEnLessonClassSchedules(db, lessonId, [
    {
      class_at: nextClassAt,
      duration_minutes:
        classDurationMinutes === undefined ? null : classDurationMinutes,
    },
  ]);
}

export type DeleteEnLessonResult = { ok: true } | { ok: false; error: string };

export async function deleteEnLesson(
  db: D1Database,
  lessonId: number
): Promise<DeleteEnLessonResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const lesson = await getEnLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };

  if (lesson.completed) {
    await unsyncLessonFromVocab(db, lesson);
  }

  const refKey = lesson.ref_key;

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devLessons.splice(idx, 1);
    return { ok: true };
  }

  await db
    .prepare("DELETE FROM en_lesson_note WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();
  await db
    .prepare("DELETE FROM en_lesson_teacher_link WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();
  await db
    .prepare("DELETE FROM en_lesson_class_schedule WHERE lesson_id = ?1")
    .bind(lessonId)
    .run();

  const result = await db
    .prepare("DELETE FROM en_lesson WHERE id = ?1")
    .bind(lessonId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  if (refKey) {
    const other = await db
      .prepare("SELECT 1 AS ok FROM en_lesson WHERE ref_key = ?1 LIMIT 1")
      .bind(refKey)
      .first<{ ok: number }>();
    if (!other?.ok) {
      await db
        .prepare("DELETE FROM en_vocab_ref WHERE ref_key = ?1")
        .bind(refKey)
        .run();
    }
  }

  return { ok: true };
}

/** 教案 ref 更新标题时，同步关联的新课记录 */
export async function syncEnLessonTitleByRefKey(
  db: D1Database,
  refKey: string,
  title: string | null
): Promise<void> {
  const key = normalizeEnVocabRefKey(refKey);
  if (!key) return;

  const ts = nowIso();
  const trimmedTitle = title?.trim() || null;

  if (devStoreEnabled) {
    for (let i = 0; i < devLessons.length; i++) {
      if (devLessons[i].ref_key === key) {
        devLessons[i] = {
          ...devLessons[i],
          title: trimmedTitle,
          updated_at: ts,
        };
      }
    }
    return;
  }

  await db
    .prepare(
      `UPDATE en_lesson SET title = ?1, updated_at = ?2 WHERE ref_key = ?3`
    )
    .bind(trimmedTitle, ts, key)
    .run();
}

export type IncrementEnLessonLinkCopyCountResult =
  | { ok: true; link_copy_count: number }
  | { ok: false; error: string };

/** 任意复制模式（带模板 / 仅链接 / 仅文字）成功后均 +1 */
export async function incrementEnLessonLinkCopyCount(
  db: D1Database,
  lessonId: number
): Promise<IncrementEnLessonLinkCopyCountResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  await seedIfEmpty(db);

  if (devStoreEnabled) {
    const idx = devLessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return { ok: false, error: "not_found" };
    const next = (devLessons[idx].link_copy_count ?? 0) + 1;
    devLessons[idx] = { ...devLessons[idx], link_copy_count: next };
    return { ok: true, link_copy_count: next };
  }

  await ensureEnLessonSchemaColumns(db);

  const ts = nowIso();
  const result = await db
    .prepare(
      `UPDATE en_lesson
       SET link_copy_count = COALESCE(link_copy_count, 0) + 1, updated_at = ?2
       WHERE id = ?1`
    )
    .bind(lessonId, ts)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`SELECT link_copy_count FROM en_lesson WHERE id = ?1`)
    .bind(lessonId)
    .first<{ link_copy_count: number | null }>();

  return { ok: true, link_copy_count: Number(row?.link_copy_count) || 0 };
}
