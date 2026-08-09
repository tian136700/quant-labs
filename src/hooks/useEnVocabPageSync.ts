"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  JP_VOCAB_CACHE_KEY,
  JP_VOCAB_REFRESH_TTL_MS,
  parseEnVocabApi,
  type EnVocabApiPayload,
} from "@/lib/en-api-cache";
import {
  fetchWithClientCache,
  readClientCacheAge,
} from "@/lib/client-swr-cache";
import {
  readEnVocabPageCache,
  persistEnVocabPageCache,
} from "@/lib/en-vocab-page-cache";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  isEnVocabServerReviewCleared,
  subscribeEnVocabAdminReset,
} from "@/lib/en-vocab-reset-broadcast";
import {
  EN_VOCAB_TEACHER_VISIBLE_POLL_MS,
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  maxEnVocabUpdatedAt,
  mergeEnVocabSyncPatches,
} from "@/lib/en-vocab-sync";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";
import {
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS,
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS,
} from "@/lib/vocab-teacher-quiz-sync-poll";
import {
  defaultEnVocabTeacherVisibleLimit,
  normalizeEnVocabTeacherVisibleLimit,
  shouldRejectStaleEnVocabTeacherVisibleLimit,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";
import { writeClientCache } from "@/lib/client-swr-cache";
import { subscribeEnVocabQuizTargetUpdated } from "@/lib/en-vocab-quiz-target-notify";

export function useEnVocabPageSync(options: {
  checking: boolean;
  user: { id: number; username?: string } | null;
  editingRemarksWordId: number | null;
  editingWordId: number | null;
  setViewingRemarksWord: Dispatch<SetStateAction<EnVocabWord | null>>;
  onLoadError: (message: string) => void;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, EnVocabLevel | undefined>>
  >;
  setSessionUsageLevels: Dispatch<
    SetStateAction<Record<number, Array<EnVocabLevel | null | undefined>>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  /** 管理员重置后清抽查会话 / 关卡片（由页面写入最新 setter） */
  onRemoteResetClearSessionRef: MutableRefObject<(() => void) | null>;
  /** 仅老师抽查会话进行中才后台轮询；管理员与老师 idle 靠点「刷新」 */
  enableBackgroundSyncPoll?: boolean;
  /** 开卡后半小时无勾选熟悉程度 → 降频 */
  teacherQuizIdleRef?: MutableRefObject<boolean>;
  /** idle 态变化时重排 timer（再勾选立刻恢复日间间隔） */
  teacherQuizPollIdle?: boolean;
}) {
  const {
    checking,
    user,
    editingRemarksWordId,
    editingWordId,
    setViewingRemarksWord,
    onLoadError,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    onRemoteResetClearSessionRef,
    enableBackgroundSyncPoll = false,
    teacherQuizIdleRef,
    teacherQuizPollIdle = false,
  } = options;

  const usernameRef = useRef(user?.username);
  usernameRef.current = user?.username;

  const [words, setWords] = useState<EnVocabWord[]>([]);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharedTodayWordIds, setSharedTodayWordIds] = useState<Set<number>>(
    () => new Set(readEnVocabPageCache()?.shared_today_word_ids ?? [])
  );
  const [teacherVisibleLimit, setTeacherVisibleLimit] =
    useState<EnVocabTeacherVisibleLimit>(
      () =>
        readEnVocabPageCache()?.teacher_visible_limit ??
        defaultEnVocabTeacherVisibleLimit()
    );
  const [displayOrder, setDisplayOrder] = useState<EnVocabDailyDisplayOrder>({
    date: "",
    ids: [],
    round_checked_ids: [],
  });

  const displayOrderRef = useRef(displayOrder);
  const wordsRef = useRef(words);
  const refsRef = useRef(refs);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    displayOrderRef.current = displayOrder;
  }, [displayOrder]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);

  const applyVocabPayload = useCallback((payload: EnVocabApiPayload) => {
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);
    setSharedTodayWordIds(new Set(payload.shared_today_word_ids ?? []));
    setTeacherVisibleLimit((prev) => {
      const next = normalizeEnVocabTeacherVisibleLimit(
        payload.teacher_visible_limit
      );
      if (shouldRejectStaleEnVocabTeacherVisibleLimit(prev, next)) return prev;
      return next;
    });
  }, []);

  const applyTeacherVisibleSync = useCallback(
    (
      raw: Partial<EnVocabTeacherVisibleLimit> | undefined,
      opts?: { trustRemote?: boolean }
    ) => {
      if (!raw) return;
      const next = normalizeEnVocabTeacherVisibleLimit(raw);
      setTeacherVisibleLimit((prev) => {
        // 轻量 teacher-visible（bypassCache）是跨端真相源：须覆盖本地 SWR 旧目标（如手机仍 32）
        // 全量 /sync 仍走 stale 拒绝，避免刚保存后被 isolate 旧快照打回
        if (
          !opts?.trustRemote &&
          shouldRejectStaleEnVocabTeacherVisibleLimit(prev, next)
        ) {
          return prev;
        }
        if (
          prev.quiz_target === next.quiz_target &&
          prev.date === next.date &&
          (prev.visible_ids?.join(",") ?? "") ===
            (next.visible_ids?.join(",") ?? "") &&
          (prev.quiz_target_adjusted_at || "") ===
            (next.quiz_target_adjusted_at || "")
        ) {
          return prev;
        }
        const cached = readEnVocabPageCache();
        if (cached) {
          writeClientCache(JP_VOCAB_CACHE_KEY, {
            ...cached,
            teacher_visible_limit: next,
          });
        }
        return next;
      });
    },
    []
  );

  const syncTeacherVisibleLimitFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/en-vocab/teacher-visible", {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        teacher_visible_limit?: Partial<EnVocabTeacherVisibleLimit>;
      };
      if (data.ok) {
        applyTeacherVisibleSync(data.teacher_visible_limit, {
          trustRemote: true,
        });
      }
    } catch {
      /* ignore — 不得拖住词表 loading */
    }
  }, [applyTeacherVisibleSync]);

  const loadWords = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readEnVocabPageCache();
    const hasCache = cached != null;
    const cacheAge = readClientCacheAge(JP_VOCAB_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_VOCAB_REFRESH_TTL_MS;

    if (hasCache) {
      applyVocabPayload(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setLoading(true);
    }

    onLoadError("");
    // 并行拉今日抽查数量，但禁止在 finally 里 await——teacher-visible / 1102 卡住会整页永远「加载中」
    void syncTeacherVisibleLimitFromServer();
    try {
      const payload = await fetchWithClientCache(
        JP_VOCAB_CACHE_KEY,
        "/api/en-vocab",
        parseEnVocabApi,
        {
          onCached: applyVocabPayload,
          ttlMs: JP_VOCAB_REFRESH_TTL_MS,
          force: opts?.force,
        }
      );
      applyVocabPayload(payload);
    } catch (err) {
      if (!hasCache) {
        onLoadError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyVocabPayload, onLoadError, syncTeacherVisibleLimitFromServer]);

  useEffect(() => {
    if (checking || !user) return;
    void loadWords().catch(() => {
      /* onLoadError 已在 loadWords 内处理 */
    });
  }, [loadWords, checking, user]);

  const applySyncPatches = useCallback((patches: EnVocabWord[]) => {
    if (!patches.length) return;
    const clearedIds = patches
      .filter(isEnVocabServerReviewCleared)
      .map((w) => w.id);
    if (clearedIds.length) {
      const cleared = new Set(clearedIds);
      setSessionLevel((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of cleared) {
          if (next[id] != null) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setSessionUsageLevels((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of cleared) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setSessionReviewAt((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of cleared) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setDisplayOrder((prev) => {
        const prevRound = prev.round_checked_ids ?? [];
        if (!prevRound.length) return prev;
        const nextRound = prevRound.filter((id) => !cleared.has(id));
        if (nextRound.length === prevRound.length) return prev;
        return { ...prev, round_checked_ids: nextRound };
      });
    }
    setWords((prev) => {
      const next = mergeEnVocabSyncPatches(prev, patches);
      persistEnVocabPageCache(next, refsRef.current, displayOrderRef.current);
      return next;
    });
    setViewingRemarksWord((prev) => {
      if (!prev) return prev;
      const patch = patches.find((w) => w.id === prev.id);
      if (!patch || patch.updated_at <= prev.updated_at) return prev;
      return { ...prev, ...patch };
    });
  }, [
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setViewingRemarksWord,
  ]);

  const handleRemoteAdminReset = useCallback(() => {
    onRemoteResetClearSessionRef.current?.();
    void loadWords({ force: true });
  }, [loadWords, onRemoteResetClearSessionRef]);

  useEffect(() => {
    if (checking || !user) return;
    return subscribeEnVocabAdminReset(handleRemoteAdminReset);
  }, [checking, user, handleRemoteAdminReset]);

  // 管理员改「今日抽查数量」：同域标签页立刻拉轻量配置（勿 force 全库，易 1102）
  useEffect(() => {
    if (checking || !user) return;
    return subscribeEnVocabQuizTargetUpdated(() => {
      void syncTeacherVisibleLimitFromServer();
    });
  }, [checking, user, syncTeacherVisibleLimitFromServer]);

  useEffect(() => {
    if (checking || !user) return;
    if (!enableBackgroundSyncPoll) return;
    if (loading || !words.length) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      resolveVocabPollIntervalMs({
        activeMs: teacherQuizIdleRef?.current
          ? VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS
          : JP_VOCAB_POLL_MS,
        hiddenMs: teacherQuizIdleRef?.current
          ? VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS
          : JP_VOCAB_POLL_HIDDEN_MS,
        username: usernameRef.current,
      });

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;

      if (document.hidden || editingRemarksWordId || editingWordId) {
        schedule(pollDelay());
        return;
      }

      const since = maxEnVocabUpdatedAt(wordsRef.current);
      if (!since) {
        schedule(pollDelay());
        return;
      }

      if (pollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }

      pollInFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/en-vocab/sync?since=${encodeURIComponent(since)}&limit=0`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: EnVocabWord[];
        };
        if (data.ok && Array.isArray(data.words) && data.words.length) {
          applySyncPatches(data.words);
          // 批量重置常一次刷满 LIMIT 200；强制全量拉，避免同秒 updated_at 截断后进度条仍显示已抽
          if (data.words.length >= 200) {
            onRemoteResetClearSessionRef.current?.();
            void loadWords({ force: true });
          } else if (
            data.words.filter(isEnVocabServerReviewCleared).length >= 10
          ) {
            // 多词熟悉程度被清空：多半是今日/全部重置
            onRemoteResetClearSessionRef.current?.();
          }
        }
      } catch {
        /* 轮询失败静默，下轮再试 */
      } finally {
        pollInFlightRef.current = false;
        if (!cancelled) schedule(pollDelay());
      }
    };

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        schedule(300);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule(JP_VOCAB_POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    loading,
    words.length,
    applySyncPatches,
    checking,
    user,
    editingRemarksWordId,
    editingWordId,
    loadWords,
    onRemoteResetClearSessionRef,
    enableBackgroundSyncPoll,
    teacherQuizPollIdle,
  ]);

  // 今日抽查数量：独立低频轮询（对齐日语，勿塞进每 5s 的词条 sync）
  useEffect(() => {
    if (checking || !user) return;
    if (!enableBackgroundSyncPoll) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () => {
      if (teacherQuizIdleRef?.current) {
        return resolveVocabPollIntervalMs({
          activeMs: VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS,
          hiddenMs: VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS,
          username: usernameRef.current,
        });
      }
      return resolveVocabPollIntervalMs({
        activeMs: EN_VOCAB_TEACHER_VISIBLE_POLL_MS,
        hiddenMs: EN_VOCAB_TEACHER_VISIBLE_POLL_MS,
        username: usernameRef.current,
      });
    };

    const schedule = (delayMs = pollDelay()) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void syncTeacherVisibleLimitFromServer().finally(() => schedule());
      }, delayMs);
    };

    void syncTeacherVisibleLimitFromServer();
    schedule();

    const onVisibility = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        void syncTeacherVisibleLimitFromServer();
        schedule(300);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    checking,
    user,
    enableBackgroundSyncPoll,
    teacherQuizPollIdle,
    syncTeacherVisibleLimitFromServer,
    teacherQuizIdleRef,
  ]);

  return {
    words,
    setWords,
    refs,
    setRefs,
    loading,
    refreshing,
    setRefreshing,
    displayOrder,
    setDisplayOrder,
    sharedTodayWordIds,
    setSharedTodayWordIds,
    teacherVisibleLimit,
    setTeacherVisibleLimit,
    displayOrderRef,
    wordsRef,
    refsRef,
    loadWords,
    applySyncPatches,
    persistCache: persistEnVocabPageCache,
  };
}
