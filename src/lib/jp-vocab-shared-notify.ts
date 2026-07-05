/** 老师共享单词后通知「今日背单词」页立即刷新（同浏览器多标签） */
const CHANNEL_NAME = "jp-vocab-shared-updated";
const STORAGE_KEY = "jp-vocab-shared-bump";

export type JpVocabSharedNotifyDetail = {
  ts: number;
  wordId?: number;
  openRemarks?: boolean;
};

function parseDetail(raw: unknown): JpVocabSharedNotifyDetail {
  if (raw && typeof raw === "object" && "ts" in raw) {
    const obj = raw as JpVocabSharedNotifyDetail;
    return {
      ts: Number(obj.ts) || Date.now(),
      wordId: obj.wordId != null ? Number(obj.wordId) : undefined,
      openRemarks: Boolean(obj.openRemarks),
    };
  }
  const ts = Number(raw);
  return { ts: Number.isFinite(ts) ? ts : Date.now() };
}

export function notifyJpVocabSharedUpdated(detail?: {
  wordId?: number;
  openRemarks?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const payload: JpVocabSharedNotifyDetail = {
    ts: Date.now(),
    wordId: detail?.wordId,
    openRemarks: detail?.openRemarks,
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

export function subscribeJpVocabSharedUpdated(
  onUpdate: (detail: JpVocabSharedNotifyDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (raw: unknown) => onUpdate(parseDetail(raw));

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
      handler(Number(e.newValue));
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
