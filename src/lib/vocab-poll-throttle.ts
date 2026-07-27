/**
 * 客户端轮询降频：凌晨无人时段 + 测试账号，避免打满 Workers 免费日限额。
 * 所有老师/学生词表 sync、live、study 轮询应经 resolveVocabPollIntervalMs。
 *
 * 凌晨静默（北京 00:00–08:00）在「今日日程有课」时跳过，保持日间频率。
 */

import {
  ensureVocabPollTodayHasClassFetched,
  getVocabPollTodayHasClassSync,
} from "@/lib/vocab-poll-today-has-class";

/** 北京时间：0 点起进入凌晨静默（仅用 END 判断：hour < END） */
export const VOCAB_POLL_QUIET_START_HOUR_BJ = 0;

/** 北京时间：此时起（不含）恢复日间轮询 */
export const VOCAB_POLL_QUIET_END_HOUR_BJ = 8;

/** 凌晨可见标签：轮询间隔 */
export const VOCAB_POLL_QUIET_MS = 300_000; // 5 min

/** 凌晨后台标签 */
export const VOCAB_POLL_QUIET_HIDDEN_MS = 900_000; // 15 min

/**
 * 测试 / 演示账号：白天也用低频（与课表启禁排除集对齐）。
 * 不包含 admin（管理员改目标仍需较快同步）。
 */
export const VOCAB_POLL_LOW_FREQ_USERNAMES = ["test", "user1"] as const;

/** 测试账号可见标签 */
export const VOCAB_POLL_LOW_FREQ_MS = 60_000; // 1 min

/** 测试账号后台标签 */
export const VOCAB_POLL_LOW_FREQ_HIDDEN_MS = 180_000; // 3 min

export function beijingHour(now = new Date()): number {
  const raw = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const h = Number.parseInt(raw, 10);
  // en-GB 偶发 "24" 表示午夜 → 当作 0
  if (h === 24) return 0;
  return Number.isFinite(h) ? h : 0;
}

/**
 * 北京 00:00–08:00。
 * 若今日日程有课（opts / 客户端缓存），不算静默。
 */
export function isVocabPollQuietHours(
  now = new Date(),
  opts?: { todayHasClass?: boolean }
): boolean {
  const h = beijingHour(now);
  if (h >= VOCAB_POLL_QUIET_END_HOUR_BJ) return false;
  const hasClass =
    opts?.todayHasClass ?? getVocabPollTodayHasClassSync(now);
  if (hasClass) return false;
  return true;
}

export function isVocabPollLowFreqUsername(
  username?: string | null
): boolean {
  const lower = (username ?? "").trim().toLowerCase();
  if (!lower) return false;
  return (VOCAB_POLL_LOW_FREQ_USERNAMES as readonly string[]).includes(lower);
}

export type ResolveVocabPollIntervalOptions = {
  activeMs: number;
  hiddenMs: number;
  /** 今日抽完后的可见间隔；有则参与 idle 档 */
  idleCompleteMs?: number;
  idleCompleteHiddenMs?: number;
  idleComplete?: boolean;
  username?: string | null;
  now?: Date;
  /** 未传则读 document.hidden（仅浏览器） */
  hidden?: boolean;
  /** 显式传入时优先；否则读客户端「今日有课」缓存 */
  todayHasClass?: boolean;
};

/**
 * 优先级：凌晨静默（无课时）→ 测试账号低频 → 抽完 idle → 日间 active/hidden。
 */
export function resolveVocabPollIntervalMs(
  opts: ResolveVocabPollIntervalOptions
): number {
  const hidden =
    opts.hidden ??
    (typeof document !== "undefined" ? document.hidden : false);
  const now = opts.now ?? new Date();

  // 按日拉一次「今日有课」，供凌晨判断；失败则按无课降频
  ensureVocabPollTodayHasClassFetched();

  if (
    isVocabPollQuietHours(now, {
      todayHasClass: opts.todayHasClass,
    })
  ) {
    return hidden ? VOCAB_POLL_QUIET_HIDDEN_MS : VOCAB_POLL_QUIET_MS;
  }

  if (isVocabPollLowFreqUsername(opts.username)) {
    if (opts.idleComplete) {
      const idleMs = opts.idleCompleteMs ?? VOCAB_POLL_LOW_FREQ_MS;
      const idleHidden =
        opts.idleCompleteHiddenMs ?? VOCAB_POLL_LOW_FREQ_HIDDEN_MS;
      return hidden
        ? Math.max(VOCAB_POLL_LOW_FREQ_HIDDEN_MS, idleHidden)
        : Math.max(VOCAB_POLL_LOW_FREQ_MS, idleMs);
    }
    return hidden ? VOCAB_POLL_LOW_FREQ_HIDDEN_MS : VOCAB_POLL_LOW_FREQ_MS;
  }

  if (opts.idleComplete) {
    const idleMs = opts.idleCompleteMs ?? opts.activeMs;
    const idleHidden = opts.idleCompleteHiddenMs ?? opts.hiddenMs;
    return hidden ? idleHidden : idleMs;
  }

  return hidden ? opts.hiddenMs : opts.activeMs;
}
