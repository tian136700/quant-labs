import type { EnVocabLevel, EnVocabWord } from "@/lib/types";
import {
  beijingDateString,
  beijingDateTimeString,
  effectiveTodayCheckCount,
  nextTodayCheckCount,
} from "@/lib/en-vocab-daily-check";
import {
  isEnVocabRoundChecked,
  type EnVocabDailyDisplayOrder,
} from "@/lib/en-vocab-daily-order";
import { parseBeijingDateTime } from "@/lib/jp-lesson-shared";

/**
 * 短窗修正（遗留；英语正式规则见「同日修正」）。
 * 按用法勾选常超过 15s，不可再靠这个防重复计次。
 */
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

/**
 * 抽查卡用法旁勾选回显：本会话草稿优先，其次库里 last_usage_levels（条数须对齐）。
 * 不依赖整词 selected——点「上一个」回看已勾词时也要能回显每条档。
 */
export function resolveEnVocabUsageDraftLevels(
  usageSlotCount: number,
  sessionDraft: ReadonlyArray<EnVocabLevel | null | undefined> | undefined,
  storedRaw: string | null | undefined
): Array<EnVocabLevel | null | undefined> {
  if (usageSlotCount <= 0) return [];
  if (sessionDraft && sessionDraft.length === usageSlotCount) {
    return [...sessionDraft];
  }
  const stored = parseEnVocabLastUsageLevels(storedRaw);
  if (stored && stored.length === usageSlotCount) {
    return [...stored];
  }
  return Array.from({ length: usageSlotCount }, () => null);
}

function isEnVocabReviewToday(
  lastAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!lastAt) return false;
  return lastAt.slice(0, 10) === beijingDateString(now);
}

/** 表格 / 抽查卡回显：sessionLevel 优先；否则今日已抽（北京）才显示 */
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
  const level = word.last_review_level;
  const reviewedToday =
    Boolean(level) &&
    EN_VOCAB_LEVELS.includes(level as EnVocabLevel) &&
    (hasEnVocabTodayCheckCounted(word, now) ||
      isEnVocabReviewToday(word.last_review_at, now));
  if (!reviewedToday || !level) return undefined;

  const order = opts?.displayOrder;
  if (order?.date) {
    if (order.date !== beijingDateString(now)) return undefined;
    // 本轮 round_checked；若今日已计次则仍认（防 sync/缓存短暂丢 round_checked → 进度条卡 0）
    if (
      !isEnVocabRoundChecked(order, word.id) &&
      !hasEnVocabTodayCheckCounted(word, now)
    ) {
      return undefined;
    }
  }
  return level;
}

export function reviewTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  // 与日语一致：无 T 的墙钟按北京时间解析（formatReviewIso 写的是北京墙钟）
  if (!iso.includes("T")) {
    const beijing = parseBeijingDateTime(iso);
    if (beijing) return beijing.getTime();
  }
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/** 勾选熟悉程度后满 1 小时不可再改（与日语一致；不按「已共享 / 学生 peek」锁） */
export const EN_VOCAB_REVIEW_LOCK_MS = 60 * 60 * 1000;

function effectiveEnVocabReviewTimestampMs(
  word: EnVocabWord,
  sessionReviewAtMs?: number,
  now = new Date()
): number | null {
  const storedMs = reviewTimestampMs(word.last_review_at);
  if (sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(sessionReviewAtMs));
    if (sessionDay === beijingDateString(now)) {
      return Math.max(storedMs ?? 0, sessionReviewAtMs);
    }
  }
  return storedMs;
}

export function hasEnVocabReviewToday(
  word: EnVocabWord,
  sessionReviewAtMs?: number,
  now = new Date()
): boolean {
  if (sessionReviewAtMs != null) {
    const sessionDay = beijingDateString(new Date(sessionReviewAtMs));
    if (sessionDay === beijingDateString(now)) return true;
  }
  // 以 today_check_date（北京日）为准；last_review_at 在 Worker 上是 UTC 墙钟，清晨会错日
  if (hasEnVocabTodayCheckCounted(word, now)) {
    return true;
  }
  return isEnVocabReviewToday(word.last_review_at, now);
}

/** 今日已勾选且距上次勾选已满 1 小时 */
export function isEnVocabWordReviewLocked(
  word: EnVocabWord,
  opts?: { sessionReviewAtMs?: number; now?: Date }
): boolean {
  const now = opts?.now ?? new Date();
  if (!hasEnVocabReviewToday(word, opts?.sessionReviewAtMs, now)) return false;
  const reviewMs = effectiveEnVocabReviewTimestampMs(
    word,
    opts?.sessionReviewAtMs,
    now
  );
  if (reviewMs == null || reviewMs <= 0) return false;
  return now.getTime() - reviewMs >= EN_VOCAB_REVIEW_LOCK_MS;
}

/** @deprecated 英语请用 resolveEnVocabPreviousLevel（同日 today_check）；保留短窗兼容旧调用 */
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

/**
 * 今日是否已计过抽查（北京日 today_check_date）。
 * 统计只记「整词总体熟悉程度」一次：同日再改档（含改某一用法后重汇总）只换档、不 +1。
 */
export function hasEnVocabTodayCheckCounted(
  word: Pick<EnVocabWord, "today_check_count" | "today_check_date">,
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

export function formatReviewIso(now = new Date()): string {
  return beijingDateTimeString(now);
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
  const now = new Date(nowMs);
  // 本会话已勾过（同一北京日）→ 改档视为修正
  if (
    opts.sessionLevel &&
    opts.sessionReviewAtMs != null &&
    beijingDateString(new Date(opts.sessionReviewAtMs)) ===
      beijingDateString(now)
  ) {
    return opts.sessionLevel;
  }
  // 今日已计过抽查次数 → 只改总体档，不重复计次（按用法勾选常 >15s）
  if (
    word.last_review_level &&
    isEnVocabLevel(word.last_review_level) &&
    hasEnVocabTodayCheckCounted(word, now)
  ) {
    return word.last_review_level;
  }
  if (
    isEnVocabReviewCorrection(word.last_review_level, word.last_review_at, nowMs)
  ) {
    return word.last_review_level ?? null;
  }
  return null;
}

/** 应用一次熟悉程度勾选（新抽查 or 同日改选修正总体档） */
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
