/**
 * 日语新课 · 批量新增语法（页内「新增」弹窗）。
 * 已完成：建课 + 标完成 + 按条 upsert 抽问（已有 lemma 跳过）。
 */

import "server-only";

import {
  createJpLesson,
  updateJpLessonProgress,
} from "@/lib/jp-lesson-db";
import {
  parseJpLessonBulkGrammarText,
  type JpLessonBulkGrammarItem,
} from "@/lib/jp-lesson-bulk-grammar-parse";
import type { JpLessonProgressStatus } from "@/lib/jp-lesson-shared";
import {
  upsertJpVocabFromLesson,
  type JpVocabLessonUpsertItem,
  type UpsertJpVocabFromLessonResult,
} from "@/lib/jp-vocab-db";
import type { JpLessonRecord } from "@/lib/types";

export type BulkCreateJpLessonGrammarInput = {
  text: string;
  course_label: string;
  progress_status: JpLessonProgressStatus;
  operatorUsername: string;
};

export type BulkCreateJpLessonGrammarResult =
  | {
      ok: true;
      lesson: JpLessonRecord;
      item_count: number;
      vocab_sync: UpsertJpVocabFromLessonResult | null;
      skipped_words: string[];
    }
  | { ok: false; error: string; detail?: string };

function buildUpsertItems(
  items: JpLessonBulkGrammarItem[],
  courseLabel: string | null
): JpVocabLessonUpsertItem[] {
  return items.map((it) => ({
    word: it.word,
    kind: "grammar" as const,
    ref_key: null,
    meaning: it.meaning,
    annotation: it.annotation,
    course_label: courseLabel,
    oral_frequency: it.oral_frequency,
    exam_frequency: it.exam_frequency,
    lesson_item_word: it.word,
  }));
}

async function listExistingLemmas(
  db: D1Database,
  words: string[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  const cleaned = words.map((w) => w.trim()).filter(Boolean);
  for (const word of cleaned) {
    const row = await db
      .prepare(`SELECT word FROM jp_vocab_word WHERE word = ?1 LIMIT 1`)
      .bind(word)
      .first<{ word: string }>();
    if (row?.word) existing.add(row.word);
  }
  return existing;
}

export async function bulkCreateJpLessonGrammar(
  db: D1Database,
  input: BulkCreateJpLessonGrammarInput
): Promise<BulkCreateJpLessonGrammarResult> {
  const courseLabel = (input.course_label || "").trim();
  if (!courseLabel) {
    return { ok: false, error: "course_label_required" };
  }
  const progress = input.progress_status;
  if (
    progress !== "pending" &&
    progress !== "learning" &&
    progress !== "completed"
  ) {
    return { ok: false, error: "progress_status_invalid" };
  }
  const operator = (input.operatorUsername || "").trim();
  if (!operator) {
    return { ok: false, error: "operator_invalid" };
  }

  const parsed = parseJpLessonBulkGrammarText(input.text);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      detail: parsed.detail,
    };
  }

  const created = await createJpLesson(db, {
    kind: "grammar",
    content: parsed.content,
    meanings: parsed.meanings,
    annotations: parsed.annotations,
    course_label: courseLabel,
  });
  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  let lesson = created.lesson;

  if (progress === "learning" || progress === "completed") {
    const prog = await updateJpLessonProgress(
      db,
      lesson.id,
      progress,
      operator
    );
    if (!prog.ok) {
      return { ok: false, error: prog.error };
    }
    lesson = prog.lesson;
  }

  if (progress !== "completed") {
    return {
      ok: true,
      lesson,
      item_count: parsed.items.length,
      vocab_sync: null,
      skipped_words: [],
    };
  }

  const already = await listExistingLemmas(
    db,
    parsed.items.map((it) => it.word)
  );
  const skipped_words = parsed.items
    .map((it) => it.word.trim())
    .filter((w) => already.has(w));

  const upsertItems = buildUpsertItems(parsed.items, courseLabel);
  const vocab_sync = await upsertJpVocabFromLesson(db, upsertItems, [], {
    lessonId: lesson.id,
    skipExistingGrammar: true,
    upsertRefs: false,
  });

  return {
    ok: true,
    lesson,
    item_count: parsed.items.length,
    vocab_sync,
    skipped_words,
  };
}
