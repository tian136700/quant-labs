import { beijingDateString, effectiveTodayCheckCount, jpVocabTodayCheckStats } from "@/lib/jp-vocab-daily-check";
import {
  buildJpVocabDailySeqMap,
  isJpVocabRoundChecked,
} from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import { JP_VOCAB_DAILY_QUIZ_TOP } from "@/lib/jp-vocab-daily-quiz-progress";
import { isJpVocabReviewToday, reviewTimestampMs } from "@/lib/jp-vocab-review";
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
  /** 管理员设置的当日抽查目标数量（同时决定老师端可见词条池大小） */
  quiz_target: number;
  /** 老师端是否隐藏今日已抽查的词条（默认 true） */
  hide_checked_today?: boolean;
  /** 今日是否已根据抽查数量生成可见批次（持久化；老师端据此自动展示） */
  released_today: boolean;
  /** 今日可见词条池大小（与 visible_ids 长度一致，兼容旧字段名） */
  release_count: number;
  /** @deprecated 保留字段兼容旧数据 */
  excluded_batch_ids?: number[];
  /** 老师当前可见词条 id（由今日抽查数量每次加载时重算） */
  visible_ids?: number[];
  /** 管理员最近一次调整抽查目标的时间（北京时间 YYYY-MM-DD HH:mm:ss） */
  quiz_target_adjusted_at?: string;
  /** @deprecated 旧版 sticky 批次，新逻辑改按 quiz_target_adjusted_at 与 last_review_at 比较 */
  sticky_visible_ids?: number[];
  /** @deprecated */
  quiz_target_base_checked?: number;
};

function normalizeStickyVisibleIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.map((id) => Number(id)).filter((id) => id > 0);
  return ids.length ? ids : undefined;
}

function normalizeQuizTargetAdjustedAt(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function normalizeQuizTargetBaseChecked(raw: unknown): number | undefined {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return undefined;
}

/** 词条当日序号是否在管理员设定的今日抽查数量范围内（1…quiz_target） */
export function isJpVocabWordInDailyQuizTarget(
  wordId: number,
  quizTarget: number,
  dailySeqByWordId: ReadonlyMap<number, number>
): boolean {
  const seq = dailySeqByWordId.get(wordId);
  if (!seq || seq <= 0) return false;
  const target = Math.max(0, Math.floor(quizTarget));
  return target > 0 && seq <= target;
}

/** 隐藏模式：今日最后一次勾选早于「调整抽查目标时间」则隐藏；今日未勾选则显示 */
export function isJpVocabWordHiddenBeforeTargetAdjustment(
  word: JpVocabWord,
  quizTargetAdjustedAt: string | null | undefined,
  now = new Date()
): boolean {
  const adjustedMs = reviewTimestampMs(quizTargetAdjustedAt);
  if (adjustedMs == null) return false;
  if (!isJpVocabReviewToday(word.last_review_at, now)) return false;
  const reviewMs = reviewTimestampMs(word.last_review_at);
  if (reviewMs == null) return false;
  return reviewMs < adjustedMs;
}

/** 管理员调高抽查目标后，相对旧可见池新增的词条 id（仅兼容旧数据） */
export function computeJpVocabStickyVisibleIds(
  previousVisible: number[],
  nextVisible: number[]
): number[] {
  const previousSet = new Set(previousVisible);
  return nextVisible.filter((id) => !previousSet.has(id));
}

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

function normalizeHideCheckedToday(raw: unknown): boolean {
  return raw !== false;
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
  const hide_checked_today = normalizeHideCheckedToday(raw?.hide_checked_today);
  const released_today = inferReleasedToday(raw);
  const parsedReleaseCount = Number(raw?.release_count ?? raw?.count);
  const release_count =
    released_today &&
    Number.isFinite(parsedReleaseCount) &&
    parsedReleaseCount >= 1
      ? Math.min(Math.floor(parsedReleaseCount), 999)
      : quiz_target;

  if (raw?.date === today) {
    return {
      date: today,
      limit,
      count: normalizeVisibleCount(raw?.count, limit),
      quiz_target,
      hide_checked_today,
      released_today,
      release_count,
      excluded_batch_ids: normalizeExcludedBatchIds(raw?.excluded_batch_ids),
      visible_ids: normalizeVisibleIds(raw?.visible_ids),
      sticky_visible_ids: normalizeStickyVisibleIds(raw?.sticky_visible_ids),
      quiz_target_adjusted_at: normalizeQuizTargetAdjustedAt(
        raw?.quiz_target_adjusted_at
      ),
      quiz_target_base_checked: normalizeQuizTargetBaseChecked(
        raw?.quiz_target_base_checked
      ),
    };
  }

  /** 明确跨日：恢复默认可见批次，抽查目标回到 20（由 nightly rollover 触发） */
  if (raw?.date && raw.date !== today) {
    return {
      date: today,
      limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
      count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
      quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
      hide_checked_today: true,
      released_today: false,
      release_count: JP_VOCAB_DAILY_QUIZ_TOP,
      excluded_batch_ids: [],
    };
  }

  /** 缺少 date 的旧数据：视为当日记录，保留管理员设置的 quiz_target */
  if (raw) {
    return {
      date: today,
      limit,
      count: normalizeVisibleCount(raw?.count, limit),
      quiz_target,
      hide_checked_today,
      released_today,
      release_count,
      excluded_batch_ids: normalizeExcludedBatchIds(raw?.excluded_batch_ids),
      visible_ids: normalizeVisibleIds(raw?.visible_ids),
      sticky_visible_ids: normalizeStickyVisibleIds(raw?.sticky_visible_ids),
      quiz_target_adjusted_at: normalizeQuizTargetAdjustedAt(
        raw?.quiz_target_adjusted_at
      ),
      quiz_target_base_checked: normalizeQuizTargetBaseChecked(
        raw?.quiz_target_base_checked
      ),
    };
  }

  return {
    date: today,
    limit: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    count: JP_VOCAB_TEACHER_VISIBLE_DEFAULT,
    quiz_target: JP_VOCAB_DAILY_QUIZ_TOP,
    hide_checked_today: true,
    released_today: false,
    release_count: JP_VOCAB_DAILY_QUIZ_TOP,
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

/** 今日已在 DB 记为抽查过的词条 id，按当日序号升序 */
export function jpVocabTodayCheckedIdsInOrder(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  now = new Date()
): number[] {
  const wordById = new Map(words.map((w) => [w.id, w]));
  return displayOrder.ids.filter((id) => {
    const word = wordById.get(id);
    return word && isJpVocabWordTodayCheckedInDb(word, now);
  });
}

/**
 * 可见池是否未纳入应有的今日已抽查词条（例如管理员调高目标时只补了未抽查词）。
 */
function jpVocabTeacherVisiblePoolMissingTodayChecked(
  visibleIds: number[],
  todayCheckedIds: number[],
  target: number
): boolean {
  if (!todayCheckedIds.length || !visibleIds.length) return false;
  const pool = new Set(visibleIds);
  const checkedInPool = todayCheckedIds.filter((id) => pool.has(id)).length;
  const expectedInPool = Math.min(todayCheckedIds.length, target);
  return checkedInPool < expectedInPool;
}

/** 可见池中「今日未抽查」词条是否超过今日剩余任务数 */
function jpVocabTeacherVisiblePoolHasExcessUnchecked(
  visibleIds: number[],
  todayCheckedIds: number[],
  target: number
): boolean {
  if (!visibleIds.length || target <= 0) return false;
  const checkedSet = new Set(todayCheckedIds);
  const uncheckedInPool = visibleIds.filter((id) => !checkedSet.has(id)).length;
  const remaining = Math.max(0, target - todayCheckedIds.length);
  return uncheckedInPool > remaining;
}

function jpVocabTeacherVisiblePoolNeedsRebuild(
  visibleIds: number[] | undefined,
  todayCheckedIds: number[],
  target: number
): boolean {
  if (!visibleIds?.length) return true;
  if (visibleIds.length !== target) return true;
  if (jpVocabTeacherVisiblePoolMissingTodayChecked(visibleIds, todayCheckedIds, target)) {
    return true;
  }
  return jpVocabTeacherVisiblePoolHasExcessUnchecked(
    visibleIds,
    todayCheckedIds,
    target
  );
}

/**
 * 今日剩余待抽查数量 = 管理员目标 − 全库今日已抽查词条数。
 */
export function jpVocabDailyQuizRemaining(
  words: JpVocabWord[],
  quizTarget: number,
  now = new Date()
): number {
  const target = Math.max(0, Math.floor(quizTarget));
  if (target <= 0) return 0;
  const { wordCount } = jpVocabTodayCheckStats(words, now);
  return Math.max(0, target - wordCount);
}

/**
 * 按「今日抽查目标」组装可见池：先纳入今日已抽查词条，再用未抽查词条补足至目标数。
 */
function buildJpVocabQuizTargetVisibleIds(
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  target: number,
  now = new Date()
): number[] {
  const goal = Math.max(1, Math.floor(target));
  const wordById = new Map(words.map((w) => [w.id, w]));
  const visible_ids: number[] = [];
  const inPool = new Set<number>();

  for (const id of jpVocabTodayCheckedIdsInOrder(displayOrder, words, now)) {
    if (visible_ids.length >= goal) break;
    visible_ids.push(id);
    inPool.add(id);
  }

  const needed = goal - visible_ids.length;
  if (needed > 0) {
    for (const id of pickJpVocabTeacherVisibleReleaseIds(
      displayOrder,
      words,
      needed,
      [...inPool],
      now
    )) {
      visible_ids.push(id);
      inPool.add(id);
    }
  }

  return visible_ids.slice(0, goal);
}

/**
 * 根据「今日抽查数量」生成老师可见词条池：
 * 1. 保留当前池中今日已抽查的词条
 * 2. 保留当前池中今日未抽查的词条
 * 3. 不足目标数时，优先从未抽查过的词条补足，再按当日序号升序补足（跳过今日已抽查）
 * 4. 若池中缺少今日已抽查词条（与进度条不一致），整池重算为「已抽查 + 待抽查」
 */
export function applyJpVocabQuizTargetVisiblePlan(
  stored: JpVocabTeacherVisibleLimit,
  displayOrder: JpVocabDailyDisplayOrder,
  words: JpVocabWord[],
  now = new Date()
): JpVocabTeacherVisibleLimit {
  const target = Math.max(1, Math.floor(stored.quiz_target));
  const previousVisible = stored.visible_ids ?? [];
  const wordById = new Map(words.map((w) => [w.id, w]));
  const todayCheckedIds = jpVocabTodayCheckedIdsInOrder(
    displayOrder,
    words,
    now
  );
  const poolMissingChecked = jpVocabTeacherVisiblePoolNeedsRebuild(
    previousVisible,
    todayCheckedIds,
    target
  );

  let visible_ids: number[];

  if (!previousVisible.length || poolMissingChecked) {
    visible_ids = buildJpVocabQuizTargetVisibleIds(
      displayOrder,
      words,
      target,
      now
    );
  } else {
    visible_ids = [];
    const inPool = new Set<number>();

    for (const id of previousVisible) {
      const word = wordById.get(id);
      if (!word) continue;
      visible_ids.push(id);
      inPool.add(id);
    }

    for (const id of todayCheckedIds) {
      if (visible_ids.length >= target) break;
      if (inPool.has(id)) continue;
      visible_ids.push(id);
      inPool.add(id);
    }

    const needed = Math.max(0, target - visible_ids.length);
    if (needed > 0) {
      for (const id of pickJpVocabTeacherVisibleReleaseIds(
        displayOrder,
        words,
        needed,
        [...inPool],
        now
      )) {
        visible_ids.push(id);
        inPool.add(id);
      }
    } else if (visible_ids.length > target) {
      visible_ids.splice(target);
    }
  }

  if (!visible_ids.length) {
    return stored;
  }

  const plan = buildReleasePlanFromVisibleIds(visible_ids, displayOrder);
  return {
    ...stored,
    released_today: true,
    release_count: visible_ids.length,
    limit: plan.limit,
    count: plan.count,
    visible_ids: plan.visible_ids,
  };
}

/**
 * 是否需要在读库后重算可见词条池。
 * 目标数变大、或池中缺少今日已抽查词条时需重算；避免每次请求全量扫词写库（易触发 Worker CPU 超限）。
 */
export function shouldMaterializeJpVocabTeacherVisibleLimit(
  stored: Pick<
    JpVocabTeacherVisibleLimit,
    "quiz_target" | "visible_ids" | "released_today"
  >,
  ctx?: {
    displayOrder?: JpVocabDailyDisplayOrder;
    words?: JpVocabWord[];
    now?: Date;
  }
): boolean {
  const target = Math.max(1, Math.floor(stored.quiz_target));
  const visibleIds = stored.visible_ids;
  const { displayOrder, words, now } = ctx ?? {};

  if (!visibleIds?.length) {
    return (
      stored.released_today === true ||
      target > JP_VOCAB_TEACHER_VISIBLE_DEFAULT
    );
  }

  if (visibleIds.length !== target) return true;

  if (!displayOrder?.ids.length || !words?.length) return false;

  const todayCheckedIds = jpVocabTodayCheckedIdsInOrder(
    displayOrder,
    words,
    now
  );
  return jpVocabTeacherVisiblePoolNeedsRebuild(
    visibleIds,
    todayCheckedIds,
    target
  );
}

/**
 * 根据数据库中的抽查数量与可见批次标志重算老师可见词条。
 * 仅在 shouldMaterialize 为 true 或管理员确认设置时调用。
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

  return applyJpVocabQuizTargetVisiblePlan(stored, displayOrder, words, now);
}

export function filterJpVocabWordsByTeacherVisibleLimit(
  words: JpVocabWord[],
  displayOrder: JpVocabDailyDisplayOrder,
  visible: Pick<
    JpVocabTeacherVisibleLimit,
    | "limit"
    | "count"
    | "visible_ids"
    | "hide_checked_today"
    | "quiz_target"
    | "released_today"
    | "quiz_target_adjusted_at"
  >,
  now = new Date()
): JpVocabWord[] {
  if (!words.length) return [];

  const quizTarget = Math.max(0, Math.floor(visible.quiz_target ?? 0));
  let filtered: JpVocabWord[];

  if (visible.visible_ids?.length) {
    const idSet = new Set(visible.visible_ids);
    const orderIndex = new Map(displayOrder.ids.map((id, index) => [id, index]));
    filtered = words
      .filter((word) => idSet.has(word.id))
      .sort(
        (a, b) =>
          (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  } else if (
    quizTarget > 0 &&
    (visible.released_today || quizTarget > JP_VOCAB_TEACHER_VISIBLE_DEFAULT)
  ) {
    const resolvedIds = buildJpVocabQuizTargetVisibleIds(
      displayOrder,
      words,
      quizTarget,
      now
    );
    const idSet = new Set(resolvedIds);
    const orderIndex = new Map(displayOrder.ids.map((id, index) => [id, index]));
    filtered = words
      .filter((word) => idSet.has(word.id))
      .sort(
        (a, b) =>
          (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  } else if (visible.limit <= 0) {
    return [];
  } else {
    const seqMap = buildJpVocabDailySeqMap(displayOrder.ids);
    const { start, end } = jpVocabTeacherVisibleRange(visible);
    filtered = words.filter((word) => {
      const seq = seqMap.get(word.id) ?? Infinity;
      return seq >= start && seq <= end;
    });
  }

  if (normalizeHideCheckedToday(visible.hide_checked_today)) {
    const adjustedAt = visible.quiz_target_adjusted_at;
    if (adjustedAt) {
      filtered = filtered.filter(
        (word) =>
          !isJpVocabWordHiddenBeforeTargetAdjustment(word, adjustedAt, now)
      );
    }
  }

  return filtered;
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
    before.quiz_target !== after.quiz_target ||
    before.hide_checked_today !== after.hide_checked_today ||
    before.quiz_target_adjusted_at !== after.quiz_target_adjusted_at ||
    !visibleIdsEqual(before.excluded_batch_ids, after.excluded_batch_ids)
  );
}
