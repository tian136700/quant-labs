/**
 * 日语新课 · 学习内容 / 释义 编辑：成对行 ↔ 入库格式。
 * 弹窗每行「内容 + 释义」；保存后拆成 content（逗号）与 meanings（|）。
 */

import {
  alignLessonItemMeanings,
  isJpLessonContentSeparatorJunk,
  normalizeLessonMeaningsForStorage,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

/** 去掉行首编号：1. / 1、 / 1) / （1） / 1． */
const LINE_INDEX_PREFIX_RE =
  /^\s*(?:[(（]?\s*\d+\s*[)）]?[.．、)）:]|[①-⑳])\s*/u;

let editRowIdSeq = 0;

export function newJpLessonContentEditRowId(): string {
  editRowIdSeq += 1;
  return `jp-lesson-edit-row-${editRowIdSeq}-${Date.now()}`;
}

export type JpLessonContentEditRow = {
  id: string;
  content: string;
  meaning: string;
};

export function stripJpLessonEditLineIndex(line: string): string {
  return line.replace(LINE_INDEX_PREFIX_RE, "").trim();
}

/** 编辑框 → 条目列表（空行跳过；纯分隔线丢弃） */
export function parseJpLessonNumberedEditLines(raw: string): string[] {
  return (raw || "")
    .split(/\r?\n/)
    .map((line) => stripJpLessonEditLineIndex(line))
    .filter((line) => line && !isJpLessonContentSeparatorJunk(line));
}

/** 入库 content → 编号换行文本（兼容旧双框 / 测试） */
export function formatJpLessonContentForEdit(content: string): string {
  const items = parseLessonContent(content);
  if (!items.length) {
    const t = (content || "").trim();
    return t ? `1. ${t}` : "";
  }
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

/** 入库 meanings → 编号换行文本（与 content 对齐） */
export function formatJpLessonMeaningsForEdit(
  content: string,
  meanings: string | null | undefined
): string {
  const items = parseLessonContent(content);
  if (!items.length) return "";
  const aligned = alignLessonItemMeanings(content, meanings);
  return items
    .map((_, i) => `${i + 1}. ${aligned[i] || ""}`)
    .join("\n");
}

/** 入库 → 成对编辑行（至少 1 行空行便于新增） */
export function buildJpLessonContentEditRows(
  content: string,
  meanings: string | null | undefined
): JpLessonContentEditRow[] {
  const items = parseLessonContent(content);
  if (!items.length) {
    const t = (content || "").trim();
    if (!t) {
      return [{ id: newJpLessonContentEditRowId(), content: "", meaning: "" }];
    }
    return [{ id: newJpLessonContentEditRowId(), content: t, meaning: "" }];
  }
  const aligned = alignLessonItemMeanings(content, meanings);
  return items.map((item, i) => ({
    id: newJpLessonContentEditRowId(),
    content: item,
    meaning: aligned[i] || "",
  }));
}

export function createEmptyJpLessonContentEditRow(): JpLessonContentEditRow {
  return { id: newJpLessonContentEditRowId(), content: "", meaning: "" };
}

export type JpLessonContentEditParsed = {
  content: string;
  meanings: string | null;
  contentCount: number;
  meaningCount: number;
};

/**
 * 两个编辑框 → 入库字段（兼容旧双框）。
 * 学习内容按行拆；释义按行拆后与 content 对齐（多截少补空）。
 */
export function buildJpLessonContentMeaningsFromEdit(
  contentEdit: string,
  meaningsEdit: string
):
  | { ok: true; value: JpLessonContentEditParsed }
  | { ok: false; error: "content_empty" } {
  const contentItems = parseJpLessonNumberedEditLines(contentEdit);
  if (!contentItems.length) {
    return { ok: false, error: "content_empty" };
  }
  const meaningItems = parseJpLessonNumberedEditLines(meaningsEdit);
  const storedContent = contentItems.join(", ");
  const alignedMeanings = contentItems.map((_, i) => meaningItems[i] ?? "");
  const meanings = alignedMeanings.some((m) => m.trim())
    ? alignedMeanings.join("|")
    : null;
  return {
    ok: true,
    value: {
      content: storedContent,
      meanings,
      contentCount: contentItems.length,
      meaningCount: meaningItems.length,
    },
  };
}

/**
 * 成对行 → 入库字段。跳过学习内容为空的行；释义与保留行一一对应。
 */
export function buildJpLessonContentMeaningsFromRows(
  rows: JpLessonContentEditRow[]
):
  | { ok: true; value: JpLessonContentEditParsed }
  | { ok: false; error: "content_empty" } {
  const kept = (rows || []).filter((row) => {
    const t = (row.content || "").trim();
    return t && !isJpLessonContentSeparatorJunk(t);
  });
  if (!kept.length) {
    return { ok: false, error: "content_empty" };
  }
  const contentItems = kept.map((row) => row.content.trim());
  const meaningItems = kept.map((row) => (row.meaning || "").trim());
  const meanings = meaningItems.some((m) => m)
    ? meaningItems.join("|")
    : null;
  return {
    ok: true,
    value: {
      content: contentItems.join(", "),
      meanings,
      contentCount: contentItems.length,
      meaningCount: meaningItems.filter(Boolean).length,
    },
  };
}

/** 弹窗行相对已保存课内容是否有未保存改动（标完成须先保存） */
export function isJpLessonContentEditRowsDirty(
  lesson: Pick<JpLessonRecord, "content" | "meanings">,
  rows: JpLessonContentEditRow[]
): boolean {
  const parsed = buildJpLessonContentMeaningsFromRows(rows);
  const savedItems = parseLessonContent(lesson.content);
  const savedContent = savedItems.join(", ");
  const savedMeanings =
    normalizeLessonMeaningsForStorage(lesson.content, lesson.meanings) || null;
  if (!parsed.ok) {
    return savedItems.length > 0;
  }
  return (
    parsed.value.content !== savedContent ||
    (parsed.value.meanings || null) !== savedMeanings
  );
}

/**
 * 勾选行 → 库内 content 0-based 下标。
 * 要求行尚未脏改且下标落在已保存项内。
 */
export function resolveJpLessonContentCompleteIndexes(
  lesson: Pick<JpLessonRecord, "content">,
  rows: JpLessonContentEditRow[],
  selectedIds: string[]
): number[] | null {
  if (!selectedIds.length) return [];
  const savedCount = parseLessonContent(lesson.content).length;
  const indexes: number[] = [];
  const seen = new Set<number>();
  for (const id of selectedIds) {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0 || index >= savedCount) return null;
    if (!(rows[index]?.content || "").trim()) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    indexes.push(index);
  }
  indexes.sort((a, b) => a - b);
  return indexes;
}
