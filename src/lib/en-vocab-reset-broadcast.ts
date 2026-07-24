/** 管理员重置后通知同域其它标签页（老师端）清本会话勾选 / 抽查卡 */

const CHANNEL = "en-vocab-admin-reset-v1";
const STORAGE_KEY = "en-vocab-admin-reset-at";

export type EnVocabAdminResetScope = "today" | "all";

export function publishEnVocabAdminReset(scope: EnVocabAdminResetScope): void {
  if (typeof window === "undefined") return;
  const payload = { type: "en-vocab-admin-reset" as const, scope, at: Date.now() };
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* BroadcastChannel 不可用时走 storage */
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(payload.at));
  } catch {
    /* private mode */
  }
}

/** 其它标签页收到重置时回调；同页 publish 不会靠 storage 回环，需自行清状态 */
export function subscribeEnVocabAdminReset(onReset: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = () => {
      onReset();
    };
  } catch {
    bc = null;
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) onReset();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
    window.removeEventListener("storage", onStorage);
  };
}

/** 服务端重置后词条：无熟悉程度、无今日计次 → 应清掉老师端 sessionLevel */
export function isEnVocabServerReviewCleared(word: {
  last_review_level?: string | null;
  last_review_at?: string | null;
  today_check_count?: number | null;
  today_check_date?: string | null;
}): boolean {
  const level = word.last_review_level;
  const todayCount = word.today_check_count ?? 0;
  return (
    (level == null || level === "") &&
    todayCount <= 0 &&
    !word.today_check_date
  );
}
