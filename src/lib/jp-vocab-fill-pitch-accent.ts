import "server-only";

import {
  parseJpVocabPitchAccent,
  serializeJpVocabPitchAccent,
  type JpVocabPitchAccent,
} from "@/lib/jp-vocab-pitch-accent";
import { ensureJpVocabWordSchema } from "@/lib/jp-vocab-db/helpers";

export type JpVocabMissingPitchAccentRow = {
  id: number;
  word: string;
  reading: string | null;
  kind: string;
};

export type JpVocabFillPitchAccentApplied = {
  id: number;
  word: string;
  pitch_accent: string;
};

export type JpVocabFillPitchAccentResult = {
  updated: number;
  applied: JpVocabFillPitchAccentApplied[];
  skipped: Array<{ id: number; word: string; reason: string }>;
  dry_run: boolean;
};

export const JP_VOCAB_PITCH_ACCENT_SOURCE_OJAD = "OJAD";
/** OJAD 查无此词：只标 source，pitch_accent 保持空；UI 只显示普通读音。 */
export const JP_VOCAB_PITCH_ACCENT_SOURCE_NONE = "OJAD_NONE";

export function validateJpVocabPitchAccentForApply(
  payload: unknown
): { ok: true; data: JpVocabPitchAccent } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid_payload" };
  }
  const obj = payload as Record<string, unknown>;
  const serialized = serializeJpVocabPitchAccent({
    kana: String(obj.kana ?? ""),
    pattern: String(obj.pattern ?? ""),
    moras: Array.isArray(obj.moras)
      ? (obj.moras as Array<{ c?: unknown; p?: unknown }>).map((m) => ({
          c: String(m.c ?? ""),
          p: String(m.p ?? "") as JpVocabPitchAccent["moras"][number]["p"],
        }))
      : [],
  });
  const parsed = parseJpVocabPitchAccent(serialized);
  if (!parsed) return { ok: false, reason: "invalid_moras" };
  return { ok: true, data: parsed };
}

export async function listJpVocabWordsMissingPitchAccent(
  db: D1Database,
  limit?: number
): Promise<JpVocabMissingPitchAccentRow[]> {
  await ensureJpVocabWordSchema(db);
  const cap =
    typeof limit === "number" && limit > 0 ? Math.min(Math.floor(limit), 500) : undefined;
  // 未补音调，且未标记 OJAD 查无（source 为空才继续抓）
  const sql = `SELECT id, word, reading, kind FROM jp_vocab_word
       WHERE kind != 'grammar'
         AND (pitch_accent IS NULL OR TRIM(pitch_accent) = '')
         AND (pitch_accent_source IS NULL OR TRIM(pitch_accent_source) = '')
       ORDER BY id${cap ? " LIMIT ?1" : ""}`;
  const stmt = cap ? db.prepare(sql).bind(cap) : db.prepare(sql);
  const result = await stmt.all<{
    id: number;
    word: string;
    reading: string | null;
    kind: string;
  }>();
  return (result.results ?? []).map((row) => ({
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    kind: String(row.kind),
  }));
}

/** OJAD 查无：只写 source=OJAD_NONE，不写音调；页面只显示普通读音。 */
export async function markJpVocabPitchAccentNotFound(
  db: D1Database,
  wordIds: number[],
  options: { dryRun?: boolean } = {}
): Promise<{ marked: number; skipped: Array<{ id: number; reason: string }> }> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const skipped: Array<{ id: number; reason: string }> = [];
  let marked = 0;
  for (const rawId of wordIds) {
    const wordId = Number(rawId);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      skipped.push({ id: wordId, reason: "invalid_id" });
      continue;
    }
    if (dryRun) {
      marked += 1;
      continue;
    }
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET pitch_accent_source = ?1, updated_at = datetime('now')
         WHERE id = ?2 AND kind != 'grammar'
           AND (pitch_accent IS NULL OR TRIM(pitch_accent) = '')
           AND (pitch_accent_source IS NULL OR TRIM(pitch_accent_source) = '')`
      )
      .bind(JP_VOCAB_PITCH_ACCENT_SOURCE_NONE, wordId)
      .run();
    if (Number(result.meta?.changes ?? 0) > 0) {
      marked += 1;
    } else {
      skipped.push({ id: wordId, reason: "no_change" });
    }
  }
  return { marked, skipped };
}

export async function applyJpVocabPitchAccentUpdates(
  db: D1Database,
  updates: Array<{
    word_id: number;
    pitch_accent: JpVocabPitchAccent | string;
    source?: string;
  }>,
  options: { dryRun?: boolean; allowOverwrite?: boolean } = {}
): Promise<JpVocabFillPitchAccentResult> {
  await ensureJpVocabWordSchema(db);
  const dryRun = Boolean(options.dryRun);
  const allowOverwrite = Boolean(options.allowOverwrite);
  const applied: JpVocabFillPitchAccentApplied[] = [];
  const skipped: Array<{ id: number; word: string; reason: string }> = [];

  for (const item of updates) {
    const wordId = Number(item.word_id);
    if (!Number.isInteger(wordId) || wordId <= 0) continue;

    let stored: string;
    if (typeof item.pitch_accent === "string") {
      const parsed = parseJpVocabPitchAccent(item.pitch_accent);
      if (!parsed) {
        skipped.push({ id: wordId, word: "?", reason: "invalid_json" });
        continue;
      }
      stored = item.pitch_accent.trim();
    } else {
      const check = validateJpVocabPitchAccentForApply(item.pitch_accent);
      if (!check.ok) {
        skipped.push({ id: wordId, word: "?", reason: check.reason });
        continue;
      }
      stored = serializeJpVocabPitchAccent(check.data);
    }

    const source = (item.source ?? JP_VOCAB_PITCH_ACCENT_SOURCE_OJAD).trim().slice(0, 80);

    if (dryRun) {
      applied.push({ id: wordId, word: "?", pitch_accent: stored });
      continue;
    }

    const sql = allowOverwrite
      ? `UPDATE jp_vocab_word
         SET pitch_accent = ?1, pitch_accent_source = ?2, updated_at = datetime('now')
         WHERE id = ?3 AND kind != 'grammar'`
      : `UPDATE jp_vocab_word
         SET pitch_accent = ?1, pitch_accent_source = ?2, updated_at = datetime('now')
         WHERE id = ?3 AND kind != 'grammar'
           AND (pitch_accent IS NULL OR TRIM(pitch_accent) = '')`;

    const result = await db.prepare(sql).bind(stored, source || null, wordId).run();
    if (Number(result.meta?.changes ?? 0) > 0) {
      applied.push({ id: wordId, word: "?", pitch_accent: stored });
    } else {
      skipped.push({ id: wordId, word: "?", reason: "no_change" });
    }
  }

  return {
    updated: applied.length,
    applied,
    skipped,
    dry_run: dryRun,
  };
}
