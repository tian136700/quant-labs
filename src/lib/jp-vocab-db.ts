import "server-only";

import type {
  CloudflareEnv,
  JpVocabKind,
  JpVocabLevel,
  JpVocabMediaType,
  JpVocabRef,
  JpVocabRefUploadInput,
  JpVocabSharedItem,
  JpVocabShareRequest,
  JpVocabUploadInput,
  JpVocabWord,
} from "@/lib/types";
import {
  jpVocabRefKeyFromBytes,
  jpVocabRefLocalMarker,
  normalizeJpVocabRefKey,
} from "@/lib/jp-vocab-ref-shared";
import {
  jpVocabRefFileExists,
  putJpVocabRefFile,
} from "@/lib/jp-vocab-ref-server";
import { sortJpVocabWords } from "@/lib/jp-vocab-shared";
import {
  normalizeJpVocabReviewProgress,
  type JpVocabReviewProgress,
} from "@/lib/jp-vocab-review-session";
import {
  beijingDateString,
  beijingDateTimeString,
  effectiveTodayCheckCount,
  jpVocabTodayCheckStats,
} from "@/lib/jp-vocab-daily-check";
import {
  appendJpVocabDailyDisplayOrderId,
  computeJpVocabDailyDisplayOrder,
  markJpVocabRoundChecked,
  mergeJpVocabDailyDisplayOrder,
  normalizeJpVocabRoundCheckedIds,
  resolveJpVocabRoundCheckedIds,
  unmarkJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import {
  JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
  normalizeJpVocabDailyQuizStyle,
  type JpVocabDailyQuizStyle,
} from "@/lib/jp-vocab-daily-quiz-style";
import {
  JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  applyJpVocabQuizTargetVisiblePlan,
  materializeJpVocabTeacherVisibleLimit,
  normalizeJpVocabTeacherVisibleLimit,
  shouldMaterializeJpVocabTeacherVisibleLimit,
  teacherVisibleLimitNeedsPersist,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import {
  isJpVocabTeacherQuizLiveStudentPeeked,
  JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  normalizeJpVocabTeacherQuizLive,
  type JpVocabTeacherQuizLive,
} from "@/lib/jp-vocab-teacher-quiz-live";
import { formatReviewIso, resolveJpVocabSharedTeacherLevel } from "@/lib/jp-vocab-review";
import { resolveJpVocabReadingIfMissing } from "@/lib/jp-vocab-fill-reading";
import { applyJpVocabReview, isJpVocabWordReviewLocked, revertJpVocabAutoShareReview } from "@/lib/jp-vocab-review";
import {
  computeJpVocabDailyQuizProgress,
  JP_VOCAB_DAILY_QUIZ_TOP,
  type JpVocabDailyQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import { listJpLessons } from "@/lib/jp-lesson-db";
import { listJpLessonNotesByLessonId, replaceLessonNotesForItem } from "@/lib/jp-lesson-note-db";
import type { JpLessonRecord } from "@/lib/types";
import {
  JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL,
  normalizeJpVocabExampleSentencesSource,
} from "@/lib/jp-vocab-example-sentences";
import { normalizeJpVocabNaAdjStoredEntry } from "@/lib/jp-vocab-na-adj";
import { ensureJpVocabCoachSchema } from "@/lib/jp-vocab-coach-db";

const SEED_WORDS: JpVocabUploadInput[] = [
  {
    word: "～ばかり",
    meaning: "（刚刚，只是……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "遊んでばかりいます。\n今来たばかりです。",
  },
  {
    word: "～ようになる",
    meaning: "（变得能够……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "日本語が話せるようになりました。\n毎日早く起きるようになりました。",
  },
  {
    word: "～に来る",
    meaning: "（来……做……）",
    kind: "grammar",
    ref_key: "demo-lesson3-grammar",
    example_sentences: "ご飯を食べに来ます。\n買い物に来ました。",
  },
];

const SEED_REFS: JpVocabRefUploadInput[] = [
  {
    ref_key: "demo-lesson3-grammar",
    title: "3つの大切な文法",
    media_type: "image",
  },
];

let devStoreEnabled = false;
const devWords: JpVocabWord[] = [];
const devRefs = new Map<string, JpVocabRef>();
let devNextId = 1;
let devSeeded = false;
let vocabWordSchemaReady = false;
let devDailyQuizStyle: JpVocabDailyQuizStyle = {
  ...JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT,
};
let devTeacherVisibleLimit: JpVocabTeacherVisibleLimit = {
  date: "",
  limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
  released_today: false,
  release_count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
  excluded_batch_ids: [],
};
let devDailyDisplayOrder: JpVocabDailyDisplayOrder = {
  date: "",
  ids: [],
  round_checked_ids: [],
};
let devTeacherQuizLive: JpVocabTeacherQuizLive = {
  ...JP_VOCAB_TEACHER_QUIZ_LIVE_EMPTY,
  date: beijingDateString(),
};
const devReviewDoneWordIds: number[] = [];
const devShared: Array<{
  id: number;
  word_id: number;
  shared_by: string;
  shared_at: string;
  share_date: string;
  auto_marked_level: JpVocabLevel | null;
}> = [];
let devSharedNextId = 1;
let jpVocabSharedSchemaReady = false;
let jpVocabSharedColumnsReady = false;
const devShareRequests: JpVocabShareRequest[] = [];
let devShareRequestNextId = 1;
let jpVocabShareRequestSchemaReady = false;
let jpVocabSettingSchemaReady = false;
let jpVocabReviewDoneSchemaReady = false;

const JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS = 10_000;

const JP_VOCAB_DAILY_QUIZ_STYLE_KEY = "daily_quiz_style";
const JP_VOCAB_DAILY_DISPLAY_ORDER_KEY = "daily_display_order";
const JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY = "teacher_visible_limit";
const JP_VOCAB_TEACHER_QUIZ_LIVE_KEY = "teacher_quiz_live";

/** 同一 Worker isolate 内缓存高频只读 setting，减轻轮询对 D1 的压力 */
const JP_VOCAB_SETTING_READ_CACHE_MS = 5_000;
/** 学生「今日共享」列表短缓存：合并多端轮询，降低 D1 timeout */
const JP_VOCAB_SHARED_LIST_CACHE_MS = 5_000;
let teacherQuizLiveReadCache: {
  at: number;
  value: JpVocabTeacherQuizLive;
} | null = null;
let teacherVisibleLimitReadCache: {
  at: number;
  value: JpVocabTeacherVisibleLimit;
} | null = null;
let sharedTodayListCache: {
  at: number;
  date: string;
  value: { items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> };
} | null = null;
let sharedTodayListCacheGen = 0;
let sharedTodayListInflight: Promise<{
  items: JpVocabSharedItem[];
  refs: Record<string, JpVocabRef>;
}> | null = null;

function invalidateJpVocabSharedTodayCache() {
  sharedTodayListCache = null;
  sharedTodayListCacheGen += 1;
}

export function enableJpVocabDevStore() {
  devStoreEnabled = true;
}

function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** trim + な形容词尾「だ」剥成词干（重要だ→重要）；读音请配 normalizeJpVocabNaAdjStoredEntry */
function normalizeWord(raw: string): string {
  return normalizeJpVocabNaAdjStoredEntry(raw || "", null).word;
}

function normalizeKind(raw?: JpVocabKind | null): JpVocabKind {
  return raw === "grammar" ? "grammar" : "word";
}

function normalizeMediaType(raw?: JpVocabMediaType | null): JpVocabMediaType {
  return raw === "pdf" ? "pdf" : "image";
}

function mapRefRow(row: Record<string, unknown>): JpVocabRef {
  return {
    ref_key: String(row.ref_key),
    title: row.title != null ? String(row.title) : null,
    media_type: row.media_type === "pdf" ? "pdf" : "image",
    r2_key: String(row.r2_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRow(row: Record<string, unknown>): JpVocabWord {
  const todayCheckDate =
    row.today_check_date != null ? String(row.today_check_date) : null;
  return {
    id: Number(row.id),
    word: String(row.word),
    reading: row.reading != null ? String(row.reading) : null,
    meaning: row.meaning != null ? String(row.meaning) : null,
    pos:
      row.pos != null && String(row.pos).trim() ? String(row.pos) : null,
    kind: row.kind === "grammar" ? "grammar" : "word",
    ref_key: row.ref_key != null ? String(row.ref_key) : null,
    cnt_very: Number(row.cnt_very) || 0,
    cnt_normal: Number(row.cnt_normal) || 0,
    cnt_weak: Number(row.cnt_weak) || 0,
    today_check_count: effectiveTodayCheckCount(
      Number(row.today_check_count) || 0,
      todayCheckDate
    ),
    today_check_date: todayCheckDate,
    class_notes:
      row.class_notes != null && String(row.class_notes).trim()
        ? String(row.class_notes)
        : null,
    mnemonic:
      row.mnemonic != null && String(row.mnemonic).trim()
        ? String(row.mnemonic)
        : null,
    example_sentences:
      row.example_sentences != null && String(row.example_sentences).trim()
        ? String(row.example_sentences)
        : null,
    example_sentences_source:
      row.example_sentences_source != null &&
      String(row.example_sentences_source).trim()
        ? String(row.example_sentences_source).trim()
        : null,
    meaning_source:
      row.meaning_source != null && String(row.meaning_source).trim()
        ? String(row.meaning_source).trim()
        : null,
    last_review_level:
      row.last_review_level === "very" ||
      row.last_review_level === "normal" ||
      row.last_review_level === "weak"
        ? row.last_review_level
        : null,
    last_review_at:
      row.last_review_at != null ? String(row.last_review_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function ensureVocabWordSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || vocabWordSchemaReady) return;
  const info = await db
    .prepare(`PRAGMA table_info(jp_vocab_word)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("today_check_count")) {
    await db
      .prepare(
        `ALTER TABLE jp_vocab_word ADD COLUMN today_check_count INTEGER NOT NULL DEFAULT 0`
      )
      .run();
  }
  if (!cols.has("today_check_date")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_word ADD COLUMN today_check_date TEXT`)
      .run();
  }
  if (!cols.has("pos")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN pos TEXT`).run();
  }
  if (!cols.has("last_review_level")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN last_review_level TEXT`).run();
  }
  if (!cols.has("last_review_at")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN last_review_at TEXT`).run();
  }
  if (!cols.has("mnemonic")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN mnemonic TEXT`).run();
  }
  if (!cols.has("example_sentences")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN example_sentences TEXT`).run();
  }
  if (!cols.has("example_sentences_source")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_word ADD COLUMN example_sentences_source TEXT`)
      .run();
  }
  if (!cols.has("meaning_source")) {
    await db.prepare(`ALTER TABLE jp_vocab_word ADD COLUMN meaning_source TEXT`).run();
  }
  vocabWordSchemaReady = true;
}

/** 供 fill-example 等轻量入口在写库前确保列存在 */
export async function ensureJpVocabWordSchema(db: D1Database): Promise<void> {
  await ensureVocabWordSchema(db);
}

const WORD_SELECT = `SELECT id, word, reading, meaning, pos, kind, ref_key,
  cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, mnemonic, example_sentences,
  example_sentences_source, meaning_source,
  last_review_level, last_review_at, created_at, updated_at FROM jp_vocab_word`;

function refsRecord(refs: JpVocabRef[]): Record<string, JpVocabRef> {
  return Object.fromEntries(refs.map((r) => [r.ref_key, r]));
}

async function upsertRefMetadataDev(
  item: JpVocabRefUploadInput,
  ts: string
): Promise<JpVocabRef | null> {
  const refKey = normalizeJpVocabRefKey(item.ref_key);
  if (!refKey) return null;

  const mediaType = normalizeMediaType(item.media_type);
  const existing = devRefs.get(refKey);
  const ref: JpVocabRef = {
    ref_key: refKey,
    title: (item.title || "").trim() || existing?.title || null,
    media_type: mediaType,
    r2_key: existing?.r2_key || jpVocabRefLocalMarker(refKey),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };
  devRefs.set(refKey, ref);
  return ref;
}

async function upsertRefMetadataDb(
  db: D1Database,
  item: JpVocabRefUploadInput,
  ts: string
): Promise<void> {
  const refKey = normalizeJpVocabRefKey(item.ref_key);
  if (!refKey) return;

  const mediaType = normalizeMediaType(item.media_type);
  const title = (item.title || "").trim() || null;

  await db
    .prepare(
      `INSERT INTO jp_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, jp_vocab_ref.title),
         media_type = excluded.media_type,
         updated_at = excluded.updated_at`
    )
    .bind(refKey, title, mediaType, jpVocabRefLocalMarker(refKey), ts)
    .run();
}

export async function upsertJpVocabRefMetadata(
  db: D1Database,
  refs: JpVocabRefUploadInput[]
): Promise<void> {
  const cleaned = refs
    .map((r) => ({
      ref_key: normalizeJpVocabRefKey(r.ref_key),
      title: (r.title || "").trim() || null,
      media_type: normalizeMediaType(r.media_type),
    }))
    .filter((r) => r.ref_key);

  if (!cleaned.length) return;

  const ts = nowIso();

  if (devStoreEnabled) {
    for (const item of cleaned) {
      await upsertRefMetadataDev(item, ts);
    }
    return;
  }

  for (const item of cleaned) {
    await upsertRefMetadataDb(db, item, ts);
  }
}

export async function saveJpVocabRefFileMeta(
  db: D1Database,
  refKey: string,
  title: string | null,
  mediaType: JpVocabMediaType,
  r2Key: string
): Promise<JpVocabRef> {
  const key = normalizeJpVocabRefKey(refKey);
  if (!key) throw new Error("ref_key_invalid");

  const ts = nowIso();

  if (devStoreEnabled) {
    const existing = devRefs.get(key);
    const ref: JpVocabRef = {
      ref_key: key,
      title: title || existing?.title || null,
      media_type: mediaType,
      r2_key: r2Key,
      created_at: existing?.created_at || ts,
      updated_at: ts,
    };
    devRefs.set(key, ref);
    return ref;
  }

  await db
    .prepare(
      `INSERT INTO jp_vocab_ref (ref_key, title, media_type, r2_key, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(ref_key) DO UPDATE SET
         title = COALESCE(excluded.title, jp_vocab_ref.title),
         media_type = excluded.media_type,
         r2_key = excluded.r2_key,
         updated_at = excluded.updated_at`
    )
    .bind(key, title, mediaType, r2Key, ts)
    .run();

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  if (!row) throw new Error("ref_save_failed");
  return mapRefRow(row);
}

export async function getJpVocabRef(
  db: D1Database,
  refKey: string
): Promise<JpVocabRef | null> {
  const key = normalizeJpVocabRefKey(refKey);
  if (!key) return null;

  if (devStoreEnabled) {
    return devRefs.get(key) ?? null;
  }

  const row = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref WHERE ref_key = ?1`
    )
    .bind(key)
    .first<Record<string, unknown>>();

  return row ? mapRefRow(row) : null;
}

export async function listJpVocabRefs(db: D1Database): Promise<JpVocabRef[]> {
  if (devStoreEnabled) {
    return [...devRefs.values()].sort((a, b) =>
      a.ref_key.localeCompare(b.ref_key)
    );
  }

  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref ORDER BY ref_key ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRefRow);
}

async function listJpVocabRefsByKeys(
  db: D1Database,
  refKeys: string[]
): Promise<JpVocabRef[]> {
  const unique = [...new Set(refKeys.filter(Boolean))];
  if (!unique.length) return [];

  if (devStoreEnabled) {
    return unique
      .map((key) => devRefs.get(key))
      .filter((ref): ref is JpVocabRef => ref != null);
  }

  const placeholders = unique.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(
      `SELECT ref_key, title, media_type, r2_key, created_at, updated_at
       FROM jp_vocab_ref
       WHERE ref_key IN (${placeholders})
       ORDER BY ref_key ASC`
    )
    .bind(...unique)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRefRow);
}

function mapSharedListWordRow(row: Record<string, unknown>): JpVocabWord {
  const word = mapRow({ ...row, class_notes: null });
  return {
    ...word,
    class_notes: null,
    class_notes_present: Boolean(Number(row.has_class_notes)),
  };
}

async function seedIfEmpty(db: D1Database): Promise<void> {
  if (devStoreEnabled) {
    if (devSeeded || devWords.length > 0) return;
    const ts = nowIso();
    for (const item of SEED_REFS) {
      await upsertRefMetadataDev(item, ts);
    }
    for (const item of SEED_WORDS) {
      devWords.push({
        id: devNextId++,
        word: item.word,
        reading: item.reading?.trim() || null,
        meaning: item.meaning?.trim() || null,
        pos: null,
        kind: normalizeKind(item.kind),
        ref_key: item.ref_key
          ? normalizeJpVocabRefKey(item.ref_key) || null
          : null,
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        class_notes: null,
        created_at: ts,
        updated_at: ts,
      });
    }
    devSeeded = true;
    return;
  }

  const countRow = await db
    .prepare("SELECT COUNT(*) AS c FROM jp_vocab_word")
    .first<{ c: number }>();
  if ((countRow?.c ?? 0) > 0) return;

  const ts = nowIso();
  await upsertJpVocabRefMetadata(db, SEED_REFS);

  const stmts = SEED_WORDS.map((item) =>
    db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?6)`
      )
      .bind(
        item.word,
        item.reading?.trim() || null,
        item.meaning?.trim() || null,
        normalizeKind(item.kind),
        item.ref_key ? normalizeJpVocabRefKey(item.ref_key) || null : null,
        ts
      )
  );
  await db.batch(stmts);
}

export async function listJpVocabWords(db: D1Database): Promise<JpVocabWord[]> {
  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    return sortJpVocabWords(devWords);
  }

  const result = await db
    .prepare(
      `${WORD_SELECT}
       ORDER BY cnt_weak DESC, cnt_normal DESC, word COLLATE NOCASE ASC`
    )
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export async function listJpVocabWordsWithRefs(db: D1Database): Promise<{
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
}> {
  const [words, refs] = await Promise.all([
    listJpVocabWords(db),
    listJpVocabRefs(db),
  ]);
  return { words, refs: refsRecord(refs) };
}

/** 增量同步：仅返回 updated_at 晚于 since 的词条（轻量轮询用） */
export async function listJpVocabWordsChangedSince(
  db: D1Database,
  since: string
): Promise<JpVocabWord[]> {
  const marker = since.trim();
  if (!marker) return [];

  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    return devWords
      .filter((w) => w.updated_at > marker)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  }

  const result = await db
    .prepare(
      `${WORD_SELECT} WHERE updated_at > ?1 ORDER BY updated_at ASC LIMIT 200`
    )
    .bind(marker)
    .all<Record<string, unknown>>();

  return (result.results || []).map(mapRow);
}

export type RecordJpVocabReviewOptions = {
  /** 勾选后同步到学生「今日日语单词」 */
  shareToStudy?: boolean;
  sharedBy?: string;
};

export type RecordJpVocabReviewResult =
  | {
      ok: true;
      word: JpVocabWord;
      /** 该词今日已在共享列表（含本次新写入或原本已共享） */
      shared?: boolean;
      /** 本次新写入 jp_vocab_shared */
      shared_new?: boolean;
    }
  | { ok: false; error: string };

export async function recordJpVocabReview(
  db: D1Database,
  wordId: number,
  level: JpVocabLevel,
  options?: RecordJpVocabReviewOptions
): Promise<RecordJpVocabReviewResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  if (!["very", "normal", "weak"].includes(level)) {
    return { ok: false, error: "level_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    if (isJpVocabWordReviewLocked(devWords[idx])) {
      return { ok: false, error: "review_locked" };
    }
    const { word: updated } = applyJpVocabReview(devWords[idx], level);
    devWords[idx] = updated;
    devDailyDisplayOrder = markJpVocabRoundChecked(devDailyDisplayOrder, wordId);

    const sharedByTrim = (options?.sharedBy || "").trim();
    const shouldShare = Boolean(options?.shareToStudy && sharedByTrim);
    let shared = false;
    let shared_new = false;
    if (shouldShare) {
      const today = beijingDateString();
      const already = devShared.some(
        (s) => s.share_date === today && s.word_id === wordId
      );
      shared = already;
      if (!already) {
        const ts = nowIso();
        devShared.push({
          id: devSharedNextId++,
          word_id: wordId,
          shared_by: sharedByTrim,
          shared_at: ts,
          share_date: today,
          auto_marked_level: null,
        });
        shared = true;
        shared_new = true;
      }
    }

    if (shared_new) {
      invalidateJpVocabSharedTodayCache();
    }

    return { ok: true, word: updated, shared, shared_new };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };

  const current = mapRow(row);
  if (isJpVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }
  const { word: updated } = applyJpVocabReview(current, level);
  const ts = updated.updated_at;
  const today = beijingDateString();
  const sharedByTrim = (options?.sharedBy || "").trim();
  const shouldShare = Boolean(options?.shareToStudy && sharedByTrim);
  const alreadySharedToday =
    shouldShare && (await isJpVocabWordSharedToday(db, wordId));

  const batchStmts = [
    db
      .prepare(
        `UPDATE jp_vocab_word
       SET cnt_very = ?1,
           cnt_normal = ?2,
           cnt_weak = ?3,
           today_check_count = ?4,
           today_check_date = ?5,
           last_review_level = ?6,
           last_review_at = ?7,
           updated_at = ?8
       WHERE id = ?9`
      )
      .bind(
        updated.cnt_very,
        updated.cnt_normal,
        updated.cnt_weak,
        updated.today_check_count,
        updated.today_check_date,
        updated.last_review_level,
        updated.last_review_at,
        updated.updated_at,
        wordId
      ),
  ];

  if (shouldShare && !alreadySharedToday) {
    batchStmts.push(
      db
        .prepare(
          `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
       VALUES (?1, ?2, ?3, ?4, NULL)`
        )
        .bind(wordId, sharedByTrim, ts, today)
    );
  }

  const batchResults = await db.batch(batchStmts);

  if (!batchResults[0]?.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  let shared = false;
  let shared_new = false;
  if (shouldShare) {
    shared_new = !alreadySharedToday;
    shared = shared_new || alreadySharedToday;
  }

  await markJpVocabWordRoundChecked(db, wordId);

  if (shared_new) {
    invalidateJpVocabSharedTodayCache();
  }

  return { ok: true, word: updated, shared, shared_new };
}

export type DeleteJpVocabWordsResult =
  | {
      ok: true;
      deleted: number;
      words: JpVocabWord[];
      display_order: JpVocabDailyDisplayOrder;
    }
  | { ok: false; error: string };

/** 管理员删除词条（按 id） */
/**
 * 删词前清子表。D1 上仅靠 ON DELETE CASCADE 常会报
 * FOREIGN KEY constraint failed（词条已共享/带读/复习时尤甚）。
 */
async function deleteJpVocabWordDependentRows(
  db: D1Database,
  ids: number[]
): Promise<void> {
  if (!ids.length) return;

  await ensureJpVocabSharedSchema(db);
  await ensureJpVocabReviewDoneSchema(db);
  await ensureJpVocabCoachSchema(db);

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  await db.batch([
    db
      .prepare(`DELETE FROM jp_vocab_shared WHERE word_id IN (${placeholders})`)
      .bind(...ids),
    db
      .prepare(
        `DELETE FROM jp_vocab_review_done WHERE word_id IN (${placeholders})`
      )
      .bind(...ids),
    db
      .prepare(
        `DELETE FROM jp_vocab_coach_item WHERE word_id IN (${placeholders})`
      )
      .bind(...ids),
  ]);
  invalidateJpVocabSharedTodayCache();
}

async function clearJpVocabTeacherQuizLiveIfDeleted(
  db: D1Database,
  deletedIds: Set<number>
): Promise<void> {
  if (!deletedIds.size) return;
  const live = await getJpVocabTeacherQuizLive(db);
  if (live.word_id != null && deletedIds.has(live.word_id)) {
    await setJpVocabTeacherQuizLiveWord(db, null);
  }
}

export async function deleteJpVocabWordsByIds(
  db: D1Database,
  wordIds: number[]
): Promise<DeleteJpVocabWordsResult> {
  const ids = [
    ...new Set(
      wordIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) {
    return { ok: false, error: "word_ids_empty" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);
  const idSet = new Set(ids);

  if (devStoreEnabled) {
    let deleted = 0;
    for (let i = devWords.length - 1; i >= 0; i--) {
      if (idSet.has(devWords[i].id)) {
        devWords.splice(i, 1);
        deleted++;
      }
    }
    for (let i = devShared.length - 1; i >= 0; i--) {
      if (idSet.has(devShared[i].word_id)) {
        devShared.splice(i, 1);
      }
    }
    if (deleted === 0) {
      return { ok: false, error: "not_found" };
    }
    invalidateJpVocabSharedTodayCache();
    await clearJpVocabTeacherQuizLiveIfDeleted(db, idSet);
    const words = [...devWords];
    let display_order = await ensureJpVocabDailyDisplayOrder(db, words);
    const validIds = new Set(words.map((w) => w.id));
    const nextIds = display_order.ids.filter((id) => validIds.has(id));
    const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
      validIds.has(id)
    );
    if (
      nextIds.length !== display_order.ids.length ||
      round_checked_ids.length !== (display_order.round_checked_ids ?? []).length
    ) {
      display_order = { ...display_order, ids: nextIds, round_checked_ids };
      await saveJpVocabDailyDisplayOrder(db, display_order);
    }
    return { ok: true, deleted, words, display_order };
  }

  await deleteJpVocabWordDependentRows(db, ids);

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(`DELETE FROM jp_vocab_word WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();

  const deleted = Number(result.meta?.changes ?? 0);
  if (deleted === 0) {
    return { ok: false, error: "not_found" };
  }

  await clearJpVocabTeacherQuizLiveIfDeleted(db, idSet);

  const words = await listJpVocabWords(db);
  let display_order = await ensureJpVocabDailyDisplayOrder(db, words);
  const validIds = new Set(words.map((w) => w.id));
  const nextIds = display_order.ids.filter((id) => validIds.has(id));
  const round_checked_ids = (display_order.round_checked_ids ?? []).filter((id) =>
    validIds.has(id)
  );
  if (
    nextIds.length !== display_order.ids.length ||
    round_checked_ids.length !== (display_order.round_checked_ids ?? []).length
  ) {
    display_order = { ...display_order, ids: nextIds, round_checked_ids };
    await saveJpVocabDailyDisplayOrder(db, display_order);
  }

  // 今日抽查池里若仍挂着已删 id，重算落库，避免老师端继续操作幽灵词条
  const visible = await getJpVocabTeacherVisibleLimit(db);
  const prunedVisible = materializeJpVocabTeacherVisibleLimit(
    visible,
    display_order,
    words
  );
  if (teacherVisibleLimitNeedsPersist(visible, prunedVisible)) {
    await saveJpVocabTeacherVisibleLimit(db, prunedVisible);
  }

  return { ok: true, deleted, words, display_order };
}

export type ResetJpVocabReviewsResult =
  | {
      ok: true;
      words: JpVocabWord[];
      display_order: JpVocabDailyDisplayOrder;
      teacher_visible_limit: JpVocabTeacherVisibleLimit;
    }
  | { ok: false; error: string };

export async function resetAllJpVocabReviews(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
  await seedIfEmpty(db);
  const ts = nowIso();

  if (devStoreEnabled) {
    for (let i = 0; i < devWords.length; i++) {
      devWords[i] = {
        ...devWords[i],
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        last_review_level: null,
        last_review_at: null,
        updated_at: ts,
      };
    }
    const words = sortJpVocabWords(devWords);
    devDailyDisplayOrder = await refreshJpVocabDailyDisplayOrder(db, words);
    const teacher_visible_limit = await getJpVocabTeacherVisibleLimit(db);
    return { ok: true, words, display_order: devDailyDisplayOrder, teacher_visible_limit };
  }

  await db
    .prepare(
      `UPDATE jp_vocab_word
       SET cnt_very = 0, cnt_normal = 0, cnt_weak = 0,
           today_check_count = 0, today_check_date = NULL,
           last_review_level = NULL, last_review_at = NULL,
           updated_at = ?1`
    )
    .bind(ts)
    .run();

  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  const teacher_visible_limit = await getJpVocabTeacherVisibleLimit(db);
  return { ok: true, words, display_order, teacher_visible_limit };
}

export async function resetTodayJpVocabRound(
  db: D1Database
): Promise<ResetJpVocabReviewsResult> {
  await seedIfEmpty(db);
  const words = await listJpVocabWords(db);
  const display_order = await refreshJpVocabDailyDisplayOrder(db, words);
  const raw = await readJpVocabTeacherVisibleLimitRaw(db);
  const today = beijingDateString();
  const current = normalizeJpVocabTeacherVisibleLimit(raw);
  const teacher_visible_limit = await saveJpVocabTeacherVisibleLimit(
    db,
    applyJpVocabQuizTargetVisiblePlan(
      {
        ...current,
        date: today,
        quiz_target: current.quiz_target,
      },
      display_order,
      words
    )
  );
  return { ok: true, words, display_order, teacher_visible_limit };
}

export type UploadJpVocabWordsResult =
  | { ok: true; added: number; skipped: number; total: number }
  | { ok: false; error: string };

export async function uploadJpVocabWords(
  db: D1Database,
  words: JpVocabUploadInput[],
  replace = false,
  refs: JpVocabRefUploadInput[] = []
): Promise<UploadJpVocabWordsResult> {
  const cleaned: Array<{
    word: string;
    reading: string | null;
    meaning: string | null;
    kind: JpVocabKind;
    ref_key: string | null;
  }> = [];
  for (const w of words) {
    const word = normalizeWord(w.word);
    if (!word) continue;
    const kind = normalizeKind(w.kind);
    cleaned.push({
      word,
      reading: await resolveJpVocabReadingIfMissing(
        word,
        kind,
        (w.reading || "").trim() || null
      ),
      meaning: (w.meaning || "").trim() || null,
      kind,
      ref_key: w.ref_key ? normalizeJpVocabRefKey(w.ref_key) || null : null,
    });
  }

  if (!cleaned.length) {
    return { ok: false, error: "words_empty" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  if (refs.length) {
    await upsertJpVocabRefMetadata(db, refs);
  }

  if (devStoreEnabled) {
    if (replace) {
      devWords.length = 0;
      devNextId = 1;
    }
    let added = 0;
    let skipped = 0;
    for (const item of cleaned) {
      const exists = devWords.some((w) => w.word === item.word);
      if (exists && !replace) {
        skipped++;
        continue;
      }
      devWords.push({
        id: devNextId++,
        word: item.word,
        reading: item.reading,
        meaning: item.meaning,
        pos: null,
        kind: item.kind,
        ref_key: item.ref_key,
        cnt_very: 0,
        cnt_normal: 0,
        cnt_weak: 0,
        today_check_count: 0,
        today_check_date: null,
        class_notes: null,
        created_at: ts,
        updated_at: ts,
      });
      added++;
    }
    return { ok: true, added, skipped, total: devWords.length };
  }

  if (replace) {
    // 全量替换：先清子表，再删词（勿只 DELETE jp_vocab_word，D1 外键会炸）
    await ensureJpVocabSharedSchema(db);
    await ensureJpVocabReviewDoneSchema(db);
    await ensureJpVocabCoachSchema(db);
    await db.batch([
      db.prepare("DELETE FROM jp_vocab_shared"),
      db.prepare("DELETE FROM jp_vocab_review_done"),
      db.prepare("DELETE FROM jp_vocab_coach_item"),
      db.prepare("DELETE FROM jp_vocab_word"),
    ]);
    invalidateJpVocabSharedTodayCache();
  }

  let added = 0;
  let skipped = 0;
  const existing = replace
    ? new Set<string>()
    : new Set(
        (
          await db
            .prepare("SELECT word FROM jp_vocab_word")
            .all<{ word: string }>()
        ).results?.map((r) => r.word) ?? []
      );

  const inserts: D1PreparedStatement[] = [];
  for (const item of cleaned) {
    if (existing.has(item.word)) {
      skipped++;
      continue;
    }
    existing.add(item.word);
    inserts.push(
      db
        .prepare(
          `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, NULL, ?6, ?6)`
        )
        .bind(
          item.word,
          item.reading,
          item.meaning,
          item.kind,
          item.ref_key,
          ts
        )
    );
    added++;
  }

  if (inserts.length) {
    await db.batch(inserts);
  }

  const totalRow = await db
    .prepare("SELECT COUNT(*) AS c FROM jp_vocab_word")
    .first<{ c: number }>();

  return {
    ok: true,
    added,
    skipped,
    total: totalRow?.c ?? 0,
  };
}

export type AddJpVocabWordResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

export async function addJpVocabWord(
  db: D1Database,
  input: JpVocabUploadInput
): Promise<AddJpVocabWordResult> {
  const lemma = normalizeJpVocabNaAdjStoredEntry(
    input.word,
    (input.reading || "").trim() || null
  );
  const word = lemma.word;
  if (!word) return { ok: false, error: "word_required" };

  const kind = normalizeKind(input.kind);
  const exampleSentences = (input.example_sentences || "").trim() || null;
  const meaning = (input.meaning || "").trim() || null;
  const item = {
    word,
    reading: await resolveJpVocabReadingIfMissing(
      word,
      kind,
      lemma.reading
    ),
    meaning,
    meaning_source: meaning ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL : null,
    kind,
    ref_key: input.ref_key
      ? normalizeJpVocabRefKey(input.ref_key) || null
      : null,
    class_notes: (input.class_notes || "").trim() || null,
    example_sentences: exampleSentences,
    example_sentences_source: exampleSentences
      ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
      : null,
  };

  await seedIfEmpty(db);
  // 入库标记用北京时间，供「今日新词次日置顶」判断（created_at 前 10 位）
  const ts = beijingDateTimeString();

  if (devStoreEnabled) {
    if (devWords.some((w) => w.word === item.word)) {
      return { ok: false, error: "word_duplicate" };
    }
    const created: JpVocabWord = {
      id: devNextId++,
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      pos: null,
      kind: item.kind,
      ref_key: item.ref_key,
      cnt_very: 0,
      cnt_normal: 0,
      cnt_weak: 0,
      today_check_count: 0,
      today_check_date: null,
      class_notes: item.class_notes,
      example_sentences: item.example_sentences,
      example_sentences_source: item.example_sentences_source,
      meaning_source: item.meaning_source,
      created_at: ts,
      updated_at: ts,
    };
    devWords.push(created);
    const today = beijingDateString();
    if (
      !devDailyDisplayOrder.ids.length ||
      devDailyDisplayOrder.date !== today
    ) {
      devDailyDisplayOrder = await ensureJpVocabDailyDisplayOrder(db, devWords);
    } else {
      devDailyDisplayOrder = appendJpVocabDailyDisplayOrderId(
        devDailyDisplayOrder,
        created.id
      );
    }
    return { ok: true, word: created };
  }

  const existing = await db
    .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 LIMIT 1")
    .bind(item.word)
    .first<{ id: number }>();

  if (existing) return { ok: false, error: "word_duplicate" };

  const insertResult = await db
    .prepare(
      `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, example_sentences, example_sentences_source, meaning_source, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0, 0, NULL, ?6, ?7, ?8, ?9, ?10, ?10)`
    )
    .bind(
      item.word,
      item.reading,
      item.meaning,
      item.kind,
      item.ref_key,
      item.class_notes,
      item.example_sentences,
      item.example_sentences_source,
      item.meaning_source,
      ts
    )
    .run();

  const newId = insertResult.meta?.last_row_id;
  if (!newId) return { ok: false, error: "insert_failed" };

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(newId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "insert_failed" };

  const created = mapRow(row);
  await appendJpVocabWordToDailyDisplayOrder(db, created.id);
  return { ok: true, word: created };
}

/** 按图片内容 hash 去重：相同字节共用 ref_key，已存在则跳过上传 */
export async function getOrUploadJpVocabRefByContent(
  env: CloudflareEnv,
  db: D1Database,
  bytes: ArrayBuffer,
  mediaType: JpVocabMediaType,
  title: string | null
): Promise<{ ref: JpVocabRef; deduped: boolean }> {
  const refKey = await jpVocabRefKeyFromBytes(bytes);
  const existing = await getJpVocabRef(db, refKey);

  if (existing) {
    const hasFile = await jpVocabRefFileExists(
      env,
      refKey,
      existing.media_type,
      existing.r2_key
    );
    if (hasFile) {
      return { ref: existing, deduped: true };
    }
  }

  const stored = await putJpVocabRefFile(env, refKey, mediaType, bytes);
  const ref = await saveJpVocabRefFileMeta(
    db,
    refKey,
    title,
    mediaType,
    stored.r2_key
  );
  return { ref, deduped: false };
}

/** 新课标记完成时：仅写入尚不存在的词条（已存在则跳过）并带上教案 ref_key */
export async function upsertJpVocabFromLesson(
  db: D1Database,
  items: {
    word: string;
    kind: JpVocabKind;
    ref_key: string | null;
    meaning?: string | null;
    example_sentences?: string | null;
  }[],
  refs: JpVocabRefUploadInput[] = []
): Promise<void> {
  if (!items.length) return;
  if (refs.length) await upsertJpVocabRefMetadata(db, refs);

  // 新课「已完成」同步：created_at 记北京时间，今天不进抽查池，次日凌晨置顶
  const ts = beijingDateTimeString();
  let addedNew = false;

  if (devStoreEnabled) {
    for (const item of items) {
      const word = normalizeWord(item.word);
      if (!word) continue;
      const kind = normalizeKind(item.kind);
      const refKey = item.ref_key;
      const meaning = (item.meaning || "").trim() || null;
      const exampleSentences = (item.example_sentences || "").trim() || null;
      const idx = devWords.findIndex((w) => w.word === word);
      if (idx >= 0) {
        const cur = devWords[idx];
        const nextMeaning =
          meaning && !cur.meaning?.trim() ? meaning : cur.meaning;
        const nextExamples =
          exampleSentences && !cur.example_sentences?.trim()
            ? exampleSentences
            : cur.example_sentences ?? null;
        if (nextMeaning !== cur.meaning || nextExamples !== (cur.example_sentences ?? null)) {
          devWords[idx] = {
            ...cur,
            meaning: nextMeaning,
            example_sentences: nextExamples,
            updated_at: ts,
          };
        }
        continue;
      }
      addedNew = true;
      const createdId = devNextId++;
      devWords.push({
          id: createdId,
          word,
          reading: null,
          meaning,
          pos: null,
          kind,
          ref_key: refKey,
          cnt_very: 0,
          cnt_normal: 0,
          cnt_weak: 0,
          today_check_count: 0,
          today_check_date: null,
          class_notes: null,
          example_sentences: exampleSentences,
          created_at: ts,
          updated_at: ts,
        });
      const today = beijingDateString();
      if (
        devDailyDisplayOrder.date === today &&
        devDailyDisplayOrder.ids.length > 0
      ) {
        devDailyDisplayOrder = appendJpVocabDailyDisplayOrderId(
          devDailyDisplayOrder,
          createdId
        );
      }
    }
    if (addedNew) {
      await ensureJpVocabDailyDisplayOrder(db, devWords);
    }
    return;
  }

  for (const item of items) {
    const word = normalizeWord(item.word);
    if (!word) continue;
    const kind = normalizeKind(item.kind);
    const refKey = item.ref_key;
    const meaning = (item.meaning || "").trim() || null;
    const exampleSentences = (item.example_sentences || "").trim() || null;

    const existing = await db
      .prepare(
        `SELECT id, meaning, example_sentences FROM jp_vocab_word WHERE word = ?1 LIMIT 1`
      )
      .bind(word)
      .first<{ id: number; meaning: string | null; example_sentences: string | null }>();

    if (existing) {
      let nextMeaning = existing.meaning;
      let nextExamples = existing.example_sentences;
      let changed = false;
      if (meaning && !(existing.meaning || "").trim()) {
        nextMeaning = meaning;
        changed = true;
      }
      if (exampleSentences && !(existing.example_sentences || "").trim()) {
        nextExamples = exampleSentences;
        changed = true;
      }
      if (changed) {
        await db
          .prepare(
            `UPDATE jp_vocab_word
             SET meaning = ?1, example_sentences = ?2, updated_at = ?3
             WHERE id = ?4`
          )
          .bind(nextMeaning, nextExamples, ts, existing.id)
          .run();
      }
      continue;
    }

    addedNew = true;
    await db
      .prepare(
        `INSERT INTO jp_vocab_word (word, reading, meaning, kind, ref_key, cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date, class_notes, example_sentences, created_at, updated_at)
         VALUES (?1, NULL, ?2, ?3, ?4, 0, 0, 0, 0, NULL, NULL, ?5, ?6, ?6)`
      )
      .bind(word, meaning, kind, refKey, exampleSentences, ts)
      .run();
  }

  if (addedNew) {
    const words = await listJpVocabWords(db);
    await ensureJpVocabDailyDisplayOrder(db, words);
  }
}

function combineLessonNotes(notes: { body: string }[]): string | null {
  const parts = notes.map((n) => n.body.trim()).filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/** 新课已完成时：把 jp_lesson_note 同步到 jp_vocab_word.class_notes */
export async function syncLessonNotesToVocab(
  db: D1Database,
  lesson: JpLessonRecord
): Promise<void> {
  const items = parseLessonContent(lesson.content);
  if (!items.length) return;

  const notes = await listJpLessonNotesByLessonId(db, lesson.id);
  const refKey = lesson.ref_key;
  const kind = normalizeKind(lesson.kind);
  const ts = nowIso();

  if (devStoreEnabled) {
    for (const item of items) {
      const combined = combineLessonNotes(
        notes.filter((n) => n.item_word === item)
      );
      const idx = devWords.findIndex((w) => {
        if (w.word !== item) return false;
        if (refKey) return w.ref_key === refKey;
        return w.ref_key == null && w.kind === kind;
      });
      if (idx >= 0) {
        devWords[idx] = {
          ...devWords[idx],
          class_notes: combined,
          updated_at: ts,
        };
      }
    }
    return;
  }

  for (const item of items) {
    const combined = combineLessonNotes(
      notes.filter((n) => n.item_word === item)
    );

    if (refKey) {
      await db
        .prepare(
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key = ?4`
        )
        .bind(combined, ts, item, refKey)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2
           WHERE word = ?3 AND ref_key IS NULL AND kind = ?4`
        )
        .bind(combined, ts, item, kind)
        .run();
    }
  }
}

/** 新课教案 ref 变更时，同步更新已写入单词复习的 ref_key */
export async function updateJpVocabWordsRefKey(
  db: D1Database,
  words: string[],
  kind: JpVocabKind,
  oldRefKey: string,
  newRefKey: string
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  const fromKey = normalizeJpVocabRefKey(oldRefKey);
  const toKey = normalizeJpVocabRefKey(newRefKey);
  if (!cleaned.length || !fromKey || !toKey || fromKey === toKey) return;

  const normalizedKind = normalizeKind(kind);
  const ts = nowIso();

  if (devStoreEnabled) {
    for (let i = 0; i < devWords.length; i++) {
      const w = devWords[i];
      if (!cleaned.includes(w.word) || w.ref_key !== fromKey) continue;
      devWords[i] = { ...w, ref_key: toKey, updated_at: ts };
    }
    return;
  }

  for (const word of cleaned) {
    await db
      .prepare(
        `UPDATE jp_vocab_word SET ref_key = ?1, updated_at = ?2
         WHERE word = ?3 AND ref_key = ?4 AND kind = ?5`
      )
      .bind(toKey, ts, word, fromKey, normalizedKind)
      .run();
  }
}

/** 新课改回未完成时：移除本课同步的词条（按 ref_key 匹配） */
export async function removeJpVocabLessonWords(
  db: D1Database,
  words: string[],
  refKey: string | null,
  kind: JpVocabKind
): Promise<void> {
  const cleaned = words.map(normalizeWord).filter(Boolean);
  if (!cleaned.length) return;

  const normalizedKind = normalizeKind(kind);

  if (devStoreEnabled) {
    const removeIds: number[] = [];
    for (let i = devWords.length - 1; i >= 0; i--) {
      const w = devWords[i];
      if (!cleaned.includes(w.word)) continue;
      if (refKey) {
        if (w.ref_key === refKey) removeIds.push(w.id);
      } else if (w.ref_key == null && w.kind === normalizedKind) {
        removeIds.push(w.id);
      }
    }
    if (removeIds.length) {
      await deleteJpVocabWordsByIds(db, removeIds);
    }
    return;
  }

  const idSet = new Set<number>();
  for (const word of cleaned) {
    const rows = refKey
      ? await db
          .prepare(
            `SELECT id FROM jp_vocab_word WHERE word = ?1 AND ref_key = ?2`
          )
          .bind(word, refKey)
          .all<{ id: number }>()
      : await db
          .prepare(
            `SELECT id FROM jp_vocab_word WHERE word = ?1 AND ref_key IS NULL AND kind = ?2`
          )
          .bind(word, normalizedKind)
          .all<{ id: number }>();
    for (const row of rows.results ?? []) {
      const id = Number(row.id);
      if (Number.isInteger(id) && id > 0) idSet.add(id);
    }
  }

  if (idSet.size) {
    await deleteJpVocabWordsByIds(db, [...idSet]);
  }
}

function lessonMatchesVocabWord(lesson: JpLessonRecord, word: JpVocabWord): boolean {
  if (!lesson.completed) return false;
  const items = parseLessonContent(lesson.content);
  if (!items.includes(word.word)) return false;
  if (word.ref_key) return lesson.ref_key === word.ref_key;
  return lesson.ref_key == null && lesson.kind === word.kind;
}

export type UpdateJpVocabClassNotesResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

export async function getJpVocabClassNotes(
  db: D1Database,
  wordId: number
): Promise<UpdateJpVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  // 按需读备注：勿 seedIfEmpty。须用 WORD_SELECT（含 example_sentences / mnemonic）：
  // 学生端 flashcard 会用本接口整词覆盖 lite 列表项；漏字段会冲掉老师卡已有的例句。
  await ensureVocabWordSchema(db);

  if (devStoreEnabled) {
    const word = devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    return { ok: true, word };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

/** 更新单词复习页课堂笔记，并同步回关联的新课笔记 */
export async function updateJpVocabClassNotes(
  db: D1Database,
  wordId: number,
  classNotes: string | null,
  operatorUsername: string
): Promise<UpdateJpVocabClassNotesResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const normalized = (classNotes || "").trim() || null;
  const ts = nowIso();

  let word: JpVocabWord | undefined;

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      class_notes: normalized,
      updated_at: ts,
    };
    word = devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word SET class_notes = ?1, updated_at = ?2 WHERE id = ?3`
      )
      .bind(normalized, ts, wordId)
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    word = mapRow(row);
  }

  const lessons = await listJpLessons(db);
  for (const lesson of lessons) {
    if (!lessonMatchesVocabWord(lesson, word)) continue;
    const sync = await replaceLessonNotesForItem(
      db,
      lesson.id,
      word.word,
      normalized,
      operatorUsername
    );
    if (!sync.ok) return sync;
  }

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word };
}

export type UpdateJpVocabWordFieldsResult =
  | { ok: true; word: JpVocabWord }
  | { ok: false; error: string };

/** 更新单词表中的词条文本、释义或词性 */
export async function updateJpVocabWordFields(
  db: D1Database,
  wordId: number,
  fields: { word?: string; meaning?: string | null; pos?: string | null }
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

  if (devStoreEnabled) {
    current = devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const lemma =
    fields.word !== undefined
      ? normalizeJpVocabNaAdjStoredEntry(fields.word, current.reading)
      : { word: current.word, reading: current.reading };
  const nextWord = lemma.word;
  const nextReading = lemma.reading;
  const nextMeaning =
    fields.meaning !== undefined
      ? (fields.meaning || "").trim() || null
      : current.meaning;
  let nextMeaningSource = current.meaning_source ?? null;
  if (fields.meaning !== undefined) {
    const prevMeaning = current.meaning ?? null;
    if (nextMeaning !== prevMeaning) {
      nextMeaningSource = nextMeaning
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextPos =
    fields.pos !== undefined
      ? (fields.pos || "").trim() || null
      : current.pos;

  if (fields.word !== undefined && !nextWord) {
    return { ok: false, error: "word_required" };
  }

  if (nextWord !== current.word) {
    if (devStoreEnabled) {
      if (devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      word: nextWord,
      reading: nextReading,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      updated_at: ts,
    };
    return { ok: true, word: devWords[idx] };
  }

  const result = await db
    .prepare(
      `UPDATE jp_vocab_word SET word = ?1, reading = ?2, meaning = ?3, meaning_source = ?4, pos = ?5, updated_at = ?6 WHERE id = ?7`
    )
    .bind(
      nextWord,
      nextReading,
      nextMeaning,
      nextMeaningSource,
      nextPos,
      ts,
      wordId
    )
    .run();

  if (!result.meta?.changes) {
    return { ok: false, error: "not_found" };
  }

  const row = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();

  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, word: mapRow(row) };
}

export type JpVocabWordEntryInput = {
  kind?: JpVocabKind;
  word?: string;
  reading?: string | null;
  meaning?: string | null;
  pos?: string | null;
  class_notes?: string | null;
  mnemonic?: string | null;
  example_sentences?: string | null;
  example_sentences_source?: string | null;
  meaning_source?: string | null;
};

/** 一次性更新词条可编辑字段，并同步备注到关联新课 */
export async function updateJpVocabWordEntry(
  db: D1Database,
  wordId: number,
  input: JpVocabWordEntryInput,
  operatorUsername: string
): Promise<UpdateJpVocabWordFieldsResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  const ts = nowIso();

  let current: JpVocabWord | undefined;

  if (devStoreEnabled) {
    current = devWords.find((w) => w.id === wordId);
  } else {
    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();
    if (row) current = mapRow(row);
  }

  if (!current) return { ok: false, error: "not_found" };

  const nextKind =
    input.kind !== undefined ? normalizeKind(input.kind) : current.kind;
  const wordRaw =
    input.word !== undefined ? input.word : current.word;
  const readingRaw =
    nextKind === "grammar"
      ? null
      : input.reading !== undefined
        ? (input.reading || "").trim() || null
        : current.reading;
  // 词条变更或读音变更时都走な形容词剥「だ」；仅改其它字段时保持现值
  const lemma =
    input.word !== undefined || input.reading !== undefined
      ? normalizeJpVocabNaAdjStoredEntry(wordRaw, readingRaw)
      : { word: current.word, reading: current.reading };
  const nextWord = lemma.word;
  const nextReading = nextKind === "grammar" ? null : lemma.reading;
  const nextMeaning =
    input.meaning !== undefined
      ? (input.meaning || "").trim() || null
      : current.meaning;
  let nextMeaningSource = current.meaning_source ?? null;
  if (input.meaning_source !== undefined) {
    nextMeaningSource = normalizeJpVocabExampleSentencesSource(input.meaning_source);
  } else if (input.meaning !== undefined) {
    const prevMeaning = current.meaning ?? null;
    if (nextMeaning !== prevMeaning) {
      nextMeaningSource = nextMeaning
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }
  const nextPos =
    input.pos !== undefined
      ? (input.pos || "").trim() || null
      : current.pos;
  const nextNotes =
    input.class_notes !== undefined
      ? (input.class_notes || "").trim() || null
      : current.class_notes;
  const nextMnemonic =
    input.mnemonic !== undefined
      ? (input.mnemonic || "").trim() || null
      : current.mnemonic;
  const nextExampleSentences =
    input.example_sentences !== undefined
      ? (input.example_sentences || "").trim() || null
      : current.example_sentences ?? null;
  let nextExampleSource = current.example_sentences_source ?? null;
  if (input.example_sentences_source !== undefined) {
    nextExampleSource = normalizeJpVocabExampleSentencesSource(
      input.example_sentences_source
    );
  } else if (input.example_sentences !== undefined) {
    const prevExamples = current.example_sentences ?? null;
    if (nextExampleSentences !== prevExamples) {
      nextExampleSource = nextExampleSentences
        ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
        : null;
    }
  }

  if (!nextWord) return { ok: false, error: "word_required" };

  if (nextWord !== current.word) {
    if (devStoreEnabled) {
      if (devWords.some((w) => w.id !== wordId && w.word === nextWord)) {
        return { ok: false, error: "word_duplicate" };
      }
    } else {
      const dup = await db
        .prepare("SELECT id FROM jp_vocab_word WHERE word = ?1 AND id != ?2 LIMIT 1")
        .bind(nextWord, wordId)
        .first<{ id: number }>();
      if (dup) return { ok: false, error: "word_duplicate" };
    }
  }

  if (devStoreEnabled) {
    const idx = devWords.findIndex((w) => w.id === wordId);
    if (idx < 0) return { ok: false, error: "not_found" };
    devWords[idx] = {
      ...devWords[idx],
      kind: nextKind,
      word: nextWord,
      reading: nextReading,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: nextPos,
      class_notes: nextNotes,
      mnemonic: nextMnemonic,
      example_sentences: nextExampleSentences,
      example_sentences_source: nextExampleSource,
      updated_at: ts,
    };
    current = devWords[idx];
  } else {
    const result = await db
      .prepare(
        `UPDATE jp_vocab_word
         SET kind = ?1, word = ?2, reading = ?3, meaning = ?4, meaning_source = ?5, pos = ?6, class_notes = ?7, mnemonic = ?8, example_sentences = ?9, example_sentences_source = ?10, updated_at = ?11
         WHERE id = ?12`
      )
      .bind(
        nextKind,
        nextWord,
        nextReading,
        nextMeaning,
        nextMeaningSource,
        nextPos,
        nextNotes,
        nextMnemonic,
        nextExampleSentences,
        nextExampleSource,
        ts,
        wordId
      )
      .run();

    if (!result.meta?.changes) {
      return { ok: false, error: "not_found" };
    }

    const row = await db
      .prepare(`${WORD_SELECT} WHERE id = ?1`)
      .bind(wordId)
      .first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    current = mapRow(row);
  }

  if (input.class_notes !== undefined) {
    const lessons = await listJpLessons(db);
    for (const lesson of lessons) {
      if (!lessonMatchesVocabWord(lesson, current)) continue;
      const sync = await replaceLessonNotesForItem(
        db,
        lesson.id,
        current.word,
        nextNotes,
        operatorUsername
      );
      if (!sync.ok) return sync;
    }
  }

  return { ok: true, word: current };
}

async function readJpVocabDailyDisplayOrderRaw(
  db: D1Database
): Promise<JpVocabDailyDisplayOrder | null> {
  if (devStoreEnabled) {
    return devDailyDisplayOrder.ids.length ? devDailyDisplayOrder : null;
  }

  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY)
    .first<{ value: string }>();

  if (!row?.value) return null;

  try {
    const parsed = JSON.parse(row.value) as Partial<JpVocabDailyDisplayOrder>;
    if (!parsed.date || !Array.isArray(parsed.ids)) return null;
    const order: JpVocabDailyDisplayOrder = {
      date: parsed.date,
      ids: parsed.ids.map((id) => Number(id)).filter((id) => id > 0),
    };
    if (Object.prototype.hasOwnProperty.call(parsed, "round_checked_ids")) {
      order.round_checked_ids = normalizeJpVocabRoundCheckedIds(
        parsed.round_checked_ids
      );
    }
    return order;
  } catch {
    return null;
  }
}

async function saveJpVocabDailyDisplayOrder(
  db: D1Database,
  order: JpVocabDailyDisplayOrder
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = order;
    return;
  }

  await ensureJpVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(JP_VOCAB_DAILY_DISPLAY_ORDER_KEY, JSON.stringify(order), nowIso())
    .run();
}

/** 当日已有顺序则沿用（仅合并增删词条）；跨日则按抽查优先级重排 */
export async function ensureJpVocabDailyDisplayOrder(
  db: D1Database,
  words: JpVocabWord[]
): Promise<JpVocabDailyDisplayOrder> {
  const today = beijingDateString();
  const stored = await readJpVocabDailyDisplayOrderRaw(db);

  if (stored?.date === today && stored.ids.length > 0) {
    const merged = mergeJpVocabDailyDisplayOrder(stored.ids, words);
    const round_checked_ids = resolveJpVocabRoundCheckedIds(
      stored.round_checked_ids,
      words
    );
    const prevChecked = normalizeJpVocabRoundCheckedIds(stored.round_checked_ids);
    const roundCheckedChanged =
      prevChecked.length !== round_checked_ids.length ||
      prevChecked.some((id) => !round_checked_ids.includes(id));
    const order = {
      date: today,
      ids: merged,
      round_checked_ids,
    };
    if (
      merged.length !== stored.ids.length ||
      merged.some((id, i) => id !== stored.ids[i]) ||
      roundCheckedChanged
    ) {
      await saveJpVocabDailyDisplayOrder(db, order);
    }
    return order;
  }

  const order = {
    date: today,
    ids: computeJpVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  return order;
}

/** 强制按当前数据重算当日顺序（如今日重置 / 全部重置后） */
export async function refreshJpVocabDailyDisplayOrder(
  db: D1Database,
  words: JpVocabWord[]
): Promise<JpVocabDailyDisplayOrder> {
  const order = {
    date: beijingDateString(),
    ids: computeJpVocabDailyDisplayOrder(words),
    round_checked_ids: [] as number[],
  };
  await saveJpVocabDailyDisplayOrder(db, order);
  return order;
}

export async function markJpVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<void> {
  if (devStoreEnabled) {
    devDailyDisplayOrder = markJpVocabRoundChecked(devDailyDisplayOrder, wordId);
    return;
  }

  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[], round_checked_ids: [] as number[] };
  const next = markJpVocabRoundChecked(base, wordId);
  if ((next.round_checked_ids ?? []).length !== (base.round_checked_ids ?? []).length) {
    await saveJpVocabDailyDisplayOrder(db, next);
  }
}

export async function unmarkJpVocabWordRoundChecked(
  db: D1Database,
  wordId: number
): Promise<JpVocabDailyDisplayOrder | null> {
  if (devStoreEnabled) {
    const next = unmarkJpVocabRoundChecked(devDailyDisplayOrder, wordId);
    if (
      (next.round_checked_ids ?? []).length !==
      (devDailyDisplayOrder.round_checked_ids ?? []).length
    ) {
      devDailyDisplayOrder = next;
      return next;
    }
    return null;
  }

  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  const base =
    stored?.date === today
      ? stored
      : { date: today, ids: [] as number[], round_checked_ids: [] as number[] };
  const next = unmarkJpVocabRoundChecked(base, wordId);
  if ((next.round_checked_ids ?? []).length !== (base.round_checked_ids ?? []).length) {
    await saveJpVocabDailyDisplayOrder(db, next);
    return next;
  }
  return null;
}

export async function appendJpVocabWordToDailyDisplayOrder(
  db: D1Database,
  wordId: number
): Promise<void> {
  const stored = await readJpVocabDailyDisplayOrderRaw(db);
  const today = beijingDateString();
  // 跨日或空顺序：必须全量 ensure（从未抽查优先重排）。禁止写成 {date:today, ids:[新词]}，
  // 否则同日 merge 会把其余词条按任意顺序堆在后面，序号与今日池严重错位。
  if (!stored?.ids.length || stored.date !== today) {
    const words = await listJpVocabWords(db);
    await ensureJpVocabDailyDisplayOrder(db, words);
    return;
  }
  const next = appendJpVocabDailyDisplayOrderId(stored, wordId);
  if (next.ids.length !== stored.ids.length) {
    await saveJpVocabDailyDisplayOrder(db, next);
  }
}

async function ensureJpVocabSettingSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || jpVocabSettingSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  jpVocabSettingSchemaReady = true;
}

export async function getJpVocabDailyQuizStyle(
  db: D1Database
): Promise<JpVocabDailyQuizStyle> {
  if (devStoreEnabled) {
    return normalizeJpVocabDailyQuizStyle(devDailyQuizStyle);
  }

  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_DAILY_QUIZ_STYLE_KEY)
    .first<{ value: string }>();

  if (!row?.value) {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }

  try {
    return normalizeJpVocabDailyQuizStyle(
      JSON.parse(row.value) as Partial<JpVocabDailyQuizStyle>
    );
  } catch {
    return JP_VOCAB_DAILY_QUIZ_STYLE_DEFAULT;
  }
}

export async function setJpVocabDailyQuizStyle(
  db: D1Database,
  style: JpVocabDailyQuizStyle
): Promise<JpVocabDailyQuizStyle> {
  const normalized = normalizeJpVocabDailyQuizStyle(style);

  if (devStoreEnabled) {
    devDailyQuizStyle = normalized;
    return normalized;
  }

  await ensureJpVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(
      JP_VOCAB_DAILY_QUIZ_STYLE_KEY,
      JSON.stringify(normalized),
      nowIso()
    )
    .run();

  return normalized;
}

export async function getJpVocabTeacherVisibleLimit(
  db: D1Database
): Promise<JpVocabTeacherVisibleLimit> {
  if (devStoreEnabled) {
    return normalizeJpVocabTeacherVisibleLimit(devTeacherVisibleLimit);
  }

  const now = Date.now();
  if (
    teacherVisibleLimitReadCache &&
    now - teacherVisibleLimitReadCache.at < JP_VOCAB_SETTING_READ_CACHE_MS
  ) {
    const cached = teacherVisibleLimitReadCache.value;
    const today = beijingDateString();
    if (!cached.date || cached.date === today) {
      return cached;
    }
  }

  const raw = await readJpVocabTeacherVisibleLimitRaw(db);
  const normalized = normalizeJpVocabTeacherVisibleLimit(raw);
  const today = beijingDateString();
  if (raw?.date && raw.date !== today) {
    const rolled = await saveJpVocabTeacherVisibleLimit(db, {
      ...normalized,
      visible_ids: undefined,
    });
    teacherVisibleLimitReadCache = { at: now, value: rolled };
    return rolled;
  }
  teacherVisibleLimitReadCache = { at: now, value: normalized };
  return normalized;
}

async function readJpVocabTeacherVisibleLimitRaw(
  db: D1Database
): Promise<Partial<JpVocabTeacherVisibleLimit> | null> {
  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY)
    .first<{ value: string }>();

  if (!row?.value) return null;

  try {
    return JSON.parse(row.value) as Partial<JpVocabTeacherVisibleLimit>;
  } catch {
    return null;
  }
}

/** 读取老师可见批次；仅在目标数大于已生成池时重算并落库 */
export async function ensureJpVocabTeacherVisibleLimit(
  db: D1Database,
  ctx?: { words: JpVocabWord[]; displayOrder: JpVocabDailyDisplayOrder }
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const words = ctx?.words ?? (await listJpVocabWords(db));
  const displayOrder =
    ctx?.displayOrder ?? (await ensureJpVocabDailyDisplayOrder(db, words));
  if (
    !shouldMaterializeJpVocabTeacherVisibleLimit(current, {
      displayOrder,
      words,
    })
  ) {
    return current;
  }
  const materialized = materializeJpVocabTeacherVisibleLimit(
    current,
    displayOrder,
    words
  );
  if (!teacherVisibleLimitNeedsPersist(current, materialized)) {
    return materialized;
  }
  return saveJpVocabTeacherVisibleLimit(db, {
    ...materialized,
    quiz_target_adjusted_at: current.quiz_target_adjusted_at,
  });
}

function withJpVocabTargetAdjustmentMarker(
  materialized: JpVocabTeacherVisibleLimit,
  now = new Date()
): JpVocabTeacherVisibleLimit {
  return {
    ...materialized,
    quiz_target_adjusted_at: formatReviewIso(now),
  };
}

async function saveJpVocabTeacherVisibleLimit(
  db: D1Database,
  limit: JpVocabTeacherVisibleLimit
): Promise<JpVocabTeacherVisibleLimit> {
  const next = normalizeJpVocabTeacherVisibleLimit({
    ...limit,
    date: limit.date ?? beijingDateString(),
  });

  if (devStoreEnabled) {
    devTeacherVisibleLimit = next;
    return next;
  }

  await ensureJpVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(
      JP_VOCAB_TEACHER_VISIBLE_LIMIT_KEY,
      JSON.stringify(next),
      nowIso()
    )
    .run();

  teacherVisibleLimitReadCache = { at: Date.now(), value: next };
  return next;
}

export async function expandJpVocabTeacherVisibleLimit(
  db: D1Database,
  releaseCount: number
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const addCount = Math.max(1, Math.floor(releaseCount));
  const words = await listJpVocabWords(db);
  const displayOrder = await ensureJpVocabDailyDisplayOrder(db, words);

  const previousTotal = current.released_today ? current.release_count : 0;
  const newTotal = previousTotal + addCount;

  const draft: JpVocabTeacherVisibleLimit = {
    ...current,
    released_today: true,
    release_count: newTotal,
    excluded_batch_ids: [],
  };

  const materialized = materializeJpVocabTeacherVisibleLimit(
    draft,
    displayOrder,
    words
  );

  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }

  if (materialized.visible_ids.length < newTotal) {
    return saveJpVocabTeacherVisibleLimit(
      db,
      withJpVocabTargetAdjustmentMarker({
        ...materialized,
        release_count: materialized.visible_ids.length,
      })
    );
  }

  return saveJpVocabTeacherVisibleLimit(
    db,
    withJpVocabTargetAdjustmentMarker(materialized)
  );
}

export async function setJpVocabDailyQuizTarget(
  db: D1Database,
  targetCount: number,
  hideCheckedToday = false
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  const quiz_target = Math.min(Math.max(1, Math.floor(targetCount)), 999);
  const words = await listJpVocabWords(db);
  const displayOrder = await ensureJpVocabDailyDisplayOrder(db, words);

  const draft: JpVocabTeacherVisibleLimit = {
    ...current,
    quiz_target,
    hide_checked_today: hideCheckedToday,
  };

  const materialized = applyJpVocabQuizTargetVisiblePlan(
    draft,
    displayOrder,
    words
  );

  if (!materialized.visible_ids?.length) {
    throw new Error("no_release_candidates");
  }

  return saveJpVocabTeacherVisibleLimit(
    db,
    withJpVocabTargetAdjustmentMarker(materialized)
  );
}

/** 北京时间跨日清理时恢复老师默认可见序号 1–20，抽查目标恢复默认 20 */
export async function resetJpVocabTeacherVisibleLimit(
  db: D1Database
): Promise<JpVocabTeacherVisibleLimit> {
  const current = await getJpVocabTeacherVisibleLimit(db);
  return saveJpVocabTeacherVisibleLimit(db, {
    ...current,
    date: beijingDateString(),
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
    released_today: false,
    release_count: JP_VOCAB_DAILY_QUIZ_TOP,
    hide_checked_today: false,
    excluded_batch_ids: [],
    visible_ids: undefined,
    quiz_target_adjusted_at: undefined,
    sticky_visible_ids: undefined,
    quiz_target_base_checked: undefined,
  });
}

async function ensureJpVocabSharedSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled) return;
  if (!jpVocabSharedSchemaReady) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jp_vocab_shared (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         word_id    INTEGER NOT NULL,
         shared_by  TEXT    NOT NULL,
         shared_at  TEXT    NOT NULL,
         share_date TEXT    NOT NULL,
         FOREIGN KEY (word_id) REFERENCES jp_vocab_word (id) ON DELETE CASCADE
       )`
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_jp_vocab_shared_day_word
       ON jp_vocab_shared (share_date, word_id)`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_shared_date
       ON jp_vocab_shared (share_date)`
      )
      .run();
    jpVocabSharedSchemaReady = true;
  }
  if (jpVocabSharedColumnsReady) return;
  const info = await db
    .prepare(`PRAGMA table_info(jp_vocab_shared)`)
    .all<{ name: string }>();
  const cols = new Set((info.results ?? []).map((row) => row.name));
  if (!cols.has("auto_marked_level")) {
    await db
      .prepare(`ALTER TABLE jp_vocab_shared ADD COLUMN auto_marked_level TEXT`)
      .run();
  }
  jpVocabSharedColumnsReady = true;
}

function mapSharedRow(
  row: Record<string, unknown>,
  word: JpVocabWord
): JpVocabSharedItem {
  return {
    id: Number(row.id),
    word_id: Number(row.word_id),
    shared_by: String(row.shared_by),
    shared_at: String(row.shared_at),
    share_date: String(row.share_date),
    level: resolveJpVocabSharedTeacherLevel(word),
    word,
  };
}

function isJpVocabWordCheckedToday(word: JpVocabWord, now = new Date()): boolean {
  if (
    effectiveTodayCheckCount(word.today_check_count ?? 0, word.today_check_date, now) >
    0
  ) {
    return true;
  }
  if (!word.last_review_at || !word.last_review_level) return false;
  return word.last_review_at.slice(0, 10) === beijingDateString(now);
}

export type ShareJpVocabWordResult =
  | { ok: true; item: JpVocabSharedItem; word: JpVocabWord }
  | { ok: false; error: string };

async function isJpVocabWordSharedToday(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (devStoreEnabled) {
    return devShared.some((s) => s.share_date === today && s.word_id === wordId);
  }
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2
       LIMIT 1`
    )
    .bind(today, wordId)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function listJpVocabSharedTodayWordIds(
  db: D1Database,
  now = new Date()
): Promise<number[]> {
  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  if (devStoreEnabled) {
    return devShared
      .filter((s) => s.share_date === today)
      .map((s) => s.word_id);
  }
  const result = await db
    .prepare(
      `SELECT word_id FROM jp_vocab_shared
       WHERE share_date = ?1
       ORDER BY shared_at ASC, id ASC`
    )
    .bind(today)
    .all<{ word_id: number }>();
  return (result.results ?? []).map((row) => Number(row.word_id));
}

export async function shareJpVocabWord(
  db: D1Database,
  wordId: number,
  sharedBy: string
): Promise<ShareJpVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }
  const sharedByTrim = (sharedBy || "").trim();
  if (!sharedByTrim) {
    return { ok: false, error: "shared_by_required" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString();
  const ts = nowIso();

  if (devStoreEnabled) {
    const word = devWords.find((w) => w.id === wordId);
    if (!word) return { ok: false, error: "not_found" };
    if (isJpVocabWordReviewLocked(word)) {
      return { ok: false, error: "review_locked" };
    }
    if (await isJpVocabWordSharedToday(db, wordId)) {
      return { ok: false, error: "already_shared_today" };
    }
    let updatedWord = word;
    const autoMarkedLevel: JpVocabLevel | null = isJpVocabWordCheckedToday(word)
      ? null
      : "weak";
    if (autoMarkedLevel) {
      const review = await recordJpVocabReview(db, wordId, autoMarkedLevel);
      if (!review.ok) return { ok: false, error: review.error };
      updatedWord = review.word;
    }
    const sharedRow = {
      id: devSharedNextId++,
      word_id: wordId,
      shared_by: sharedByTrim,
      shared_at: ts,
      share_date: today,
      auto_marked_level: autoMarkedLevel,
    };
    devShared.push(sharedRow);
    invalidateJpVocabSharedTodayCache();
    return {
      ok: true,
      item: mapSharedRow(sharedRow, updatedWord),
      word: updatedWord,
    };
  }

  const wordRow = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  const current = mapRow(wordRow);
  if (isJpVocabWordReviewLocked(current)) {
    return { ok: false, error: "review_locked" };
  }

  const existingRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date
       FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (existingRow) {
    return { ok: false, error: "already_shared_today" };
  }

  let updatedWord = current;
  const autoMarkedLevel: JpVocabLevel | null = isJpVocabWordCheckedToday(current)
    ? null
    : "weak";
  if (autoMarkedLevel) {
    const review = await recordJpVocabReview(db, wordId, autoMarkedLevel);
    if (!review.ok) return { ok: false, error: review.error };
    updatedWord = review.word;
  }

  const insert = await db
    .prepare(
      `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(wordId, sharedByTrim, ts, today, autoMarkedLevel)
    .run();
  const insertedId = Number(insert.meta?.last_row_id);
  const sharedRow = {
    id: insertedId,
    word_id: wordId,
    shared_by: sharedByTrim,
    shared_at: ts,
    share_date: today,
    auto_marked_level: autoMarkedLevel,
  };

  invalidateJpVocabSharedTodayCache();

  return {
    ok: true,
    item: mapSharedRow(sharedRow, updatedWord),
    word: updatedWord,
  };
}

export type UnshareJpVocabWordResult =
  | {
      ok: true;
      word: JpVocabWord;
      reverted: boolean;
      display_order: JpVocabDailyDisplayOrder | null;
    }
  | { ok: false; error: string };

export async function unshareJpVocabWord(
  db: D1Database,
  wordId: number
): Promise<UnshareJpVocabWordResult> {
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "word_id_invalid" };
  }

  await seedIfEmpty(db);
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString();

  if (devStoreEnabled) {
    const idx = devShared.findIndex(
      (s) => s.share_date === today && s.word_id === wordId
    );
    if (idx < 0) return { ok: false, error: "not_shared_today" };
    const sharedRow = devShared[idx];
    devShared.splice(idx, 1);

    const wordIdx = devWords.findIndex((w) => w.id === wordId);
    if (wordIdx < 0) return { ok: false, error: "not_found" };

    let updatedWord = devWords[wordIdx];
    const autoMarked =
      sharedRow.auto_marked_level === "very" ||
      sharedRow.auto_marked_level === "normal" ||
      sharedRow.auto_marked_level === "weak"
        ? sharedRow.auto_marked_level
        : null;
    let reverted = false;
    let display_order: JpVocabDailyDisplayOrder | null = null;
    if (autoMarked) {
      updatedWord = revertJpVocabAutoShareReview(updatedWord, autoMarked);
      devWords[wordIdx] = updatedWord;
      reverted = true;
      display_order = await unmarkJpVocabWordRoundChecked(db, wordId);
    }

    invalidateJpVocabSharedTodayCache();
    return { ok: true, word: updatedWord, reverted, display_order };
  }

  const sharedRow = await db
    .prepare(
      `SELECT id, word_id, shared_by, shared_at, share_date, auto_marked_level
       FROM jp_vocab_shared
       WHERE share_date = ?1 AND word_id = ?2`
    )
    .bind(today, wordId)
    .first<Record<string, unknown>>();

  if (!sharedRow) return { ok: false, error: "not_shared_today" };

  const wordRow = await db
    .prepare(`${WORD_SELECT} WHERE id = ?1`)
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!wordRow) return { ok: false, error: "not_found" };

  await db
    .prepare(`DELETE FROM jp_vocab_shared WHERE id = ?1`)
    .bind(Number(sharedRow.id))
    .run();

  let updatedWord = mapRow(wordRow);
  let reverted = false;
  let display_order: JpVocabDailyDisplayOrder | null = null;
  const rawAutoMarked = sharedRow.auto_marked_level;
  const autoMarked =
    rawAutoMarked === "very" ||
    rawAutoMarked === "normal" ||
    rawAutoMarked === "weak"
      ? rawAutoMarked
      : null;
  if (autoMarked) {
    updatedWord = revertJpVocabAutoShareReview(updatedWord, autoMarked);
    reverted = true;
    display_order = await unmarkJpVocabWordRoundChecked(db, wordId);
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET cnt_very = ?1,
             cnt_normal = ?2,
             cnt_weak = ?3,
             today_check_count = ?4,
             today_check_date = ?5,
             last_review_level = ?6,
             last_review_at = ?7,
             updated_at = ?8
         WHERE id = ?9`
      )
      .bind(
        updatedWord.cnt_very,
        updatedWord.cnt_normal,
        updatedWord.cnt_weak,
        updatedWord.today_check_count,
        updatedWord.today_check_date,
        updatedWord.last_review_level,
        updatedWord.last_review_at,
        updatedWord.updated_at,
        wordId
      )
      .run();
  }

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word: updatedWord, reverted, display_order };
}

export async function listJpVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> }> {
  const today = beijingDateString(now);
  const nowMs = Date.now();
  if (
    sharedTodayListCache &&
    sharedTodayListCache.date === today &&
    nowMs - sharedTodayListCache.at < JP_VOCAB_SHARED_LIST_CACHE_MS
  ) {
    return sharedTodayListCache.value;
  }
  if (sharedTodayListInflight) {
    return sharedTodayListInflight;
  }

  const gen = sharedTodayListCacheGen;
  sharedTodayListInflight = (async () => {
    try {
      const value = await queryJpVocabSharedToday(db, now);
      if (gen === sharedTodayListCacheGen) {
        sharedTodayListCache = {
          at: Date.now(),
          date: beijingDateString(now),
          value,
        };
      }
      return value;
    } finally {
      sharedTodayListInflight = null;
    }
  })();

  return sharedTodayListInflight;
}

async function queryJpVocabSharedToday(
  db: D1Database,
  now = new Date()
): Promise<{ items: JpVocabSharedItem[]; refs: Record<string, JpVocabRef> }> {
  await ensureVocabWordSchema(db);
  await ensureJpVocabSharedSchema(db);

  const today = beijingDateString(now);

  if (devStoreEnabled) {
    const items = devShared
      .filter((s) => s.share_date === today)
      .map((s) => {
        const word = devWords.find((w) => w.id === s.word_id);
        if (!word) return null;
        const hasNotes = Boolean((word.class_notes || "").trim());
        const liteWord: JpVocabWord = {
          ...word,
          class_notes: null,
          class_notes_present: hasNotes,
        };
        return mapSharedRow(s, liteWord);
      })
      .filter((item): item is JpVocabSharedItem => item != null)
      .sort(
        (a, b) =>
          b.shared_at.localeCompare(a.shared_at) || b.id - a.id
      );
    const refs = refsRecord(Array.from(devRefs.values()));
    return { items, refs };
  }

  const result = await db
    .prepare(
      `SELECT s.id, s.word_id, s.shared_by, s.shared_at, s.share_date,
              w.id AS w_id, w.word, w.reading, w.meaning, w.pos, w.kind, w.ref_key,
              w.cnt_very, w.cnt_normal, w.cnt_weak, w.today_check_count, w.today_check_date,
              w.last_review_level, w.last_review_at, w.created_at, w.updated_at,
              w.example_sentences, w.example_sentences_source, w.meaning_source,
              (CASE WHEN w.class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM jp_vocab_shared s
       INNER JOIN jp_vocab_word w ON w.id = s.word_id
       WHERE s.share_date = ?1
       ORDER BY s.shared_at DESC, s.id DESC`
    )
    .bind(today)
    .all<Record<string, unknown>>();

  const items = (result.results ?? []).map((row) => {
    const word = mapSharedListWordRow({
      id: row.w_id,
      word: row.word,
      reading: row.reading,
      meaning: row.meaning,
      pos: row.pos,
      kind: row.kind,
      ref_key: row.ref_key,
      cnt_very: row.cnt_very,
      cnt_normal: row.cnt_normal,
      cnt_weak: row.cnt_weak,
      today_check_count: row.today_check_count,
      today_check_date: row.today_check_date,
      last_review_level: row.last_review_level,
      last_review_at: row.last_review_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      example_sentences: row.example_sentences,
      example_sentences_source: row.example_sentences_source,
      meaning_source: row.meaning_source,
      has_class_notes: row.has_class_notes,
    });
    return mapSharedRow(row, word);
  });

  const refKeys = [
    ...new Set(items.map((item) => item.word.ref_key).filter(Boolean)),
  ] as string[];
  const refs: Record<string, JpVocabRef> = {};
  if (refKeys.length) {
    const refList = await listJpVocabRefsByKeys(db, refKeys);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  return { items, refs };
}

/** 轻量统计今日已抽查词条数（复习页轮询用，避免每次全表 listJpVocabWords） */
async function countJpVocabTodayCheckedWords(
  db: D1Database,
  now = new Date()
): Promise<number> {
  if (devStoreEnabled) {
    return jpVocabTodayCheckStats(devWords, now).wordCount;
  }

  await ensureVocabWordSchema(db);
  const today = beijingDateString(now);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM jp_vocab_word
       WHERE today_check_date = ?1 AND COALESCE(today_check_count, 0) > 0`
    )
    .bind(today)
    .first<{ cnt: number }>();
  return Math.max(0, Number(row?.cnt ?? 0));
}

export async function getJpVocabDailyQuizProgress(
  db: D1Database,
  now = new Date()
): Promise<JpVocabDailyQuizProgress> {
  const [checked, teacherVisibleLimit] = await Promise.all([
    countJpVocabTodayCheckedWords(db, now),
    getJpVocabTeacherVisibleLimit(db),
  ]);
  const total = Math.max(0, Math.floor(teacherVisibleLimit.quiz_target));
  const remaining = Math.max(0, total - checked);
  return {
    total,
    checked,
    remaining,
    complete: total > 0 && checked >= total,
  };
}

async function ensureJpVocabShareRequestSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled) return;
  if (!jpVocabShareRequestSchemaReady) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jp_vocab_share_request (
         id            INTEGER PRIMARY KEY AUTOINCREMENT,
         requested_by  TEXT    NOT NULL,
         requested_at  TEXT    NOT NULL,
         request_date  TEXT    NOT NULL,
         dismissed_at  TEXT,
         dismissed_by  TEXT
       )`
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_jp_vocab_share_request_pending
       ON jp_vocab_share_request (request_date, dismissed_at)`
      )
      .run();
    jpVocabShareRequestSchemaReady = true;
  }
}

function mapShareRequestRow(row: Record<string, unknown>): JpVocabShareRequest {
  return {
    id: Number(row.id),
    requested_by: String(row.requested_by),
    requested_at: String(row.requested_at),
    request_date: String(row.request_date),
    dismissed_at: row.dismissed_at ? String(row.dismissed_at) : null,
    dismissed_by: row.dismissed_by ? String(row.dismissed_by) : null,
  };
}

export type CreateJpVocabShareRequestResult =
  | { ok: true; item: JpVocabShareRequest; created: boolean }
  | { ok: false; error: string };

export async function createJpVocabShareRequest(
  db: D1Database,
  requestedBy: string,
  now = new Date()
): Promise<CreateJpVocabShareRequestResult> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);
  const nowIso = now.toISOString();

  if (devStoreEnabled) {
    const pending = devShareRequests.find(
      (r) =>
        r.request_date === today &&
        r.requested_by === requestedBy &&
        !r.dismissed_at
    );
    if (pending) {
      const elapsed = now.getTime() - new Date(pending.requested_at).getTime();
      if (elapsed < JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS) {
        return { ok: false, error: "too_frequent" };
      }
      pending.requested_at = nowIso;
      return { ok: true, item: pending, created: false };
    }
    const item: JpVocabShareRequest = {
      id: devShareRequestNextId++,
      requested_by: requestedBy,
      requested_at: nowIso,
      request_date: today,
      dismissed_at: null,
      dismissed_by: null,
    };
    devShareRequests.push(item);
    return { ok: true, item, created: true };
  }

  const existing = await db
    .prepare(
      `SELECT id, requested_by, requested_at, request_date, dismissed_at, dismissed_by
       FROM jp_vocab_share_request
       WHERE request_date = ?1 AND requested_by = ?2 AND dismissed_at IS NULL
       LIMIT 1`
    )
    .bind(today, requestedBy)
    .first<Record<string, unknown>>();

  if (existing) {
    const item = mapShareRequestRow(existing);
    const elapsed = now.getTime() - new Date(item.requested_at).getTime();
    if (elapsed < JP_VOCAB_SHARE_REQUEST_COOLDOWN_MS) {
      return { ok: false, error: "too_frequent" };
    }
    await db
      .prepare(`UPDATE jp_vocab_share_request SET requested_at = ?1 WHERE id = ?2`)
      .bind(nowIso, item.id)
      .run();
    return {
      ok: true,
      item: { ...item, requested_at: nowIso },
      created: false,
    };
  }

  const result = await db
    .prepare(
      `INSERT INTO jp_vocab_share_request (requested_by, requested_at, request_date)
       VALUES (?1, ?2, ?3)`
    )
    .bind(requestedBy, nowIso, today)
    .run();

  const insertedId = Number(result.meta?.last_row_id);
  if (!insertedId) return { ok: false, error: "insert_failed" };

  return {
    ok: true,
    item: {
      id: insertedId,
      requested_by: requestedBy,
      requested_at: nowIso,
      request_date: today,
      dismissed_at: null,
      dismissed_by: null,
    },
    created: true,
  };
}

export async function listJpVocabPendingShareRequests(
  db: D1Database,
  now = new Date()
): Promise<JpVocabShareRequest[]> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);

  if (devStoreEnabled) {
    return devShareRequests
      .filter((r) => r.request_date === today && !r.dismissed_at)
      .sort(
        (a, b) =>
          b.requested_at.localeCompare(a.requested_at) || b.id - a.id
      );
  }

  const result = await db
    .prepare(
      `SELECT id, requested_by, requested_at, request_date, dismissed_at, dismissed_by
       FROM jp_vocab_share_request
       WHERE request_date = ?1 AND dismissed_at IS NULL
       ORDER BY requested_at DESC, id DESC`
    )
    .bind(today)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(mapShareRequestRow);
}

export async function dismissJpVocabShareRequests(
  db: D1Database,
  dismissedBy: string,
  requestIds?: number[],
  now = new Date()
): Promise<{ dismissed: number }> {
  await ensureJpVocabShareRequestSchema(db);
  const today = beijingDateString(now);
  const dismissedAt = now.toISOString();

  if (devStoreEnabled) {
    let count = 0;
    for (const row of devShareRequests) {
      if (row.request_date !== today || row.dismissed_at) continue;
      if (requestIds && !requestIds.includes(row.id)) continue;
      row.dismissed_at = dismissedAt;
      row.dismissed_by = dismissedBy;
      count += 1;
    }
    return { dismissed: count };
  }

  if (requestIds && requestIds.length > 0) {
    const placeholders = requestIds.map((_, i) => `?${i + 4}`).join(", ");
    const result = await db
      .prepare(
        `UPDATE jp_vocab_share_request
         SET dismissed_at = ?1, dismissed_by = ?2
         WHERE request_date = ?3 AND dismissed_at IS NULL AND id IN (${placeholders})`
      )
      .bind(dismissedAt, dismissedBy, today, ...requestIds)
      .run();
    return { dismissed: Number(result.meta?.changes ?? 0) };
  }

  const result = await db
    .prepare(
      `UPDATE jp_vocab_share_request
       SET dismissed_at = ?1, dismissed_by = ?2
       WHERE request_date = ?3 AND dismissed_at IS NULL`
    )
    .bind(dismissedAt, dismissedBy, today)
    .run();
  return { dismissed: Number(result.meta?.changes ?? 0) };
}

export type JpVocabDailyRolloverResult = {
  date: string;
  dry_run: boolean;
  teacher_visible_reset: boolean;
  display_order_refreshed: boolean;
  deleted_shared: number;
  deleted_share_requests: number;
  cleared_today_checks: number;
};

function teacherVisibleNeedsDailyReset(
  raw: Partial<JpVocabTeacherVisibleLimit> | null,
  today: string
): boolean {
  return !raw?.date || raw.date !== today;
}

/**
 * 北京时间跨日清理：仅当日临时状态（释放批次、共享、协助请求、今日抽查次数等）。
 * 不删除词条、不重置历史复习统计（cnt_very / cnt_normal / cnt_weak）。
 */
export async function runJpVocabDailyRolloverInDb(
  db: D1Database,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<JpVocabDailyRolloverResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const today = beijingDateString(now);
  const ts = nowIso();

  await seedIfEmpty(db);

  if (devStoreEnabled) {
    const teacher_visible_reset = teacherVisibleNeedsDailyReset(
      devTeacherVisibleLimit,
      today
    );
    const display_order_refreshed =
      !devDailyDisplayOrder.date || devDailyDisplayOrder.date !== today;
    const deleted_shared = devShared.filter((row) => row.share_date < today).length;
    const deleted_share_requests = devShareRequests.filter(
      (row) => row.request_date < today
    ).length;
    const cleared_today_checks = devWords.filter(
      (word) => word.today_check_date && word.today_check_date < today
    ).length;

    if (!dryRun) {
      if (teacher_visible_reset) {
        devTeacherVisibleLimit = await resetJpVocabTeacherVisibleLimit(db);
      }
      if (display_order_refreshed) {
        devDailyDisplayOrder = await refreshJpVocabDailyDisplayOrder(db, devWords);
      }
      if (deleted_shared > 0) {
        for (let i = devShared.length - 1; i >= 0; i -= 1) {
          if (devShared[i].share_date < today) devShared.splice(i, 1);
        }
        invalidateJpVocabSharedTodayCache();
      }
      if (deleted_share_requests > 0) {
        for (let i = devShareRequests.length - 1; i >= 0; i -= 1) {
          if (devShareRequests[i].request_date < today) {
            devShareRequests.splice(i, 1);
          }
        }
      }
      if (cleared_today_checks > 0) {
        for (let i = 0; i < devWords.length; i += 1) {
          const word = devWords[i];
          if (word.today_check_date && word.today_check_date < today) {
            devWords[i] = {
              ...word,
              today_check_count: 0,
              today_check_date: null,
              updated_at: ts,
            };
          }
        }
      }
    }

    return {
      date: today,
      dry_run: dryRun,
      teacher_visible_reset,
      display_order_refreshed,
      deleted_shared,
      deleted_share_requests,
      cleared_today_checks,
    };
  }

  const rawVisible = await readJpVocabTeacherVisibleLimitRaw(db);
  const teacher_visible_reset = teacherVisibleNeedsDailyReset(rawVisible, today);

  const storedOrder = await readJpVocabDailyDisplayOrderRaw(db);
  const display_order_refreshed =
    !storedOrder?.date || storedOrder.date !== today;

  await ensureJpVocabSharedSchema(db);
  const sharedCountRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM jp_vocab_shared WHERE share_date < ?1`)
    .bind(today)
    .first<{ c: number }>();
  const deleted_shared = Number(sharedCountRow?.c ?? 0);

  await ensureJpVocabShareRequestSchema(db);
  const requestCountRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM jp_vocab_share_request WHERE request_date < ?1`
    )
    .bind(today)
    .first<{ c: number }>();
  const deleted_share_requests = Number(requestCountRow?.c ?? 0);

  await ensureVocabWordSchema(db);
  const checkCountRow = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM jp_vocab_word
       WHERE today_check_date IS NOT NULL AND today_check_date < ?1`
    )
    .bind(today)
    .first<{ c: number }>();
  const cleared_today_checks = Number(checkCountRow?.c ?? 0);

  if (dryRun) {
    return {
      date: today,
      dry_run: true,
      teacher_visible_reset,
      display_order_refreshed,
      deleted_shared,
      deleted_share_requests,
      cleared_today_checks,
    };
  }

  if (teacher_visible_reset) {
    await resetJpVocabTeacherVisibleLimit(db);
  }

  if (display_order_refreshed) {
    const words = await listJpVocabWords(db);
    await refreshJpVocabDailyDisplayOrder(db, words);
  }

  if (deleted_shared > 0) {
    await db
      .prepare(`DELETE FROM jp_vocab_shared WHERE share_date < ?1`)
      .bind(today)
      .run();
    invalidateJpVocabSharedTodayCache();
  }

  if (deleted_share_requests > 0) {
    await db
      .prepare(`DELETE FROM jp_vocab_share_request WHERE request_date < ?1`)
      .bind(today)
      .run();
  }

  if (cleared_today_checks > 0) {
    await db
      .prepare(
        `UPDATE jp_vocab_word
         SET today_check_count = 0,
             today_check_date = NULL,
             updated_at = ?1
         WHERE today_check_date IS NOT NULL AND today_check_date < ?2`
      )
      .bind(ts, today)
      .run();
  }

  return {
    date: today,
    dry_run: false,
    teacher_visible_reset,
    display_order_refreshed,
    deleted_shared,
    deleted_share_requests,
    cleared_today_checks,
  };
}

async function readJpVocabTeacherQuizLiveRaw(
  db: D1Database
): Promise<Partial<JpVocabTeacherQuizLive> | null> {
  if (devStoreEnabled) {
    return devTeacherQuizLive;
  }
  await ensureJpVocabSettingSchema(db);
  const row = await db
    .prepare(`SELECT value FROM jp_vocab_setting WHERE key = ?1`)
    .bind(JP_VOCAB_TEACHER_QUIZ_LIVE_KEY)
    .first<{ value: string }>();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as Partial<JpVocabTeacherQuizLive>;
  } catch {
    return null;
  }
}

async function saveJpVocabTeacherQuizLive(
  db: D1Database,
  live: JpVocabTeacherQuizLive
): Promise<JpVocabTeacherQuizLive> {
  const next = normalizeJpVocabTeacherQuizLive(live);
  if (devStoreEnabled) {
    devTeacherQuizLive = next;
    return next;
  }
  await ensureJpVocabSettingSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_setting (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(JP_VOCAB_TEACHER_QUIZ_LIVE_KEY, JSON.stringify(next), nowIso())
    .run();
  teacherQuizLiveReadCache = { at: Date.now(), value: next };
  return next;
}

export async function getJpVocabTeacherQuizLive(
  db: D1Database,
  now = new Date()
): Promise<JpVocabTeacherQuizLive> {
  const at = Date.now();
  if (
    teacherQuizLiveReadCache &&
    at - teacherQuizLiveReadCache.at < JP_VOCAB_SETTING_READ_CACHE_MS
  ) {
    return normalizeJpVocabTeacherQuizLive(teacherQuizLiveReadCache.value, now);
  }

  const raw = await readJpVocabTeacherQuizLiveRaw(db);
  const normalized = normalizeJpVocabTeacherQuizLive(raw, now);
  if (!devStoreEnabled && raw?.date && raw.date !== normalized.date) {
    const saved = await saveJpVocabTeacherQuizLive(db, normalized);
    return saved;
  }
  teacherQuizLiveReadCache = { at, value: normalized };
  return normalized;
}

export async function setJpVocabTeacherQuizLiveWord(
  db: D1Database,
  wordId: number | null,
  now = new Date()
): Promise<JpVocabTeacherQuizLive> {
  const current = await getJpVocabTeacherQuizLive(db, now);
  const parsedId =
    wordId != null && Number.isFinite(wordId) && wordId > 0
      ? Math.floor(wordId)
      : null;
  const wordChanged = current.word_id !== parsedId;
  const next: JpVocabTeacherQuizLive = {
    ...current,
    word_id: parsedId,
    updated_at: parsedId != null ? now.toISOString() : null,
    ...(wordChanged
      ? {
          student_peek_word_id: null,
          student_peek_by: null,
          student_peek_at: null,
        }
      : {}),
  };
  return saveJpVocabTeacherQuizLive(db, next);
}

async function getJpVocabWordByIdLite(
  db: D1Database,
  wordId: number
): Promise<JpVocabWord | null> {
  if (devStoreEnabled) {
    const word = devWords.find((w) => w.id === wordId);
    if (!word) return null;
    const hasNotes = Boolean((word.class_notes || "").trim());
    return {
      ...word,
      class_notes: null,
      class_notes_present: hasNotes,
    };
  }
  const row = await db
    .prepare(
      `SELECT id, word, reading, meaning, pos, kind, ref_key,
              cnt_very, cnt_normal, cnt_weak, today_check_count, today_check_date,
              last_review_level, last_review_at, created_at, updated_at,
              example_sentences, example_sentences_source, meaning_source,
              (CASE WHEN class_notes IS NOT NULL THEN 1 ELSE 0 END) AS has_class_notes
       FROM jp_vocab_word
       WHERE id = ?1`
    )
    .bind(wordId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return mapSharedListWordRow(row);
}

export type JpVocabTeacherQuizLivePeekResult =
  | {
      ok: true;
      word: JpVocabWord;
      refs: Record<string, JpVocabRef>;
      item: JpVocabSharedItem;
    }
  | { ok: false; error: "no_active_word" | "word_not_found" };

export async function peekJpVocabTeacherQuizLiveWord(
  db: D1Database,
  studentUsername: string,
  now = new Date()
): Promise<JpVocabTeacherQuizLivePeekResult> {
  const live = await getJpVocabTeacherQuizLive(db, now);
  const wordId = live.word_id;
  if (!wordId) {
    return { ok: false, error: "no_active_word" };
  }
  const word = await getJpVocabWordByIdLite(db, wordId);
  if (!word) {
    return { ok: false, error: "word_not_found" };
  }

  const studentBy = studentUsername.trim();
  const peekAt = now.toISOString();
  const nextLive: JpVocabTeacherQuizLive = {
    ...live,
    student_peek_word_id: wordId,
    student_peek_by: studentBy,
    student_peek_at: peekAt,
  };
  await saveJpVocabTeacherQuizLive(db, nextLive);

  await ensureJpVocabSharedSchema(db);
  const today = beijingDateString(now);
  let sharedRow: { id: number; shared_by: string; shared_at: string };

  if (devStoreEnabled) {
    const existing = devShared.find(
      (s) => s.share_date === today && s.word_id === wordId
    );
    if (existing) {
      sharedRow = {
        id: existing.id,
        shared_by: existing.shared_by,
        shared_at: existing.shared_at,
      };
    } else {
      const id = devSharedNextId++;
      devShared.push({
        id,
        word_id: wordId,
        shared_by: studentBy,
        shared_at: peekAt,
        share_date: today,
        auto_marked_level: null,
      });
      sharedRow = { id, shared_by: studentBy, shared_at: peekAt };
    }
  } else {
    const existing = await db
      .prepare(
        `SELECT id, shared_by, shared_at FROM jp_vocab_shared
         WHERE share_date = ?1 AND word_id = ?2
         LIMIT 1`
      )
      .bind(today, wordId)
      .first<{ id: number; shared_by: string; shared_at: string }>();

    if (existing) {
      sharedRow = {
        id: Number(existing.id),
        shared_by: String(existing.shared_by),
        shared_at: String(existing.shared_at),
      };
    } else {
      await db
        .prepare(
          `INSERT INTO jp_vocab_shared (word_id, shared_by, shared_at, share_date, auto_marked_level)
           VALUES (?1, ?2, ?3, ?4, NULL)`
        )
        .bind(wordId, studentBy, peekAt, today)
        .run();
      const inserted = await db
        .prepare(
          `SELECT id, shared_by, shared_at FROM jp_vocab_shared
           WHERE share_date = ?1 AND word_id = ?2
           LIMIT 1`
        )
        .bind(today, wordId)
        .first<{ id: number; shared_by: string; shared_at: string }>();
      if (!inserted) {
        return { ok: false, error: "word_not_found" };
      }
      sharedRow = {
        id: Number(inserted.id),
        shared_by: String(inserted.shared_by),
        shared_at: String(inserted.shared_at),
      };
    }
  }

  const refs: Record<string, JpVocabRef> = {};
  if (word.ref_key) {
    const refList = await listJpVocabRefsByKeys(db, [word.ref_key]);
    for (const ref of refList) {
      refs[ref.ref_key] = ref;
    }
  }

  const level = resolveJpVocabSharedTeacherLevel(word, now);

  const item: JpVocabSharedItem = {
    id: sharedRow.id,
    word_id: word.id,
    shared_by: sharedRow.shared_by,
    shared_at: sharedRow.shared_at,
    share_date: today,
    word,
    ...(level ? { level } : {}),
  };

  invalidateJpVocabSharedTodayCache();
  return { ok: true, word, refs, item };
}

export async function isJpVocabTeacherQuizLiveStudentPeekedForWord(
  db: D1Database,
  wordId: number,
  now = new Date()
): Promise<boolean> {
  const live = await getJpVocabTeacherQuizLive(db, now);
  return isJpVocabTeacherQuizLiveStudentPeeked(live, wordId);
}

async function ensureJpVocabReviewDoneSchema(db: D1Database): Promise<void> {
  if (devStoreEnabled || jpVocabReviewDoneSchemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS jp_vocab_review_done (
        word_id INTEGER PRIMARY KEY,
        reviewed_at TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES jp_vocab_word (id) ON DELETE CASCADE
      )`
    )
    .run();
  jpVocabReviewDoneSchemaReady = true;
}

export async function getJpVocabReviewProgress(
  db: D1Database
): Promise<JpVocabReviewProgress> {
  if (devStoreEnabled) {
    return normalizeJpVocabReviewProgress({
      reviewed_word_ids: [...devReviewDoneWordIds],
    });
  }
  await ensureJpVocabReviewDoneSchema(db);
  const rows = await db
    .prepare(`SELECT word_id FROM jp_vocab_review_done ORDER BY reviewed_at ASC`)
    .all<{ word_id: number }>();
  const reviewed_word_ids = (rows.results ?? [])
    .map((row) => Number(row.word_id))
    .filter((id) => id > 0);
  return normalizeJpVocabReviewProgress({ reviewed_word_ids });
}

/** 复习卡片点「下一个」：记录当前词已完成复习（去重；不按日清零） */
export async function recordJpVocabReviewDone(
  db: D1Database,
  wordId: number
): Promise<JpVocabReviewProgress> {
  const id = Math.floor(Number(wordId));
  if (!Number.isFinite(id) || id <= 0) {
    return getJpVocabReviewProgress(db);
  }
  const current = await getJpVocabReviewProgress(db);
  if (current.reviewed_word_ids.includes(id)) {
    return current;
  }
  if (devStoreEnabled) {
    devReviewDoneWordIds.push(id);
    return normalizeJpVocabReviewProgress({
      reviewed_word_ids: devReviewDoneWordIds,
    });
  }
  await ensureJpVocabReviewDoneSchema(db);
  await db
    .prepare(
      `INSERT INTO jp_vocab_review_done (word_id, reviewed_at)
       VALUES (?1, ?2)
       ON CONFLICT(word_id) DO NOTHING`
    )
    .bind(id, nowIso())
    .run();
  return getJpVocabReviewProgress(db);
}

/** 用户手动清除全部复习进度 */
export async function clearJpVocabReviewDone(
  db: D1Database
): Promise<JpVocabReviewProgress> {
  if (devStoreEnabled) {
    devReviewDoneWordIds.length = 0;
    return normalizeJpVocabReviewProgress(null);
  }
  await ensureJpVocabReviewDoneSchema(db);
  await db.prepare(`DELETE FROM jp_vocab_review_done`).run();
  return normalizeJpVocabReviewProgress(null);
}
