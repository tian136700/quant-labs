/**
 * 英语新课 · 学习内容 / 释义 成对行 ↔ 入库格式（与日语同一 | / 逗号约定）。
 */

import {
  buildJpLessonContentEditRows,
  buildJpLessonContentMeaningsFromRows,
  createEmptyJpLessonContentEditRow,
  newJpLessonContentEditRowId,
  type JpLessonContentEditParsed,
  type JpLessonContentEditRow,
} from "@/lib/jp-lesson-content-edit";
import {
  normalizeLessonContentForStorage,
  parseLessonContent,
} from "@/lib/en-lesson-shared";
import { normalizeLessonMeaningsForStorage } from "@/lib/jp-lesson-shared";
import type { EnLessonRecord } from "@/lib/types";

export type EnLessonContentEditRow = JpLessonContentEditRow;
export type EnLessonContentEditParsed = JpLessonContentEditParsed;

export const newEnLessonContentEditRowId = newJpLessonContentEditRowId;
export const createEmptyEnLessonContentEditRow = createEmptyJpLessonContentEditRow;
export const buildEnLessonContentEditRows = buildJpLessonContentEditRows;
export const buildEnLessonContentMeaningsFromRows =
  buildJpLessonContentMeaningsFromRows;

export function isEnLessonContentEditRowsDirty(
  lesson: Pick<EnLessonRecord, "content" | "meanings">,
  rows: EnLessonContentEditRow[]
): boolean {
  const parsed = buildEnLessonContentMeaningsFromRows(rows);
  if (!parsed.ok) return true;
  const savedContent = normalizeLessonContentForStorage(lesson.content);
  const savedMeanings =
    normalizeLessonMeaningsForStorage(lesson.content, lesson.meanings) || null;
  return (
    parsed.value.content !== savedContent ||
    (parsed.value.meanings || null) !== savedMeanings
  );
}

export function enLessonContentItemCount(content: string): number {
  return parseLessonContent(content).length;
}
