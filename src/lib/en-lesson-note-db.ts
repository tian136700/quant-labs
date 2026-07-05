import "server-only";

import { parseLessonContent } from "@/lib/en-lesson-shared";
import { listEnLessons } from "@/lib/en-lesson-db";
import type { EnLessonNote } from "@/lib/types";

let devStoreEnabled = false;
const devNotes: EnLessonNote[] = [];
let devNextId = 1;

export function enableEnLessonNoteDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row: Record<string, unknown>): EnLessonNote {
  return {
    id: Number(row.id),
    lesson_id: Number(row.lesson_id),
    item_word: String(row.item_word),
    body: String(row.body),
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const NOTE_SELECT = `SELECT id, lesson_id, item_word, body, created_by, created_at, updated_at FROM en_lesson_note`;

async function lessonItemWords(
  db: D1Database,
  lessonId: number
): Promise<string[] | null> {
  const lessons = await listEnLessons(db);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  return parseLessonContent(lesson.content);
}

function isValidItemWord(itemWord: string, allowed: string[]): boolean {
  return allowed.some((w) => w === itemWord);
}

export async function listEnLessonNotes(db: D1Database): Promise<EnLessonNote[]> {
  if (devStoreEnabled) {
    return [...devNotes].sort((a, b) => {
      const lessonCmp = a.lesson_id - b.lesson_id;
      if (lessonCmp !== 0) return lessonCmp;
      return b.created_at.localeCompare(a.created_at);
    });
  }

  const result = await db
    .prepare(`${NOTE_SELECT} ORDER BY lesson_id ASC, created_at DESC, id DESC`)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function listEnLessonNotesByLessonId(
  db: D1Database,
  lessonId: number
): Promise<EnLessonNote[]> {
  const all = await listEnLessonNotes(db);
  return all.filter((n) => n.lesson_id === lessonId);
}

export type CreateEnLessonNoteResult =
  | { ok: true; note: EnLessonNote }
  | { ok: false; error: string };

export async function createEnLessonNote(
  db: D1Database,
  lessonId: number,
  itemWord: string,
  body: string,
  operatorUsername: string
): Promise<CreateEnLessonNoteResult> {
  const operator = operatorUsername.trim();
  if (!operator) return { ok: false, error: "operator_invalid" };

  const trimmedBody = body.trim();
  if (!trimmedBody) return { ok: false, error: "body_empty" };

  const trimmedItem = itemWord.trim();
  if (!trimmedItem) return { ok: false, error: "item_word_empty" };

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const allowed = await lessonItemWords(db, lessonId);
  if (!allowed) return { ok: false, error: "lesson_not_found" };
  if (!isValidItemWord(trimmedItem, allowed)) {
    return { ok: false, error: "item_word_invalid" };
  }

  const ts = nowIso();

  if (devStoreEnabled) {
    const note: EnLessonNote = {
      id: devNextId++,
      lesson_id: lessonId,
      item_word: trimmedItem,
      body: trimmedBody,
      created_by: operator,
      created_at: ts,
      updated_at: ts,
    };
    devNotes.unshift(note);
    return { ok: true, note };
  }

  const result = await db
    .prepare(
      `INSERT INTO en_lesson_note (lesson_id, item_word, body, created_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
    )
    .bind(lessonId, trimmedItem, trimmedBody, operator, ts)
    .run();

  const id = Number(result.meta?.last_row_id);
  if (!id) return { ok: false, error: "insert_failed" };

  const row = await db
    .prepare(`${NOTE_SELECT} WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "insert_failed" };
  return { ok: true, note: mapRow(row) };
}

export type UpdateEnLessonNoteResult =
  | { ok: true; note: EnLessonNote }
  | { ok: false; error: string };

export async function updateEnLessonNote(
  db: D1Database,
  noteId: number,
  body: string
): Promise<UpdateEnLessonNoteResult> {
  const trimmedBody = body.trim();
  if (!trimmedBody) return { ok: false, error: "body_empty" };

  if (!Number.isInteger(noteId) || noteId <= 0) {
    return { ok: false, error: "note_id_invalid" };
  }

  const ts = nowIso();

  if (devStoreEnabled) {
    const idx = devNotes.findIndex((n) => n.id === noteId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devNotes[idx] = {
      ...devNotes[idx],
      body: trimmedBody,
      updated_at: ts,
    };
    return { ok: true, note: devNotes[idx] };
  }

  const result = await db
    .prepare(
      "UPDATE en_lesson_note SET body = ?1, updated_at = ?2 WHERE id = ?3"
    )
    .bind(trimmedBody, ts, noteId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };

  const row = await db
    .prepare(`${NOTE_SELECT} WHERE id = ?1`)
    .bind(noteId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, note: mapRow(row) };
}

export type DeleteEnLessonNoteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteEnLessonNote(
  db: D1Database,
  noteId: number
): Promise<DeleteEnLessonNoteResult> {
  if (!Number.isInteger(noteId) || noteId <= 0) {
    return { ok: false, error: "note_id_invalid" };
  }

  if (devStoreEnabled) {
    const idx = devNotes.findIndex((n) => n.id === noteId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devNotes.splice(idx, 1);
    return { ok: true };
  }

  const result = await db
    .prepare("DELETE FROM en_lesson_note WHERE id = ?1")
    .bind(noteId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}

/** 用一条笔记替换某课某单词下的全部课堂笔记（空则清空） */
export async function replaceLessonNotesForItem(
  db: D1Database,
  lessonId: number,
  itemWord: string,
  body: string | null,
  operatorUsername: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedItem = itemWord.trim();
  if (!trimmedItem) return { ok: false, error: "item_word_empty" };

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const allowed = await lessonItemWords(db, lessonId);
  if (!allowed) return { ok: false, error: "lesson_not_found" };
  if (!isValidItemWord(trimmedItem, allowed)) {
    return { ok: false, error: "item_word_invalid" };
  }

  const trimmedBody = (body || "").trim();

  if (devStoreEnabled) {
    for (let i = devNotes.length - 1; i >= 0; i--) {
      if (
        devNotes[i].lesson_id === lessonId &&
        devNotes[i].item_word === trimmedItem
      ) {
        devNotes.splice(i, 1);
      }
    }
    if (trimmedBody) {
      const ts = nowIso();
      devNotes.unshift({
        id: devNextId++,
        lesson_id: lessonId,
        item_word: trimmedItem,
        body: trimmedBody,
        created_by: operatorUsername.trim() || null,
        created_at: ts,
        updated_at: ts,
      });
    }
    return { ok: true };
  }

  await db
    .prepare(
      "DELETE FROM en_lesson_note WHERE lesson_id = ?1 AND item_word = ?2"
    )
    .bind(lessonId, trimmedItem)
    .run();

  if (trimmedBody) {
    const result = await createEnLessonNote(
      db,
      lessonId,
      trimmedItem,
      trimmedBody,
      operatorUsername
    );
    if (!result.ok) return result;
  }

  return { ok: true };
}
