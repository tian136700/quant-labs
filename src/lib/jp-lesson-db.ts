import "server-only";

import type { JpLessonKind, JpLessonRecord, JpLessonUploadInput } from "@/lib/types";
import { parseLessonContent, type JpLessonProgressStatus, jpLessonProgressToFields } from "@/lib/jp-lesson-shared";
import { normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import {
  removeJpVocabLessonWords,
  syncLessonNotesToVocab,
  upsertJpVocabFromLesson,
} from "@/lib/jp-vocab-db";

const SEED_LESSONS: JpLessonUploadInput[] = [
  {
    kind: "grammar",
    content: "～ばかり, ～ようになる, ～に来る",
    ref_key: "lesson02-grammar",
  },
];

let devStoreEnabled = false;
const devLessons: JpLessonRecord[] = [];
let devNextId = 1;
let devSeeded = false;

export function enableJpLessonDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeKind(raw?: JpLessonKind | null): JpLessonKind {
  return raw === "grammar" ? "grammar" : "word";
}

function mapRow(row: Record<string, unknown>): JpLessonRecord {
  return {
    id: Number(row.id),
    kind: row.kind === "grammar" ? "grammar" : "word",
    content: String(row.content),
    title: row.title != null ? String(row.title) : null,
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    completed: Number(row.completed) === 1,
    learning: Number(row.learning) === 1,
    status_updated_at:
      row.status_updated_at != null ? String(row.status_updated_at) : null,
    status_updated_by:
      row.status_updated_by != null ? String(row.status_updated_by) : null,
    uploaded_at: String(row.uploaded_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const LESSON_SELECT = `SELECT id, kind, content, title, ref_key, completed, learning,
  status_updated_at, status_updated_by, uploaded_at, created_at, updated_at FROM jp_lesson`;

async function seedIfEmpty(_db: D1Database): Promise<void> {
  if (!devStoreEnabled) return;

  if (devSeeded || devLessons.length > 0) return;
  const ts = nowIso();
  for (const item of SEED_LESSONS) {
    devLessons.push({
      id: devNextId++,
      kind: normalizeKind(item.kind),
      content: item.content.trim(),
      title: (item.title || "").trim() || null,
      ref_key: item.ref_key ? normalizeJpVocabRefKey(item.ref_key) || null : null,
      completed: false,
      learning: false,
      status_updated_at: null,
      status_updated_by: null,
      uploaded_at: ts,
      created_at: ts,
      updated_at: ts,
    });
  }
  devSeeded = true;
}

async function refKeyExists(db: D1Database, refKey: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM jp_vocab_ref WHERE ref_key = ?1 LIMIT 1")
    .bind(refKey)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function listJpLessons(db: D1Database): Promise<JpLessonRecord[]> {
  await seedIfEmpty(db);

  if (devStoreEnabled) {
    return [...devLessons].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dateCmp = b.uploaded_at.localeCompare(a.uploaded_at);
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    });
  }

  const result = await db
    .prepare(
      `${LESSON_SELECT}
       ORDER BY completed ASC, uploaded_at DESC, id DESC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function getJpLessonById(
  db: D1Database,
  lessonId: number
): Promise<JpLessonRecord | null> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return null;

  await seedIfEmpty(db);

  if (devStoreEnabled) {
    return devLessons.find((l) => l.id === lessonId) ?? null;
  }

  const row = await db
    .prepare(`${LESSON_SELECT} WHERE id = ?1`)
    .bind(lessonId)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}

export async function updateJpLessonRefKey(
  db: D1Database,
  lessonId: number,
  refKey: string
): Promise<JpLessonRecord | null> {
  const key = normalizeJpVocabRefKey(refKey);
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
      `UPDATE jp_lesson SET ref_key = ?1, updated_at = ?2 WHERE id = ?3`
    )
    .bind(key, ts, lessonId)
    .run();

  if (!result.meta?.changes) return null;

  return getJpLessonById(db, lessonId);
}

async function syncLessonToVocab(
  db: D1Database,
  lesson: JpLessonRecord
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

  await upsertJpVocabFromLesson(
    db,
    items.map((word) => ({
      word,
      kind: lesson.kind,
      ref_key: refKey,
    })),
    refs
  );
  await syncLessonNotesToVocab(db, lesson);
}

async function unsyncLessonFromVocab(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;
  await removeJpVocabLessonWords(db, items, lesson.ref_key, lesson.kind);
}

export type CreateJpLessonResult =
  | { ok: true; lesson: JpLessonRecord }
  | { ok: false; error: string };

export async function createJpLesson(
  db: D1Database,
  input: JpLessonUploadInput
): Promise<CreateJpLessonResult> {
  const content = (input.content || "").trim();
  const items = parseLessonContent(content);
  if (!items.length) {
    return { ok: false, error: "content_empty" };
  }

  const kind = normalizeKind(input.kind);
  const title = (input.title || "").trim() || null;
  const refKey = input.ref_key
    ? normalizeJpVocabRefKey(input.ref_key) || null
    : null;
  const ts = nowIso();

  if (devStoreEnabled) {
    await seedIfEmpty(db);
    const lesson: JpLessonRecord = {
      id: devNextId++,
      kind,
      content: items.join(", "),
      title,
      ref_key: refKey,
      completed: false,
      learning: false,
      status_updated_at: null,
      status_updated_by: null,
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

  const result = await db
    .prepare(
      `INSERT INTO jp_lesson (kind, content, title, ref_key, completed, learning, uploaded_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?5, ?5)`
    )
    .bind(kind, items.join(", "), title, refKey, ts)
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
  const lessons = await listJpLessons(db);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson?.completed) return;
  await syncLessonNotesToVocab(db, lesson);
}

export type UpdateJpLessonProgressResult =
  | { ok: true; lesson: JpLessonRecord }
  | { ok: false; error: string };

export async function updateJpLessonProgress(
  db: D1Database,
  lessonId: number,
  progressStatus: JpLessonProgressStatus,
  operatorUsername: string
): Promise<UpdateJpLessonProgressResult> {
  const operator = operatorUsername.trim();
  if (!operator) {
    return { ok: false, error: "operator_invalid" };
  }
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const { completed, learning } = jpLessonProgressToFields(progressStatus);

  await seedIfEmpty(db);

  let before: JpLessonRecord | undefined;
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
      `UPDATE jp_lesson SET completed = ?1, learning = ?2, status_updated_at = ?3, status_updated_by = ?4, updated_at = ?3 WHERE id = ?5`
    )
    .bind(completedFlag, learningFlag, ts, operator, lessonId)
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`${LESSON_SELECT} WHERE id = ?1`)
    .bind(lessonId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  const lesson = mapRow(row);

  if (completed && !before.completed) {
    await syncLessonToVocab(db, lesson);
  } else if (!completed && before.completed) {
    await unsyncLessonFromVocab(db, before);
  }

  return { ok: true, lesson };
}

/** @deprecated 使用 updateJpLessonProgress */
export async function updateJpLessonCompleted(
  db: D1Database,
  lessonId: number,
  completed: boolean,
  operatorUsername: string
): Promise<UpdateJpLessonProgressResult> {
  return updateJpLessonProgress(
    db,
    lessonId,
    completed ? "completed" : "pending",
    operatorUsername
  );
}

/** 教案 ref 更新标题时，同步关联的新课记录 */
export async function syncJpLessonTitleByRefKey(
  db: D1Database,
  refKey: string,
  title: string | null
): Promise<void> {
  const key = normalizeJpVocabRefKey(refKey);
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
      `UPDATE jp_lesson SET title = ?1, updated_at = ?2 WHERE ref_key = ?3`
    )
    .bind(trimmedTitle, ts, key)
    .run();
}
