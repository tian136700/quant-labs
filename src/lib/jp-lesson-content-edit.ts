/**
 * 日语新课 · 学习内容 / 释义 编辑框：编号换行 ↔ 入库格式。
 * 编辑框每行一项（可带 1. / 1、）；保存后拆成 content（逗号）与 meanings（|）。
 */

import {
  alignLessonItemMeanings,
  parseLessonContent,
} from "@/lib/jp-lesson-shared";

/** 去掉行首编号：1. / 1、 / 1) / （1） / 1． */
const LINE_INDEX_PREFIX_RE =
  /^\s*(?:[(（]?\s*\d+\s*[)）]?[.．、)）:]|[①-⑳])\s*/u;

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

/** 入库 content → 编辑框（每行「1. 词条」） */
export function formatJpLessonContentForEdit(content: string): string {
  const items = parseLessonContent(content);
  if (!items.length) {
    const t = (content || "").trim();
    return t ? `1. ${t}` : "";
  }
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

/** 入库 meanings → 编辑框（与 content 对齐；空项仍占一行便于对照） */
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

export type JpLessonContentEditParsed = {
  content: string;
  meanings: string | null;
  contentCount: number;
  meaningCount: number;
};

/**
 * 两个编辑框 → 入库字段。
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
