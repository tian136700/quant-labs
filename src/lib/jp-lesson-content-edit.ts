/**
 * 日语新课 · 学习内容 / 释义 编辑：成对行 ↔ 入库格式。
 * 弹窗每行「内容 + 释义」；保存后拆成 content（逗号）与 meanings（|）。
 */

import {
  alignLessonItemMeanings,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";

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

/** 编辑框 → 条目列表（空行跳过） */
export function parseJpLessonNumberedEditLines(raw: string): string[] {
  return (raw || "")
    .split(/\r?\n/)
    .map((line) => stripJpLessonEditLineIndex(line))
    .filter(Boolean);
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
  const kept = (rows || []).filter((row) => (row.content || "").trim());
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
