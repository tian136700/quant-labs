/**
 * 客户端：今日（北京）日程是否有课。按日缓存，避免每轮轮询都打 Worker。
 * 未拉到前按「无课」处理 → 凌晨可降频（省配额）。
 */

import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const STORAGE_KEY = "vocab_poll_today_has_class_v1";

type CacheRow = { date: string; hasClass: boolean };

let memory: CacheRow | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function readStorage(date: string): boolean | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRow;
    if (parsed?.date === date && typeof parsed.hasClass === "boolean") {
      return parsed.hasClass;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStorage(row: CacheRow): void {
  memory = row;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

/** 同步读缓存；未知则 false（偏省配额） */
export function getVocabPollTodayHasClassSync(now = new Date()): boolean {
  const date = beijingDateString(now);
  if (memory?.date === date) return memory.hasClass;
  const fromStore = readStorage(date);
  if (fromStore != null) {
    memory = { date, hasClass: fromStore };
    return fromStore;
  }
  return false;
}

export function subscribeVocabPollTodayHasClass(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 后台拉一次；同日只打一发请求 */
export function ensureVocabPollTodayHasClassFetched(): void {
  if (typeof fetch === "undefined") return;
  const date = beijingDateString();
  if (memory?.date === date) return;
  const fromStore = readStorage(date);
  if (fromStore != null) {
    memory = { date, hasClass: fromStore };
    return;
  }
  if (inflight) return;

  inflight = (async () => {
    try {
      const res = await fetch("/api/schedule/today-has-class", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        date?: string;
        has_class?: boolean;
      };
      if (data.ok && data.date) {
        const row = {
          date: data.date,
          hasClass: Boolean(data.has_class),
        };
        writeStorage(row);
        notify();
        return row.hasClass;
      }
    } catch {
      /* 失败保持 false，下轮页面再试 */
    } finally {
      inflight = null;
    }
    return false;
  })();
}
