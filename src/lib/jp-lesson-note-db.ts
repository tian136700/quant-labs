import "server-only";

import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { listJpLessons } from "@/lib/jp-lesson-db";
import {
  buildJpLessonVocabSkipNoteBody,
  JP_LESSON_VOCAB_SKIP_NOTE_MARK,
} from "@/lib/jp-verb-masu-to-dictionary";
import type { JpLessonNote } from "@/lib/types";

const VOCAB_SKIP_NOTE_OPERATOR = "系统";

let devStoreEnabled = false;
const devNotes: JpLessonNote[] = [];
let devNextId = 1;

export function enableJpLessonNoteDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row: Record<string, unknown>): JpLessonNote {
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

const NOTE_SELECT = `SELECT id, lesson_id, item_word, body, created_by, created_at, updated_at FROM jp_lesson_note`;

async function lessonItemWords(
  db: D1Database,
  lessonId: number
): Promise<string[] | null> {
  const lessons = await listJpLessons(db);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  return parseLessonContent(lesson.content);
}

function isValidItemWord(itemWord: string, allowed: string[]): boolean {
  return allowed.some((w) => w === itemWord);
}

export async function listJpLessonNotes(db: D1Database): Promise<JpLessonNote[]> {
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

/** 新课列表角标：只 COUNT，禁止拉 body（含图时极易 1102） */
export async function listJpLessonNoteCountsByLesson(
  db: D1Database
): Promise<Record<number, number>> {
  if (devStoreEnabled) {
    const map: Record<number, number> = {};
    for (const note of devNotes) {
      map[note.lesson_id] = (map[note.lesson_id] ?? 0) + 1;
    }
    return map;
  }

  const result = await db
    .prepare(
      `SELECT lesson_id, COUNT(*) AS cnt
       FROM jp_lesson_note
       GROUP BY lesson_id`
    )
    .all<{ lesson_id: number; cnt: number }>();

  const map: Record<number, number> = {};
  for (const row of result.results || []) {
    const lessonId = Number(row.lesson_id);
    const cnt = Number(row.cnt) || 0;
    if (lessonId > 0 && cnt > 0) map[lessonId] = cnt;
  }
  return map;
}

export async function listJpLessonNotesByLessonId(
  db: D1Database,
  lessonId: number
): Promise<JpLessonNote[]> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return [];

  if (devStoreEnabled) {
    return (await listJpLessonNotes(db)).filter((n) => n.lesson_id === lessonId);
  }

  const result = await db
    .prepare(
      `${NOTE_SELECT} WHERE lesson_id = ?1 ORDER BY created_at DESC, id DESC`
    )
    .bind(lessonId)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export type CreateJpLessonNoteResult =
  | { ok: true; note: JpLessonNote }
  | { ok: false; error: string };

export async function createJpLessonNote(
  db: D1Database,
  lessonId: number,
  itemWord: string,
  body: string,
  operatorUsername: string
): Promise<CreateJpLessonNoteResult> {
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
    const note: JpLessonNote = {
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
      `INSERT INTO jp_lesson_note (lesson_id, item_word, body, created_by, created_at, updated_at)
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

export type UpdateJpLessonNoteResult =
  | { ok: true; note: JpLessonNote }
  | { ok: false; error: string };

export async function updateJpLessonNote(
  db: D1Database,
  noteId: number,
  body: string
): Promise<UpdateJpLessonNoteResult> {
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
      "UPDATE jp_lesson_note SET body = ?1, updated_at = ?2 WHERE id = ?3"
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

export type DeleteJpLessonNoteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteJpLessonNote(
  db: D1Database,
  noteId: number
): Promise<DeleteJpLessonNoteResult> {
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
    .prepare("DELETE FROM jp_lesson_note WHERE id = ?1")
    .bind(noteId)
    .run();

  if (!result.meta?.changes) return { ok: false, error: "not_found" };
  return { ok: true };
}

/**
 * 新课词已在抽问中 → 给该学习内容项写一条跳过备注（不删老师已有笔记；同标记幂等）。
 */
export async function ensureJpLessonVocabSkipNote(
  db: D1Database,
  lessonId: number,
  itemWord: string,
  dictionaryForm: string
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const trimmedItem = itemWord.trim();
  if (!trimmedItem) return { ok: false, error: "item_word_empty" };
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const body = buildJpLessonVocabSkipNoteBody(dictionaryForm);
  const existing = await listJpLessonNotesByLessonId(db, lessonId);
  const already = existing.some(
    (n) =>
      n.item_word === trimmedItem &&
      n.body.includes(JP_LESSON_VOCAB_SKIP_NOTE_MARK)
  );
  if (already) return { ok: true, created: false };

  const result = await createJpLessonNote(
    db,
    lessonId,
    trimmedItem,
    body,
    VOCAB_SKIP_NOTE_OPERATOR
  );
  if (!result.ok) return result;
  return { ok: true, created: true };
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
      "DELETE FROM jp_lesson_note WHERE lesson_id = ?1 AND item_word = ?2"
    )
    .bind(lessonId, trimmedItem)
    .run();

  if (trimmedBody) {
    const result = await createJpLessonNote(
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
