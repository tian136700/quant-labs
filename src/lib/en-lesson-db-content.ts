import "server-only";

import {
  enLessonContentExists,
  getEnLessonById,
  isEnLessonDevStoreEnabled,
  replaceEnLessonDevStoreRecord,
} from "@/lib/en-lesson-db";
import {
  normalizeLessonContentForStorage,
  parseLessonContent,
} from "@/lib/en-lesson-shared";
import { normalizeLessonMeaningsForStorage } from "@/lib/jp-lesson-shared";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import type { EnLessonKind, EnLessonRecord } from "@/lib/types";

export type UpdateEnLessonContentFieldsInput = {
  kind?: EnLessonKind | null;
  content: string;
  meanings?: string | null;
  category?: string | null;
  remarks?: string | null;
  title?: string | null;
};

export type UpdateEnLessonContentFieldsResult =
  | { ok: true; lesson: EnLessonRecord }
  | {
      ok: false;
      error:
        | "lesson_id_invalid"
        | "not_found"
        | "content_empty"
        | "content_duplicate"
        | "kind_invalid";
    };

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 更新课次本体：类型 / 学习内容 / 释义 / 分类 / 备注 / 标题。
 * kind+content 变更时做去重（排除本课 id）。
 */
export async function updateEnLessonContentFields(
  db: D1Database,
  lessonId: number,
  input: UpdateEnLessonContentFieldsInput
): Promise<UpdateEnLessonContentFieldsResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const items = parseLessonContent(input.content);
  if (!items.length) {
    return { ok: false, error: "content_empty" };
  }

  const existing = await getEnLessonById(db, lessonId);
  if (!existing) return { ok: false, error: "not_found" };

  let kind: EnLessonKind = existing.kind;
  if (input.kind !== undefined && input.kind !== null) {
    if (input.kind !== "word" && input.kind !== "grammar") {
      return { ok: false, error: "kind_invalid" };
    }
    kind = input.kind;
  }

  const storedContent = normalizeLessonContentForStorage(input.content);
  const meanings = normalizeLessonMeaningsForStorage(
    storedContent,
    input.meanings
  );
  const category =
    input.category !== undefined
      ? normalizeEnVocabCategory(input.category)
      : existing.category;
  const remarks =
    input.remarks !== undefined
      ? (input.remarks || "").trim() || null
      : existing.remarks;
  const title =
    input.title !== undefined
      ? (input.title || "").trim() || null
      : existing.title;

  const kindOrContentChanged =
    kind !== existing.kind ||
    normalizeLessonContentForStorage(existing.content) !== storedContent;
  if (kindOrContentChanged) {
    if (await enLessonContentExists(db, kind, storedContent, lessonId)) {
      return { ok: false, error: "content_duplicate" };
    }
  }

  const ts = nowIso();

  if (isEnLessonDevStoreEnabled()) {
    const next: EnLessonRecord = {
      ...existing,
      kind,
      content: storedContent,
      meanings,
      category,
      remarks,
      title,
      updated_at: ts,
    };
    if (!replaceEnLessonDevStoreRecord(next)) {
      return { ok: false, error: "not_found" };
    }
    const lesson = await getEnLessonById(db, lessonId);
    if (!lesson) return { ok: false, error: "not_found" };
    return { ok: true, lesson };
  }

  const result = await db
    .prepare(
      `UPDATE en_lesson
       SET kind = ?1,
           content = ?2,
           meanings = ?3,
           category = ?4,
           remarks = ?5,
           title = ?6,
           updated_at = ?7
       WHERE id = ?8`
    )
    .bind(
      kind,
      storedContent,
      meanings,
      category,
      remarks,
      title,
      ts,
      lessonId
    )
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const lesson = await getEnLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}
