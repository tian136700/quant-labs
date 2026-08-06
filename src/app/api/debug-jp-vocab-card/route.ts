import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { listJpVocabRefs, listJpVocabWords } from "@/lib/jp-vocab-db";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function isLocalDebugRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isLocalDebugRequest(request)) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }

  const url = new URL(request.url);
  const wordId = Number(url.searchParams.get("word_id") || "0");
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return jsonResponse({ ok: false, error: "invalid_word_id" }, 400);
  }

  try {
    const env = await getCloudflareEnv();
    const [words, refs] = await Promise.all([
      listJpVocabWords(env.DB),
      listJpVocabRefs(env.DB),
    ]);
    const localWord = words.find((item) => item.id === wordId) ?? null;
    const refsRecord = Object.fromEntries(refs.map((ref) => [ref.ref_key, ref]));
    if (localWord) {
      return jsonResponse({
        ok: true,
        source: "local",
        word: localWord,
        refs: refsRecord,
      });
    }
    const remoteWord = await readRemoteDebugWord(wordId);
    return jsonResponse({
      ok: true,
      source: remoteWord ? "remote-fallback" : "missing",
      word: remoteWord,
      refs: refsRecord,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

async function readRemoteDebugWord(wordId: number): Promise<JpVocabWord | null> {
  const sql =
    "SELECT id, word, reading, meaning, pos, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, last_review_level, last_review_at, created_at, updated_at, mnemonic, example_sentences, example_sentences_source, meaning_source, usage, usage_source, srs_interval_days, srs_due_date, connection, connection_source, pos_source, annotation, course_label, oral_frequency, exam_frequency, related_compounds, related_compounds_source FROM jp_vocab_word WHERE id = " +
    String(wordId) +
    ";";
  const { stdout } = await execFileAsync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "strategy-compare-db",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    { cwd: process.cwd() }
  );
  const payload = JSON.parse(stdout) as Array<{
    results?: Array<Record<string, unknown>>;
  }>;
  const row = payload[0]?.results?.[0];
  if (!row) return null;
  return mapDebugRow(row);
}

function mapDebugRow(row: Record<string, unknown>): JpVocabWord {
  return {
    id: Number(row.id),
    word: String(row.word ?? ""),
    reading: row.reading != null ? String(row.reading) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    pos: row.pos != null ? String(row.pos) : null,
    kind: row.kind === "grammar" ? "grammar" : "word",
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    cnt_very: Number(row.cnt_very) || 0,
    cnt_normal: Number(row.cnt_normal) || 0,
    cnt_weak: Number(row.cnt_weak) || 0,
    today_check_count: Number(row.today_check_count) || 0,
    today_check_date:
      row.today_check_date != null ? String(row.today_check_date) : null,
    class_notes: row.class_notes != null ? String(row.class_notes) : null,
    mnemonic: row.mnemonic != null ? String(row.mnemonic) : null,
    annotation: row.annotation != null ? String(row.annotation) : null,
    course_label:
      row.course_label != null ? String(row.course_label) : null,
    oral_frequency:
      row.oral_frequency == null ? null : Number(row.oral_frequency),
    exam_frequency:
      row.exam_frequency == null ? null : Number(row.exam_frequency),
    usage: row.usage != null ? String(row.usage) : null,
    usage_source: row.usage_source != null ? String(row.usage_source) : null,
    connection:
      row.connection != null ? String(row.connection) : null,
    connection_source:
      row.connection_source != null ? String(row.connection_source) : null,
    example_sentences:
      row.example_sentences != null ? String(row.example_sentences) : null,
    example_sentences_source:
      row.example_sentences_source != null
        ? String(row.example_sentences_source)
        : null,
    related_compounds:
      row.related_compounds != null ? String(row.related_compounds) : null,
    related_compounds_source:
      row.related_compounds_source != null
        ? String(row.related_compounds_source)
        : null,
    meaning_source:
      row.meaning_source != null ? String(row.meaning_source) : null,
    pos_source: row.pos_source != null ? String(row.pos_source) : null,
    reading_source: null,
    last_review_level:
      row.last_review_level === "very" ||
      row.last_review_level === "normal" ||
      row.last_review_level === "weak"
        ? row.last_review_level
        : null,
    last_review_at:
      row.last_review_at != null ? String(row.last_review_at) : null,
    srs_interval_days: Number(row.srs_interval_days) || 0,
    srs_due_date: row.srs_due_date != null ? String(row.srs_due_date) : null,
    last_usage_levels: null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

