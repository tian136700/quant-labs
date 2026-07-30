import "server-only";

import {
  normalizeJpLessonKind,
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";

/**
 * 从「学习中 / 未完成」（completed=0）日语新课里抽出单词 lemma。
 * - 纯语法课跳过；合传课只取 word 段（末尾 grammar_item_count 为语法，不合并）
 * - な形容词剥词尾「だ」与词库存法一致
 * - 结果已按大小写不敏感去重
 */
export async function listIncompleteJpLessonWordLemmas(
  db: D1Database
): Promise<string[]> {
  let rows: Array<{
    kind: string;
    content: string;
    grammar_item_count: number | null;
  }> = [];

  try {
    const result = await db
      .prepare(
        `SELECT kind, content, grammar_item_count
         FROM jp_lesson
         WHERE completed = 0`
      )
      .all<{
        kind: string;
        content: string;
        grammar_item_count: number | null;
      }>();
    rows = result.results || [];
  } catch {
    // 表尚未建或本地无课表时，下载接口仍应能返回词库侧数据
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const lessonKind = normalizeJpLessonKind(row.kind);
    if (lessonKind === "grammar") continue;

    const items = parseLessonContent(row.content || "");
    if (!items.length) continue;

    const itemKinds = resolveJpLessonItemKinds(
      lessonKind,
      items.length,
      row.grammar_item_count
    );

    for (let i = 0; i < items.length; i++) {
      if ((itemKinds[i] ?? "word") !== "word") continue;
      const word = normalizeJpVocabNaAdjStoredEntry(items[i] || "", null).word.trim();
      if (!word) continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(word);
    }
  }

  return out;
}

/** 单条检测：未完成/学习中新课里是否已有该单词（不含语法） */
export async function incompleteJpLessonHasWordLemma(
  db: D1Database,
  word: string
): Promise<boolean> {
  const target = normalizeJpVocabNaAdjStoredEntry(word || "", null).word
    .trim()
    .toLowerCase();
  if (!target) return false;
  const lemmas = await listIncompleteJpLessonWordLemmas(db);
  return lemmas.some((item) => item.toLowerCase() === target);
}
