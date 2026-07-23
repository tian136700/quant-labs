import type { EnVocabLevel, EnVocabWord } from "@/lib/types";
import {
  beijingDateString,
  nextTodayCheckCount,
} from "@/lib/en-vocab-daily-check";
import {
  isEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";

/** 同一单词在此时间内改选熟悉程度，视为修正上次判断，不重复计次 */
export const JP_VOCAB_REVIEW_CORRECTION_MS = 15_000;

const EN_VOCAB_LEVELS: EnVocabLevel[] = ["very", "normal", "weak"];

const EN_VOCAB_LEVEL_RANK: Record<EnVocabLevel, number> = {
  weak: 0,
  normal: 1,
  very: 2,
};

const EN_VOCAB_RANK_TO_LEVEL: EnVocabLevel[] = ["weak", "normal", "very"];

export function isEnVocabLevel(value: unknown): value is EnVocabLevel {
  return value === "very" || value === "normal" || value === "weak";
}

/** 两档用法熟悉程度 → 总体（老师卡按用法勾选后汇总） */
export function combineEnVocabUsageLevels(
  a: EnVocabLevel,
  b: EnVocabLevel
): EnVocabLevel {
  if (a === "normal" && b === "normal") return "weak";
  if (
    (a === "very" && b === "weak") ||
    (a === "weak" && b === "very")
  ) {
    return "normal";
  }
  const minRank = Math.min(EN_VOCAB_LEVEL_RANK[a], EN_VOCAB_LEVEL_RANK[b]);
  return EN_VOCAB_RANK_TO_LEVEL[minRank]!;
}

/**
 * N 条用法熟悉程度从左到右 fold 成总体。
 * 空数组抛错；单条原样返回。
 */
export function aggregateEnVocabUsageLevels(
  levels: readonly EnVocabLevel[]
): EnVocabLevel {
  if (!levels.length) {
    throw new Error("usage_levels_empty");
  }
  return levels.reduce((acc, cur) => combineEnVocabUsageLevels(acc, cur));
}

/** 解析存库 JSON（`["very","normal"]`） */
export function parseEnVocabLastUsageLevels(
  raw: string | null | undefined
): EnVocabLevel[] | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    if (!parsed.every(isEnVocabLevel)) return null;
    return parsed as EnVocabLevel[];
  } catch {
    return null;
  }
}

export function serializeEnVocabLastUsageLevels(
  levels: readonly EnVocabLevel[]
): string {
  return JSON.stringify([...levels]);
}

/** 草稿里所有未勾用法下标（0-based）；全部已勾则 [] */
export function listIncompleteEnVocabUsageLevelIndices(
  levels: ReadonlyArray<EnVocabLevel | null | undefined>
): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] == null) out.push(i);
  }
  return out;
}

/** 草稿里第一个未勾用法下标；全部已勾则 -1 */
export function findFirstIncompleteEnVocabUsageLevelIndex(
  levels: ReadonlyArray<EnVocabLevel | null | undefined>
): number {
  const indices = listIncompleteEnVocabUsageLevelIndices(levels);
  return indices.length > 0 ? indices[0]! : -1;
}

/**
 * 点「下一个」/共享时用法未齐的提示文案（列出未勾的 N.用法；不滚动定位）。
 * actionHint 例：「再点「下一个」」「再共享给学生」
 */
export function formatEnVocabUncheckedUsagesHint(
  incompleteIndices: readonly number[],
  actionHint = "再点「下一个」"
): string {
  if (incompleteIndices.length === 0) {
    return `还有用法未勾选熟悉程度，请勾选后${actionHint}。`;
  }
  const labels = incompleteIndices.map((i) => `${i + 1}.用法`).join("、");
  return `此单词的${labels}还未勾选，请勾选后${actionHint}。`;
}

/**
 * 有编号用法时：条数对齐且每条都已勾才算齐。
 * expectedCount≤0（无编号用法）视为不需要按用法齐（整词勾选兜底）。
 */
export function areEnVocabUsageLevelsComplete(
  levels: ReadonlyArray<EnVocabLevel | null | undefined>,
  expectedCount: number
): boolean {
  if (expectedCount <= 0) return true;
  return (
    levels.length === expectedCount &&
    levels.every((lv): lv is EnVocabLevel => lv != null)
  );
}

function isEnVocabReviewToday(
  lastAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString(now);
}

/** 表格 / 抽查卡回显：sessionLevel 优先；否则仅当本轮已勾选且今日有熟悉程度 */
export function effectiveEnVocabDisplayLevel(
  word: EnVocabWord,
  sessionLevel?: EnVocabLevel,
  opts?: {
    now?: Date;
    displayOrder?: EnVocabDailyDisplayOrder;
  }
): EnVocabLevel | undefined {
  if (sessionLevel) return sessionLevel;
  const now = opts?.now ?? new Date();
  const order = opts?.displayOrder;
  if (order?.date) {
    if (order.date !== beijingDateString(now)) return undefined;
    if (!isEnVocabRoundChecked(order, word.id)) return undefined;
  }
  const level = word.last_review_level;
  if (
    level &&
    EN_VOCAB_LEVELS.includes(level) &&
    isEnVocabReviewToday(word.last_review_at, now)
  ) {
    return level;
  }
  return undefined;
}

export function reviewTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function isEnVocabReviewCorrection(
  lastLevel: EnVocabLevel | null | undefined,
  lastAt: string | null | undefined,
  nowMs = Date.now()
): lastLevel is EnVocabLevel {
  if (!lastLevel || !lastAt) return false;
  const t = reviewTimestampMs(lastAt);
  if (t == null) return false;
  return nowMs - t <= JP_VOCAB_REVIEW_CORRECTION_MS;
}

export function formatReviewIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function adjustLevelCount(
  word: EnVocabWord,
  level: EnVocabLevel,
  delta: number
): Pick<EnVocabWord, "cnt_very" | "cnt_normal" | "cnt_weak"> {
  const bump = (n: number) => Math.max(0, n + delta);
  return {
    cnt_very: level === "very" ? bump(word.cnt_very) : word.cnt_very,
    cnt_normal: level === "normal" ? bump(word.cnt_normal) : word.cnt_normal,
    cnt_weak: level === "weak" ? bump(word.cnt_weak) : word.cnt_weak,
  };
}

export function resolveEnVocabPreviousLevel(
  word: EnVocabWord,
  opts: {
    sessionLevel?: EnVocabLevel;
    sessionReviewAtMs?: number;
    nowMs?: number;
  } = {}
): EnVocabLevel | null {
  const nowMs = opts.nowMs ?? Date.now();
  if (
    opts.sessionLevel &&
    opts.sessionReviewAtMs != null &&
    nowMs - opts.sessionReviewAtMs <= JP_VOCAB_REVIEW_CORRECTION_MS
  ) {
    return opts.sessionLevel;
  }
  if (isEnVocabReviewCorrection(word.last_review_level, word.last_review_at, nowMs)) {
    return word.last_review_level ?? null;
  }
  return null;
}

/** 应用一次熟悉程度勾选（新抽查 or 15 秒内改选修正） */
export function applyEnVocabReview(
  word: EnVocabWord,
  level: EnVocabLevel,
  now = new Date(),
  previousLevel?: EnVocabLevel | null
): { word: EnVocabWord; isCorrection: boolean } {
  const ts = formatReviewIso(now);
  const prev =
    previousLevel ??
    resolveEnVocabPreviousLevel(word, { nowMs: now.getTime() });

  if (prev) {
    if (prev === level) {
      return {
        word: {
          ...word,
          last_review_level: level,
          last_review_at: ts,
          updated_at: ts,
        },
        isCorrection: true,
      };
    }
    const afterPrev = { ...word, ...adjustLevelCount(word, prev, -1) };
    return {
      word: {
        ...afterPrev,
        ...adjustLevelCount(afterPrev, level, 1),
        last_review_level: level,
        last_review_at: ts,
        updated_at: ts,
      },
      isCorrection: true,
    };
  }

  const daily = nextTodayCheckCount(
    word.today_check_count ?? 0,
    word.today_check_date,
    now
  );
  return {
    word: {
      ...word,
      ...adjustLevelCount(word, level, 1),
      today_check_count: daily.count,
      today_check_date: daily.date,
      last_review_level: level,
      last_review_at: ts,
      updated_at: ts,
    },
    isCorrection: false,
  };
}
