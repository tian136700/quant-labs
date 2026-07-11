/** 管理员调整今日抽查数量后，通知其他标签页 / 老师端立即同步 */
const CHANNEL_NAME = "jp-vocab-quiz-target-updated";
const STORAGE_KEY = "jp-vocab-quiz-target-bump";

export type JpVocabQuizTargetNotifyDetail = {
  ts: number;
  quiz_target: number;
  quiz_target_adjusted_at?: string;
};

function parseDetail(raw: unknown): JpVocabQuizTargetNotifyDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<JpVocabQuizTargetNotifyDetail>;
  const quiz_target = Number(obj.quiz_target);
  if (!Number.isFinite(quiz_target) || quiz_target < 1) return null;
  return {
    ts: Number(obj.ts) || Date.now(),
    quiz_target: Math.floor(quiz_target),
    quiz_target_adjusted_at:
      obj.quiz_target_adjusted_at != null
        ? String(obj.quiz_target_adjusted_at)
        : undefined,
  };
}

export function notifyJpVocabQuizTargetUpdated(
  detail: Pick<JpVocabQuizTargetNotifyDetail, "quiz_target" | "quiz_target_adjusted_at">
): void {
  if (typeof window === "undefined") return;
  const payload: JpVocabQuizTargetNotifyDetail = {
    ts: Date.now(),
    quiz_target: detail.quiz_target,
    quiz_target_adjusted_at: detail.quiz_target_adjusted_at,
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

export function subscribeJpVocabQuizTargetUpdated(
  onUpdate: (detail: JpVocabQuizTargetNotifyDetail) => void
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
