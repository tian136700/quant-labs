import {
  alignLessonItemExampleSentences,
  parseLessonContent,
  parseLessonMeanings,
} from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 可搜索字段拼成 haystack（小写，便于 includes 模糊匹配） */
export function jpLessonSearchHaystack(lesson: JpLessonRecord): string {
  const parts: string[] = [];

  const contentItems = parseLessonContent(lesson.content);
  parts.push(...contentItems);
  if (lesson.content.trim()) parts.push(lesson.content.trim());

  const meanings = parseLessonMeanings(lesson.meanings);
  parts.push(...meanings.filter((item): item is string => Boolean(item?.trim())));

  for (const block of alignLessonItemExampleSentences(
    lesson.content,
    lesson.example_sentences
  )) {
    if (block?.trim()) parts.push(block.trim());
  }

  if (lesson.title?.trim()) parts.push(lesson.title.trim());
  parts.push(lesson.kind === "grammar" ? "语法" : "单词");

  return parts
    .filter((part) => part.trim())
    .join("\n")
    .toLowerCase();
}

/** 本地模糊搜索：各关键词均需在任一字段中出现（AND）；空查询返回原列表 */
export function filterJpLessonsBySearch(
  lessons: JpLessonRecord[],
  query: string
): JpLessonRecord[] {
  const tokens = normalizeSearchQuery(query);
  if (!tokens.length) return lessons;

  return lessons.filter((lesson) => {
    const haystack = jpLessonSearchHaystack(lesson);
    return tokens.every((token) => haystack.includes(token));
  });
}
