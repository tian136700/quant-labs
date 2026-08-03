/** 老师「发送读音」→ 学生端弹框（同浏览器即时 + shared 轮询兜底） */

import type { EnVocabTeacherPronounceSignal } from "@/lib/en-vocab-teacher-quiz-live";

const CHANNEL_NAME = "en-vocab-pronounce-sent";
const STORAGE_KEY = "en-vocab-pronounce-bump";
const HANDLED_AT_KEY = "en-vocab-pronounce-handled-at";

export type EnVocabPronounceNotifyDetail = EnVocabTeacherPronounceSignal & {
  ts: number;
};

export function parseEnVocabTeacherPronouncePayload(
  raw: unknown
): EnVocabTeacherPronounceSignal | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const wordId = Number(obj.word_id);
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  const at = typeof obj.at === "string" ? obj.at.trim() : "";
  if (!Number.isFinite(wordId) || wordId <= 0 || !text || !at) return null;
  return { word_id: Math.floor(wordId), text, at };
}

function parseNotifyDetail(raw: unknown): EnVocabPronounceNotifyDetail | null {
  const signal = parseEnVocabTeacherPronouncePayload(raw);
  if (!signal) return null;
  const ts =
    raw && typeof raw === "object" && "ts" in raw
      ? Number((raw as { ts?: unknown }).ts) || Date.now()
      : Date.now();
  return { ...signal, ts };
}

export function readHandledEnVocabPronounceAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(HANDLED_AT_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function markHandledEnVocabPronounceAt(at: string): void {
  if (typeof window === "undefined") return;
  const clean = at.trim();
  if (!clean) return;
  try {
    sessionStorage.setItem(HANDLED_AT_KEY, clean);
  } catch {
    /* private mode */
  }
}

/** 是否应弹框：at 比本地已处理更新（同一词可多次发送） */
export function shouldHandleEnVocabPronounceSignal(
  signal: EnVocabTeacherPronounceSignal,
  handledAt: string | null
): boolean {
  const at = signal.at;
  const text = signal.text;
  if (!at || !text) return false;
  if (!handledAt) return true;
  return at > handledAt;
}

export function notifyEnVocabPronounceSent(
  signal: EnVocabTeacherPronounceSignal
): void {
  if (typeof window === "undefined") return;
  const payload: EnVocabPronounceNotifyDetail = {
    ...signal,
    ts: Date.now(),
  };
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function subscribeEnVocabPronounceSent(
  onUpdate: (detail: EnVocabPronounceNotifyDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (raw: unknown) => {
    const detail = parseNotifyDetail(raw);
    if (detail) onUpdate(detail);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e) => handler(e.data);
  } catch {
    /* ignore */
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
