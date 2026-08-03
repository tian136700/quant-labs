import "server-only";

/**
 * 未完成课：按项「标完成」→ 每项新建已完成课（无教案）并返回 vocab_sync；
 * 原课剔除对应项，删光则删课。
 */

import {
  createJpLesson,
  getJpLessonById,
  isJpLessonDevStoreEnabled,
  replaceJpLessonDevStoreRecord,
  updateJpLessonProgress,
} from "@/lib/jp-lesson-db";
import { deleteJpLesson } from "@/lib/jp-lesson-db-delete";
import {
  alignLessonItemExampleSentences,
  alignLessonItemMeanings,
  JP_LESSON_EXAMPLE_ITEM_SEP,
  normalizeLessonExampleSentencesForStorage,
  normalizeLessonMeaningsForStorage,
  parseLessonContent,
  resolveJpLessonItemKinds,
} from "@/lib/jp-lesson-shared";
import {
  buildJpLessonVocabSyncPlan,
  type JpLessonVocabSyncPlan,
} from "@/lib/jp-lesson-vocab-sync";
import {
  alignLessonItemAnnotations,
  normalizeLessonAnnotationsForStorage,
} from "@/lib/jp-vocab-annotation";
import type { JpLessonKind, JpLessonRecord } from "@/lib/types";

export type JpLessonCompleteContentItemSync = {
  lesson_id: number;
  vocab_sync: JpLessonVocabSyncPlan;
};

export type CompleteJpLessonContentItemsResult =
  | {
      ok: true;
      source_lesson: JpLessonRecord | null;
      source_deleted: boolean;
      created_lessons: JpLessonRecord[];
      vocab_syncs: JpLessonCompleteContentItemSync[];
    }
  | {
      ok: false;
      error:
        | "lesson_id_invalid"
        | "operator_invalid"
        | "not_found"
        | "lesson_already_completed"
        | "item_indexes_invalid"
        | "item_indexes_empty"
        | "create_failed"
        | "update_failed"
        | "delete_failed"
        | "invalid_annotation";
    };

function normalizeItemIndexes(
  raw: unknown,
  itemCount: number
): number[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n >= itemCount) return null;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a - b);
  return out.length ? out : null;
}

function joinAlignedMeanings(parts: Array<string | null>): string | null {
  if (!parts.some((p) => (p || "").trim())) return null;
  return parts.map((p) => (p || "").trim()).join("|");
}

function joinAlignedExamples(parts: Array<string | null>): string | null {
  if (!parts.some((p) => (p || "").trim())) return null;
  return parts.map((p) => p || "").join(JP_LESSON_EXAMPLE_ITEM_SEP);
}

function joinAlignedAnnotations(
  content: string,
  parts: Array<string | null>
):
  | { ok: true; value: string | null }
  | { ok: false; error: "invalid_annotation" } {
  const raw = parts.some((p) => (p || "").trim())
    ? parts.map((p) => p || "").join("|")
    : null;
  return normalizeLessonAnnotationsForStorage(content, raw);
}

async function updateSourceLessonRemaining(
  db: D1Database,
  source: JpLessonRecord,
  remainingContent: string,
  remainingMeanings: string | null,
  remainingAnnotations: string | null,
  remainingExamples: string | null,
  remainingGrammarItemCount: number
): Promise<JpLessonRecord | null> {
  const ts = new Date().toISOString();

  if (isJpLessonDevStoreEnabled()) {
    const next: JpLessonRecord = {
      ...source,
      content: remainingContent,
      meanings: remainingMeanings,
      annotations: remainingAnnotations,
      example_sentences: remainingExamples,
      grammar_item_count: remainingGrammarItemCount,
      updated_at: ts,
    };
    if (!replaceJpLessonDevStoreRecord(next)) return null;
    return getJpLessonById(db, source.id);
  }

  const result = await db
    .prepare(
      `UPDATE jp_lesson
       SET content = ?1,
           meanings = ?2,
           annotations = ?3,
           example_sentences = ?4,
           grammar_item_count = ?5,
           updated_at = ?6
       WHERE id = ?7`
    )
    .bind(
      remainingContent,
      remainingMeanings,
      remainingAnnotations,
      remainingExamples,
      remainingGrammarItemCount,
      ts,
      source.id
    )
    .run();

  if (!result.meta?.changes) return null;
  return getJpLessonById(db, source.id);
}

/**
 * 从源课按 0-based 下标拆出熟悉项：每项 → 一条已完成新课（无教案）+ vocab_sync；
 * 源课写回剩余项，若空则删除。
 */
export async function completeJpLessonContentItems(
  db: D1Database,
  lessonId: number,
  itemIndexesRaw: unknown,
  operatorUsername: string
): Promise<CompleteJpLessonContentItemsResult> {
  const operator = (operatorUsername || "").trim();
  if (!operator) return { ok: false, error: "operator_invalid" };
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { ok: false, error: "lesson_id_invalid" };
  }

  const source = await getJpLessonById(db, lessonId);
  if (!source) return { ok: false, error: "not_found" };
  if (source.completed) {
    return { ok: false, error: "lesson_already_completed" };
  }

  const words = parseLessonContent(source.content);
  if (!words.length) return { ok: false, error: "item_indexes_empty" };

  const indexes = normalizeItemIndexes(itemIndexesRaw, words.length);
  if (!indexes) {
    return {
      ok: false,
      error: Array.isArray(itemIndexesRaw) && !itemIndexesRaw.length
        ? "item_indexes_empty"
        : "item_indexes_invalid",
    };
  }

  const meanings = alignLessonItemMeanings(source.content, source.meanings);
  const examples = alignLessonItemExampleSentences(
    source.content,
    source.example_sentences
  );
  const annotations = alignLessonItemAnnotations(
    source.content,
    source.annotations
  ).map((a) => a || null);
  const itemKinds = resolveJpLessonItemKinds(
    source.kind,
    words.length,
    source.grammar_item_count
  );

  const createdLessons: JpLessonRecord[] = [];
  const vocabSyncs: JpLessonCompleteContentItemSync[] = [];

  for (const index of indexes) {
    const word = words[index];
    if (!word) return { ok: false, error: "item_indexes_invalid" };
    const kind: JpLessonKind =
      itemKinds[index] === "grammar" ? "grammar" : "word";
    const singleContent = word;
    const singleMeaning = joinAlignedMeanings([meanings[index] ?? null]);
    const singleExample = joinAlignedExamples([examples[index] ?? null]);
    const annNorm = joinAlignedAnnotations(singleContent, [
      annotations[index] ?? null,
    ]);
    if (!annNorm.ok) return { ok: false, error: "invalid_annotation" };

    const created = await createJpLesson(db, {
      kind,
      content: singleContent,
      meanings: singleMeaning,
      annotations: annNorm.value,
      example_sentences: normalizeLessonExampleSentencesForStorage(
        singleContent,
        singleExample
      ),
      course_label: source.course_label,
      course_group_id: source.course_group_id,
      title: source.title,
      ref_key: null,
    });
    if (!created.ok) {
      return { ok: false, error: "create_failed" };
    }

    const progressed = await updateJpLessonProgress(
      db,
      created.lesson.id,
      "completed",
      operator
    );
    if (!progressed.ok) {
      return { ok: false, error: "create_failed" };
    }

    const lesson = progressed.lesson;
    const plan =
      progressed.vocab_sync ?? buildJpLessonVocabSyncPlan(lesson);
    createdLessons.push(lesson);
    if (plan) {
      vocabSyncs.push({ lesson_id: lesson.id, vocab_sync: plan });
    }
  }

  const removeSet = new Set(indexes);
  const remainingWords = words.filter((_, i) => !removeSet.has(i));
  const remainingMeaningsList = meanings.filter((_, i) => !removeSet.has(i));
  const remainingExamplesList = examples.filter((_, i) => !removeSet.has(i));
  const remainingAnnotationsList = annotations.filter(
    (_, i) => !removeSet.has(i)
  );
  const remainingKinds = itemKinds.filter((_, i) => !removeSet.has(i));

  if (!remainingWords.length) {
    const deleted = await deleteJpLesson(db, source.id);
    if (!deleted.ok) return { ok: false, error: "delete_failed" };
    return {
      ok: true,
      source_lesson: null,
      source_deleted: true,
      created_lessons: createdLessons,
      vocab_syncs: vocabSyncs,
    };
  }

  const remainingContent = remainingWords.join(", ");
  const remainingMeanings = normalizeLessonMeaningsForStorage(
    remainingContent,
    joinAlignedMeanings(remainingMeaningsList)
  );
  const remainingExamples = normalizeLessonExampleSentencesForStorage(
    remainingContent,
    joinAlignedExamples(remainingExamplesList)
  );
  const remainingAnn = joinAlignedAnnotations(
    remainingContent,
    remainingAnnotationsList
  );
  if (!remainingAnn.ok) return { ok: false, error: "invalid_annotation" };

  const remainingGrammarItemCount = remainingKinds.filter(
    (k) => k === "grammar"
  ).length;

  const updated = await updateSourceLessonRemaining(
    db,
    source,
    remainingContent,
    remainingMeanings,
    remainingAnn.value,
    remainingExamples,
    source.kind === "word" || source.kind === "grammar"
      ? 0
      : remainingGrammarItemCount
  );
  if (!updated) return { ok: false, error: "update_failed" };

  return {
    ok: true,
    source_lesson: updated,
    source_deleted: false,
    created_lessons: createdLessons,
    vocab_syncs: vocabSyncs,
  };
}
