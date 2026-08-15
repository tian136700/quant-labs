import "server-only";

import {
  createJpLesson,
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  listJpLessons,
  replaceJpLessonDevStoreRecord,
  type CreateJpLessonResult,
} from "@/lib/jp-lesson-db";
import { deleteJpLesson } from "@/lib/jp-lesson-db-delete";
import {
  normalizeLessonExampleSentencesForStorage,
  normalizeLessonMeaningsForStorage,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import { normalizeLessonAnnotationsForStorage } from "@/lib/jp-vocab-annotation";
import type { JpLessonKind, JpLessonRecord, JpLessonUploadInput } from "@/lib/types";

export type UpsertJpLessonResult =
  | {
      ok: true;
      lesson: JpLessonRecord;
      upserted: boolean;
      superseded_pending_ids: number[];
    }
  | { ok: false; error: string };

/**
 * 未完成 + 同 course_label + 同 kind；按 id 升序（最早的 combo 占位优先）。
 */
export async function findPendingJpLessonsByCourseLabelKind(
  db: D1Database,
  courseLabel: string,
  kind: JpLessonKind
): Promise<JpLessonRecord[]> {
  const label = (courseLabel || "").trim();
  if (!label || kind === "word_grammar") return [];

  const lessons = await listJpLessons(db);
  return lessons
    .filter(
      (l) =>
        (l.course_label || "").trim() === label &&
        l.kind === kind &&
        !l.completed
    )
    .sort((a, b) => a.id - b.id);
}

/**
 * 用上传载荷整段替换学习内容 / 释义 / 标注（标日补语法进 combo 占位课）。
 */
export async function replaceJpLessonUploadFields(
  db: D1Database,
  lessonId: number,
  input: {
    content: string;
    meanings?: string | null;
    annotations?: string | null;
    example_sentences?: string | null;
    title?: string | null;
  }
): Promise<CreateJpLessonResult> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const items = parseLessonContent(input.content || "");
  if (!items.length) {
    return { ok: false, error: "content_empty" };
  }

  const existing = await getJpLessonById(db, lessonId);
  if (!existing) return { ok: false, error: "not_found" };

  const contentRaw = input.content || "";
  const storedContent = items.join(", ");
  const meanings = normalizeLessonMeaningsForStorage(contentRaw, input.meanings);
  const annotationsNorm = normalizeLessonAnnotationsForStorage(
    contentRaw,
    input.annotations
  );
  if (!annotationsNorm.ok) {
    return { ok: false, error: annotationsNorm.error };
  }
  const annotations = annotationsNorm.value;
  const exampleSentences = normalizeLessonExampleSentencesForStorage(
    contentRaw,
    input.example_sentences
  );
  const title =
    input.title !== undefined
      ? (input.title || "").trim() || null
      : existing.title;
  const ts = new Date().toISOString();

  if (isJpLessonDevStoreEnabled()) {
    const next: JpLessonRecord = {
      ...existing,
      content: storedContent,
      meanings,
      annotations,
      example_sentences: exampleSentences,
      title,
      uploaded_at: ts,
      updated_at: ts,
    };
    if (!replaceJpLessonDevStoreRecord(next)) {
      return { ok: false, error: "not_found" };
    }
    const lesson = await getJpLessonById(db, lessonId);
    if (!lesson) return { ok: false, error: "not_found" };
    return { ok: true, lesson };
  }

  const result = await db
    .prepare(
      `UPDATE jp_lesson
       SET content = ?1,
           meanings = ?2,
           annotations = ?3,
           example_sentences = ?4,
           title = ?5,
           uploaded_at = ?6,
           updated_at = ?6
       WHERE id = ?7`
    )
    .bind(
      storedContent,
      meanings,
      annotations,
      exampleSentences,
      title,
      ts,
      lessonId
    )
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const lesson = await getJpLessonById(db, lessonId);
  if (!lesson) return { ok: false, error: "not_found" };
  return { ok: true, lesson };
}

function canAutoRemoveSuperseded(lesson: JpLessonRecord): boolean {
  if (lesson.completed || lesson.learning) return false;
  if ((lesson.teacher_ids || []).length > 0) return false;
  if ((lesson.class_schedules || []).length > 0) return false;
  return true;
}

/**
 * 有 course_label 时：合并进最早一条未完成同 kind 课；否则新建。
 * 合并后可安全删掉其它无老师/无课表的重复未完成课（先前误建的第二条）。
 */
export async function createOrUpsertJpLessonByCourseLabel(
  db: D1Database,
  input: JpLessonUploadInput
): Promise<UpsertJpLessonResult> {
  const courseLabel = (input.course_label || "").trim();
  const kind = input.kind === "grammar" ? "grammar" : "word";

  if (!courseLabel) {
    const created = await createJpLesson(db, input);
    if (!created.ok) return created;
    return {
      ok: true,
      lesson: created.lesson,
      upserted: false,
      superseded_pending_ids: [],
    };
  }

  const pending = await findPendingJpLessonsByCourseLabelKind(
    db,
    courseLabel,
    kind
  );
  if (!pending.length) {
    const created = await createJpLesson(db, {
      ...input,
      course_label: courseLabel,
      kind,
    });
    if (!created.ok) return created;
    return {
      ok: true,
      lesson: created.lesson,
      upserted: false,
      superseded_pending_ids: [],
    };
  }

  const target = pending[0];
  const replaced = await replaceJpLessonUploadFields(db, target.id, {
    content: input.content || "",
    meanings: input.meanings,
    annotations: input.annotations,
    example_sentences: input.example_sentences,
    title: input.title ?? courseLabel,
  });
  if (!replaced.ok) return replaced;

  const superseded_pending_ids: number[] = [];
  for (const extra of pending.slice(1)) {
    if (!canAutoRemoveSuperseded(extra)) continue;
    const del = await deleteJpLesson(db, extra.id);
    if (del.ok) superseded_pending_ids.push(extra.id);
  }

  return {
    ok: true,
    lesson: replaced.lesson,
    upserted: true,
    superseded_pending_ids,
  };
}
