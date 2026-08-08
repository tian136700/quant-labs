import "server-only";

import {
  buildJpLessonBoardDocxFingerprint,
  pitchDigestFromStored,
} from "@/lib/jp-lesson-board-docx";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import {
  ensureJpLessonSchemaColumns,
  getJpLessonById,
} from "@/lib/jp-lesson-db";
import type { JpLessonRecord } from "@/lib/types";

export type JpLessonBoardDocxWordRow = {
  word: string;
  word_id: number | null;
  reading: string | null;
  pitch_accent: string | null;
  pitch_accent_source: string | null;
  pitch_digest: string;
  needs_ojad: boolean;
};

export type JpLessonBoardDocxNeedRow = {
  lesson_id: number;
  content: string;
  meanings: string | null;
  title: string | null;
  course_label: string | null;
  ref_key: string;
  ref_updated_at: string;
  ref_media_type: string;
  ref_r2_key: string;
  current_fingerprint: string | null;
  expected_fingerprint: string;
  words: JpLessonBoardDocxWordRow[];
};

async function lookupWordsPitchBySurface(
  db: D1Database,
  surfaces: string[]
): Promise<
  Map<
    string,
    {
      id: number;
      reading: string | null;
      pitch_accent: string | null;
      pitch_accent_source: string | null;
    }
  >
> {
  const unique = [...new Set(surfaces.map((s) => s.trim()).filter(Boolean))];
  const map = new Map<
    string,
    {
      id: number;
      reading: string | null;
      pitch_accent: string | null;
      pitch_accent_source: string | null;
    }
  >();
  if (!unique.length) return map;

  // D1 变量上限：分批 IN
  const chunk = 40;
  for (let i = 0; i < unique.length; i += chunk) {
    const part = unique.slice(i, i + chunk);
    const placeholders = part.map(() => "?").join(", ");
    const sql = `SELECT id, word, reading, pitch_accent, pitch_accent_source
      FROM jp_vocab_word
      WHERE kind != 'grammar' AND word IN (${placeholders})`;
    const result = await db
      .prepare(sql)
      .bind(...part)
      .all<{
        id: number;
        word: string;
        reading: string | null;
        pitch_accent: string | null;
        pitch_accent_source: string | null;
      }>();
    for (const row of result.results ?? []) {
      const key = String(row.word).trim();
      if (!map.has(key)) {
        map.set(key, {
          id: Number(row.id),
          reading: row.reading != null ? String(row.reading) : null,
          pitch_accent:
            row.pitch_accent != null ? String(row.pitch_accent) : null,
          pitch_accent_source:
            row.pitch_accent_source != null
              ? String(row.pitch_accent_source)
              : null,
        });
      }
    }
  }
  return map;
}

/** 单词课 + 有教案 + 未完成（含学习中）且指纹过期或缺文件 */
export async function listJpLessonsNeedingBoardDocx(
  db: D1Database,
  limit = 20
): Promise<JpLessonBoardDocxNeedRow[]> {
  await ensureJpLessonSchemaColumns(db);
  const cap = Math.min(Math.max(1, Math.floor(limit)), 50);
  const result = await db
    .prepare(
      `SELECT l.id AS lesson_id, l.content, l.meanings, l.title, l.course_label,
              l.ref_key, l.board_docx_fingerprint,
              r.updated_at AS ref_updated_at, r.media_type AS ref_media_type,
              r.r2_key AS ref_r2_key
       FROM jp_lesson l
       INNER JOIN jp_vocab_ref r ON r.ref_key = l.ref_key
       WHERE l.kind = 'word'
         AND l.completed = 0
         AND l.ref_key IS NOT NULL AND TRIM(l.ref_key) != ''
         AND LOWER(COALESCE(r.media_type, 'image')) != 'pdf'
       ORDER BY l.id DESC
       LIMIT ?1`
    )
    .bind(cap * 3)
    .all<Record<string, unknown>>();

  const rows: JpLessonBoardDocxNeedRow[] = [];
  for (const row of result.results ?? []) {
    const lessonId = Number(row.lesson_id);
    const content = String(row.content || "");
    const meanings =
      row.meanings != null && String(row.meanings).trim()
        ? String(row.meanings).trim()
        : null;
    const refKey = String(row.ref_key || "").trim();
    const refUpdatedAt = String(row.ref_updated_at || "").trim();
    if (!lessonId || !refKey || !refUpdatedAt) continue;

    const surfaces = parseLessonContent(content);
    const pitchMap = await lookupWordsPitchBySurface(db, surfaces);
    const words: JpLessonBoardDocxWordRow[] = surfaces.map((word) => {
      const hit = pitchMap.get(word.trim());
      const pitch_accent = hit?.pitch_accent ?? null;
      const pitch_accent_source = hit?.pitch_accent_source ?? null;
      const pitch_digest = pitchDigestFromStored({
        pitchAccent: pitch_accent,
        pitchAccentSource: pitch_accent_source,
      });
      const needs_ojad = !pitch_digest;
      return {
        word,
        word_id: hit?.id ?? null,
        reading: hit?.reading ?? null,
        pitch_accent,
        pitch_accent_source,
        pitch_digest,
        needs_ojad,
      };
    });

    const expected = buildJpLessonBoardDocxFingerprint({
      refUpdatedAt,
      content,
      meanings,
      pitchDigests: words.map((w) => w.pitch_digest),
    });
    const current =
      row.board_docx_fingerprint != null &&
      String(row.board_docx_fingerprint).trim()
        ? String(row.board_docx_fingerprint).trim()
        : null;
    if (current === expected) continue;

    rows.push({
      lesson_id: lessonId,
      content,
      meanings,
      title: row.title != null ? String(row.title) : null,
      course_label: row.course_label != null ? String(row.course_label) : null,
      ref_key: refKey,
      ref_updated_at: refUpdatedAt,
      ref_media_type: String(row.ref_media_type || "image"),
      ref_r2_key: String(row.ref_r2_key || ""),
      current_fingerprint: current,
      expected_fingerprint: expected,
      words,
    });
    if (rows.length >= cap) break;
  }
  return rows;
}

export async function markJpLessonBoardDocxUploaded(
  db: D1Database,
  lessonId: number,
  input: { r2Key: string; fingerprint: string }
): Promise<JpLessonRecord | null> {
  await ensureJpLessonSchemaColumns(db);
  const ts = new Date().toISOString();
  const r2Key = (input.r2Key || "").trim();
  const fingerprint = (input.fingerprint || "").trim();
  if (!r2Key || !fingerprint || !Number.isInteger(lessonId) || lessonId <= 0) {
    return null;
  }
  await db
    .prepare(
      `UPDATE jp_lesson
       SET board_docx_r2_key = ?1,
           board_docx_fingerprint = ?2,
           board_docx_updated_at = ?3,
           updated_at = ?3
       WHERE id = ?4`
    )
    .bind(r2Key, fingerprint, ts, lessonId)
    .run();
  return getJpLessonById(db, lessonId);
}

export async function getJpLessonBoardDocxMeta(
  db: D1Database,
  lessonId: number
): Promise<{
  lesson_id: number;
  board_docx_r2_key: string | null;
  board_docx_fingerprint: string | null;
  board_docx_updated_at: string | null;
  ref_key: string | null;
  kind: string;
  content: string;
  title: string | null;
} | null> {
  if (!Number.isInteger(lessonId) || lessonId <= 0) return null;
  await ensureJpLessonSchemaColumns(db);
  const row = await db
    .prepare(
      `SELECT id, kind, content, title, ref_key,
              board_docx_r2_key, board_docx_fingerprint, board_docx_updated_at
       FROM jp_lesson WHERE id = ?1 LIMIT 1`
    )
    .bind(lessonId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    lesson_id: Number(row.id),
    board_docx_r2_key:
      row.board_docx_r2_key != null && String(row.board_docx_r2_key).trim()
        ? String(row.board_docx_r2_key).trim()
        : null,
    board_docx_fingerprint:
      row.board_docx_fingerprint != null &&
      String(row.board_docx_fingerprint).trim()
        ? String(row.board_docx_fingerprint).trim()
        : null,
    board_docx_updated_at:
      row.board_docx_updated_at != null &&
      String(row.board_docx_updated_at).trim()
        ? String(row.board_docx_updated_at).trim()
        : null,
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    kind: String(row.kind || "word"),
    content: String(row.content || ""),
    title: row.title != null ? String(row.title) : null,
  };
}
