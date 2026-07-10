import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  buildJpVocabDailySeqMap,
  isJpVocabRoundChecked,
} from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { JP_VOCAB_DAILY_QUIZ_TOP } from "@/lib/jp-vocab-daily-quiz-progress";
import type { JpVocabWord } from "@/lib/types";

/** 非管理员老师默认仅可见当日序号 1–20 */
export const JP_VOCAB_TEACHER_VISIBLE_DEFAULT = 20;

/** 管理员释放条数输入框默认值 */
export const JP_VOCAB_TEACHER_VISIBLE_STEP = 20;

export type JpVocabTeacherVisibleLimit = {
  /** 北京时间 YYYY-MM-DD，跨日自动回到默认 */
  date: string;
  /** 当前批次最大当日序号（展示用） */
  limit: number;
  /** 当前老师可见的条数（本批窗口大小） */
  count: number;
  /** 管理员设置的当日抽查目标数量 */
  quiz_target: number;
  /** 今日管理员是否已确认释放（持久化；老师端据此自动展示批次） */
  released_today: boolean;
  /** 今日累计释放条数（管理员每次点击累加） */
  release_count: number;
  /** @deprecated 累计释放模式下不再使用，保留字段兼容旧数据 */
  excluded_batch_ids?: number[];
  /** 老师当前可见词条 id（由 release 参数每次加载时重算，非手工维护） */
  visible_ids?: number[];
};

function normalizeQuizTarget(raw: unknown): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(Math.floor(parsed), 999);
  }
  return JP_VOCAB_DAILY_QUIZ_TOP;
}

function normalizeVisibleCount(
  rawCount: unknown,
  limit: number
): number {
  const parsed = Number(rawCount);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.min(Math.floor(parsed), Math.max(1, limit));
  }
  return Math.min(limit, JP_VOCAB_TEACHER_VISIBLE_DEFAULT);
}

function normalizeVisibleIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.map((id) => Number(id)).filter((id) => id > 0);
  return ids.length ? ids : undefined;
}

function normalizeExcludedBatchIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => Number(id)).filter((id) => id > 0);
}

function inferReleasedToday(
  raw: Partial<JpVocabTeacherVisibleLimit> | null | undefined
): boolean {
  if (raw?.released_today === true) return true;
  const visibleIds = normalizeVisibleIds(raw?.visible_ids);
  if (!visibleIds?.length) return false;
  const count = Number(raw?.count);
  const limit = Number(raw?.limit);
  return (
    (Number.isFinite(count) && count < JP_VOCAB_TEACHER_VISIBLE_DEFAULT) ||
    (Number.isFinite(limit) &&
      limit > JP_VOCAB_TEACHER_VISIBLE_DEFAULT &&
      count < limit)
  );
}

export function normalizeJpVocabTeacherVisibleLimit(
  raw: Partial<JpVocabTeacherVisibleLimit> | null | undefined,
  now = new Date()
): JpVocabTeacherVisibleLimit {
  const today = beijingDateString(now);
  const parsedLimit = Number(raw?.limit);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= JP_VOCAB_TEACHER_VISIBLE_DEFAULT
      ? Math.floor(parsedLimit)
      : JP_VOCAB_TEACHER_VISIBLE_DEFAULT;
  const quiz_target = normalizeQuizTarget(raw?.quiz_target);
  const released_today = inferReleasedToday(raw);
  const parsedReleaseCount = Number(raw?.release_count ?? raw?.count);
  const release_count =
    released_today &&
    Number.isFinite(parsedReleaseCount) &&
    parsedReleaseCount >= 1
      ? Math.min(Math.floor(parsedReleaseCount), 999)
      : JP_VOCAB_TEACHER_VISIBLE_DEFAULT;

  if (raw?.date === today) {
    return {
      date: today,
      limit,
      count: normalizeVisibleCount(raw?.count, limit),
      quiz_target,
      released_today,
      release_count,
      excluded_batch_ids: normalizeExcludedBatchIds(raw?.excluded_batch_ids),
      visible_ids: normalizeVisibleIds(raw?.visible_ids),
    };
  }
  return {
    date: today,
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target,
    released_today: false,
    release_count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    excluded_batch_ids: [],
  };
}

export function jpVocabTeacherVisibleRange(
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count">
): { start: number; end: number } {
  const end = Math.max(0, Math.floor(visible.limit));
  const count = normalizeVisibleCount(visible.count, end);
  const start = Math.max(1, end - count + 1);
  return { start, end };
}

/** 历史复习次数合计是否为 0（从未抽查过） */
export function isJpVocabWordNeverQuizzed(word: JpVocabWord): boolean {
  return (
    (word.cnt_very ?? 0) + (word.cnt_normal ?? 0) + (word.cnt_weak ?? 0) ===
    0
  );
}

/** 今日是否已在数据库中记为抽查过（today_check_count > 0） */
export function isJpVocabWordTodayCheckedInDb(
  word: JpVocabWord,
  now = new Date()
): boolean {
  return (
    effectiveTodayCheckCount(
      word.today_check_count ?? 0,
      word.today_check_date,
      now
    ) > 0
  );
}

/** 今日是否已抽查（含 DB 今日次数与本轮序号勾选） */
export function isJpVocabWordQuizCheckedToday(
  word: JpVocabWord,
  displayOrder?: JpVocabDailyDisplayOrder,
  now = new Date()
): boolean {
  if (isJpVocabWordTodayCheckedInDb(word, now)) return true;
  const today = beijingDateString(now);
  return (
    displayOrder?.date === today &&
    isJpVocabRoundChecked(displayOrder, word.id)
  );
}

type ReleaseCandidate = {
  id: number;
  seq: number;
  neverQuizzed: boolean;
};

function buildJpVocabTeacherVisibleReleaseCandidates(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  excludeIds: Set<number>,
  now = new Date()
): ReleaseCandidate[] {
  const wordById = new Map(words.map((w) => [w.id, w]));
  const candidates: ReleaseCandidate[] = [];

  for (let seq = 1; seq <= displayOrder.ids.length; seq++) {
    const wordId = displayOrder.ids[seq - 1];
    if (excludeIds.has(wordId)) continue;
    const word = wordById.get(wordId);
    if (!word) continue;
    if (isJpVocabWordTodayCheckedInDb(word, now)) continue;
    candidates.push({
      id: wordId,
      seq,
      neverQuizzed: isJpVocabWordNeverQuizzed(word),
    });
  }

  candidates.sort((a, b) => {
    if (a.neverQuizzed !== b.neverQuizzed) return a.neverQuizzed ? -1 : 1;
    return a.seq - b.seq;
  });

  return candidates;
}

/**
 * 选取老师可见批次：
 * 1. 排除今日已抽查（DB today_check_count > 0）
 * 2. 优先从未抽查过的词条，再按当日序号升序补足以往抽查过、今日未抽查的词条
 */
export function pickJpVocabTeacherVisibleReleaseIds(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  releaseCount: number,
  excludeIds: number[] = [],
  now = new Date()
): number[] {
  const target = Math.max(1, Math.floor(releaseCount));
  const exclude = new Set(excludeIds);
  const candidates = buildJpVocabTeacherVisibleReleaseCandidates(
    displayOrder,
    words,
    exclude,
    now
  );
  return candidates.slice(0, target).map((item) => item.id);
}

export function countJpVocabTeacherVisibleReleaseCandidates(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  excludeIds: number[] = [],
  now = new Date()
): number {
  const exclude = new Set(excludeIds);
  return buildJpVocabTeacherVisibleReleaseCandidates(
    displayOrder,
    words,
    exclude,
    now
  ).length;
}

function buildReleasePlanFromVisibleIds(
  visible_ids: number[],
  displayOrder: JpVocabDailyDisplayOrder
): JpVocabTeacherVisibleReleasePlan {
  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const seqs = visible_ids
    .map((id) => seqMap.get(id) ?? 0)
    .filter((seq) => seq > 0);
  const limit = seqs.length ? Math.max(...seqs) : JP_VOCAB_TEACHER_VISIBLE_DEFAULT;
  const start = seqs.length ? Math.min(...seqs) : 1;
  return {
    limit,
    count: visible_ids.length,
    visible_ids,
    start,
    end: limit,
  };
}

function visibleIdsEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/**
 * 根据数据库中的释放标志（released_today / release_count / excluded_batch_ids）
 * 重算老师可见词条。部署或刷新后自动生效，无需管理员重复点击释放。
 */
export function materializeJpVocabTeacherVisibleLimit(
  stored: JpVocabTeacherVisibleLimit,
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  now = new Date()
): JpVocabTeacherVisibleLimit {
  const today = beijingDateString(now);
  if (stored.date !== today) {
    return normalizeJpVocabTeacherVisibleLimit(null, now);
  }

  const batchSize = stored.released_today
    ? Math.max(1, Math.floor(stored.release_count))
    : JP_VOCAB_TEACHER_VISIBLE_DEFAULT;

  const visible_ids = pickJpVocabTeacherVisibleReleaseIds(
    displayOrder,
    words,
    batchSize,
    [],
    now
  );

  if (!visible_ids.length) {
    return stored;
  }

  const plan = buildReleasePlanFromVisibleIds(visible_ids, displayOrder);
  return {
    ...stored,
    limit: plan.limit,
    count: plan.count,
    visible_ids: plan.visible_ids,
  };
}

export function filterJpVocabWordsByTeacherVisibleLimit(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "visible_ids">
): JpVocabWord[] {
  if (!words.length) return [];

  if (visible.visible_ids?.length) {
    const idSet = new Set(visible.visible_ids);
    const orderIndex = new Map(displayOrder.ids.map((id, index) => [id, index]));
    return words
      .filter((word) => idSet.has(word.id))
      .sort(
        (a, b) =>
          (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }

  if (visible.limit <= 0) return [];
  const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
  const { start, end } = jpVocabTeacherVisibleRange(visible);
  return words.filter((word) => {
    const seq = seqMap.get(word.id) ?? Infinity;
    return seq >= start && seq <= end;
  });
}

export function jpVocabTeacherVisibleRangeLabel(
  visible: Pick<JpVocabTeacherVisibleLimit, "limit" | "count" | "visible_ids">,
  displayOrder?: JpVocabDailyDisplayOrder
): string {
  if (visible.visible_ids?.length && displayOrder?.ids.length) {
    const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
    const seqs = visible.visible_ids
      .map((id) => seqMap.get(id) ?? 0)
      .filter((seq) => seq > 0);
    if (seqs.length) {
      return `${Math.min(...seqs)}–${Math.max(...seqs)}`;
    }
  }
  const { start, end } = jpVocabTeacherVisibleRange(visible);
  return `${start}–${end}`;
}

export function parseJpVocabTeacherVisibleReleaseCount(
  raw: unknown
): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(Math.floor(parsed), 999);
}

export type JpVocabTeacherVisibleReleasePlan = {
  limit: number;
  count: number;
  visible_ids: number[];
  start: number;
  end: number;
};

export function jpVocabTeacherVisibleReleasedTotal(
  visible: Pick<JpVocabTeacherVisibleLimit, "released_today" | "release_count">
): number {
  return visible.released_today
    ? Math.max(0, Math.floor(visible.release_count))
    : 0;
}

export function planJpVocabTeacherVisibleRelease(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  current: JpVocabTeacherVisibleLimit,
  releaseCount: number,
  now = new Date()
): JpVocabTeacherVisibleReleasePlan | null {
  const previousTotal = jpVocabTeacherVisibleReleasedTotal(current);
  const newTotal = previousTotal + releaseCount;
  const visible_ids = pickJpVocabTeacherVisibleReleaseIds(
    displayOrder,
    words,
    newTotal,
    [],
    now
  );
  if (!visible_ids.length) return null;
  return buildReleasePlanFromVisibleIds(visible_ids, displayOrder);
}

export function teacherVisibleLimitNeedsPersist(
  before: JpVocabTeacherVisibleLimit,
  after: JpVocabTeacherVisibleLimit
): boolean {
  return (
    !visibleIdsEqual(before.visible_ids, after.visible_ids) ||
    before.limit !== after.limit ||
    before.count !== after.count ||
    before.released_today !== after.released_today ||
    before.release_count !== after.release_count ||
    !visibleIdsEqual(before.excluded_batch_ids, after.excluded_batch_ids)
  );
}
