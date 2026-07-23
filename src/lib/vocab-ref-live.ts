/**
 * 教案「查看」页：仅在随手画「保存为最新教案」后换图。
 * 静默拉 ?meta=1（只读 D1）；updated_at 未变则 UI 不动；禁止整页 reload。
 */

import { enVocabRefApiPath } from "@/lib/en-vocab-ref-shared";
import { jpVocabRefApiPath } from "@/lib/jp-vocab-ref-shared";

/** 查看页可见时探测间隔（≥5s；未保存时 UI 不刷新） */
export const VOCAB_REF_LIVE_POLL_MS = 10_000;

/** 后台标签降频 */
export const VOCAB_REF_LIVE_POLL_HIDDEN_MS = 30_000;

const CHANNEL_NAME = "vocab-ref-updated";
const STORAGE_KEY = "vocab-ref-updated-bump";

export type VocabRefSubject = "jp" | "en";

export type VocabRefUpdatedDetail = {
  subject: VocabRefSubject;
  refKey: string;
  updatedAt: string;
  ts: number;
};

export type VocabRefMetaResponse = {
  ref_key: string;
  updated_at: string;
  media_type: "image" | "pdf";
};

function parseDetail(raw: unknown): VocabRefUpdatedDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const subject = obj.subject === "en" ? "en" : obj.subject === "jp" ? "jp" : null;
  const refKey = typeof obj.refKey === "string" ? obj.refKey.trim() : "";
  const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt.trim() : "";
  if (!subject || !refKey || !updatedAt) return null;
  return {
    subject,
    refKey,
    updatedAt,
    ts: Number(obj.ts) || Date.now(),
  };
}

/** 随手画保存成功后广播（同浏览器多标签立刻换图；跨设备靠 meta 轮询） */
export function notifyVocabRefUpdated(detail: {
  subject: VocabRefSubject;
  refKey: string;
  updatedAt: string;
}): void {
  if (typeof window === "undefined") return;
  const refKey = detail.refKey.trim();
  const updatedAt = detail.updatedAt.trim();
  if (!refKey || !updatedAt) return;
  const payload: VocabRefUpdatedDetail = {
    subject: detail.subject,
    refKey,
    updatedAt,
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

export function subscribeVocabRefUpdated(
  onUpdate: (detail: VocabRefUpdatedDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (raw: unknown) => {
    const detail = parseDetail(raw);
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

export function vocabRefMetaApiPath(
  subject: VocabRefSubject,
  refKey: string
): string {
  return subject === "en"
    ? enVocabRefApiPath(refKey, { meta: true })
    : jpVocabRefApiPath(refKey, { meta: true });
}
