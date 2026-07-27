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
  parseJpVocabApi,
  type JpVocabApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  readClientCacheAge,
  writeClientCache,
} from "@/lib/client-swr-cache";
import {
  readJpVocabPageCache,
  persistJpVocabPageCache,
} from "@/lib/jp-vocab-page-cache";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabQuizPriorityBoost } from "@/lib/jp-vocab-quiz-priority-boost";
import {
  JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT,
} from "@/lib/jp-vocab-quiz-score";
import {
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  JP_VOCAB_POLL_IDLE_COMPLETE_HIDDEN_MS,
  JP_VOCAB_POLL_IDLE_COMPLETE_MS,
  JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS,
  JP_VOCAB_TEACHER_VISIBLE_POLL_MS,
  jpVocabPollIntervalMs,
  maxJpVocabUpdatedAt,
  mergeJpVocabSyncPatches,
} from "@/lib/jp-vocab-sync";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";
import {
  normalizeJpVocabTeacherVisibleLimit,
  teacherVisibleLimitNeedsPersist,
  shouldRejectStaleJpVocabTeacherVisibleLimit,
  type JpVocabTeacherVisibleLimit,
} from "@/lib/jp-vocab-teacher-visible";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import {
  subscribeJpVocabQuizTargetUpdated,
} from "@/lib/jp-vocab-quiz-target-notify";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

export function useJpVocabPageSync(options: {
  checking: boolean;
  user: { id: number; username?: string } | null;
  editingRemarksWordId: number | null;
  editingWordId: number | null;
  teacherIdleCompleteRef: MutableRefObject<boolean>;
  /** 仅老师抽查会话进行中才后台轮询；否则靠用户点「刷新」 */
  enableBackgroundSyncPoll?: boolean;
  setViewingRemarksWord: Dispatch<SetStateAction<JpVocabWord | null>>;
  onLoadError: (message: string) => void;
  onDayRolloverClearSession: () => void;
}) {
  const {
    checking,
    user,
    editingRemarksWordId,
    editingWordId,
    teacherIdleCompleteRef,
    enableBackgroundSyncPoll = false,
    setViewingRemarksWord,
    onLoadError,
    onDayRolloverClearSession,
  } = options;
  const usernameRef = useRef(user?.username);
  usernameRef.current = user?.username;

  const [words, setWords] = useState<JpVocabWord[]>(
    () => readJpVocabPageCache()?.words ?? []
  );
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(
    () => readJpVocabPageCache()?.refs ?? {}
  );
  const [loading, setLoading] = useState(() => readJpVocabPageCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [sharedTodayWordIds, setSharedTodayWordIds] = useState<Set<number>>(
    () => new Set(readJpVocabPageCache()?.shared_today_word_ids ?? [])
  );
  const [teacherVisibleLimit, setTeacherVisibleLimit] =
    useState<JpVocabTeacherVisibleLimit>(() =>
      readJpVocabPageCache()?.teacher_visible_limit ??
      normalizeJpVocabTeacherVisibleLimit(null)
    );
  const [displayOrder, setDisplayOrder] = useState<JpVocabDailyDisplayOrder>(() => {
    const cached = readJpVocabPageCache()?.display_order;
    return cached ?? { date: "", ids: [], round_checked_ids: [] };
  });
  const [quizTimeWeight, setQuizTimeWeight] = useState(
    () => JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT
  );
  const [quizPriorityBoost, setQuizPriorityBoost] =
    useState<JpVocabQuizPriorityBoost | null>(
      () => readJpVocabPageCache()?.quiz_priority_boost ?? null
    );

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

  const applyVocabPayload = useCallback((payload: JpVocabApiPayload) => {
    setWords(payload.words);
    setRefs(payload.refs);
    setDisplayOrder(payload.display_order);
    setSharedTodayWordIds(new Set(payload.shared_today_word_ids ?? []));
    setTeacherVisibleLimit((prev) => {
      const next = normalizeJpVocabTeacherVisibleLimit(
        payload.teacher_visible_limit
      );
      if (shouldRejectStaleJpVocabTeacherVisibleLimit(prev, next)) return prev;
      return next;
    });
    setQuizTimeWeight(JP_VOCAB_DEFAULT_QUIZ_TIME_WEIGHT);
    if (payload.quiz_priority_boost !== undefined) {
      setQuizPriorityBoost(payload.quiz_priority_boost);
    }
  }, []);

  const applyTeacherVisibleSync = useCallback(
    (raw: Partial<JpVocabTeacherVisibleLimit> | undefined) => {
      if (!raw) return;
      const next = normalizeJpVocabTeacherVisibleLimit(raw);
      setTeacherVisibleLimit((prev) => {
        if (shouldRejectStaleJpVocabTeacherVisibleLimit(prev, next)) {
          return prev;
        }
        if (!teacherVisibleLimitNeedsPersist(prev, next)) {
          return prev;
        }
        const cached = readJpVocabPageCache();
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
      const res = await fetch("/api/jp-vocab/teacher-visible", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok: boolean;
        teacher_visible_limit?: Partial<JpVocabTeacherVisibleLimit>;
      };
      if (data.ok) {
        applyTeacherVisibleSync(data.teacher_visible_limit);
      }
    } catch {
      /* ignore */
    }
  }, [applyTeacherVisibleSync]);

  const loadWords = useCallback(
    async (opts?: { force?: boolean }) => {
      const cached = readJpVocabPageCache();
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
      void syncTeacherVisibleLimitFromServer();
      try {
        const payload = await fetchWithClientCache(
          JP_VOCAB_CACHE_KEY,
          "/api/jp-vocab",
          parseJpVocabApi,
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
    },
    [applyVocabPayload, syncTeacherVisibleLimitFromServer, onLoadError]
  );

  useEffect(() => {
    if (checking || !user) return;
    void loadWords();
  }, [loadWords, checking, user]);

  useEffect(() => {
    if (checking || !user) return;
    let today = beijingDateString();
    const onDayRollover = () => {
      const next = beijingDateString();
      if (next === today) return;
      today = next;
      onDayRolloverClearSession();
      void loadWords({ force: true });
    };
    onDayRollover();
    const timer = window.setInterval(onDayRollover, 60_000);
    return () => window.clearInterval(timer);
  }, [loadWords, checking, user, onDayRolloverClearSession]);

  const applySyncPatches = useCallback((patches: JpVocabWord[]) => {
    if (!patches.length) return;
    setWords((prev) => {
      const next = mergeJpVocabSyncPatches(prev, patches);
      persistJpVocabPageCache(next, refsRef.current, displayOrderRef.current);
      return next;
    });
    setViewingRemarksWord((prev) => {
      if (!prev) return prev;
      const patch = patches.find((w) => w.id === prev.id);
      if (!patch || patch.updated_at <= prev.updated_at) return prev;
      return { ...prev, ...patch };
    });
  }, [setViewingRemarksWord]);

  useEffect(() => {
    if (checking || !user) return;
    if (!enableBackgroundSyncPoll) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      jpVocabPollIntervalMs(
        JP_VOCAB_POLL_MS,
        JP_VOCAB_POLL_HIDDEN_MS,
        JP_VOCAB_POLL_IDLE_COMPLETE_MS,
        JP_VOCAB_POLL_IDLE_COMPLETE_HIDDEN_MS,
        teacherIdleCompleteRef.current,
        { username: usernameRef.current }
      );

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

      const since =
        maxJpVocabUpdatedAt(wordsRef.current) || new Date(0).toISOString();

      if (pollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }

      pollInFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/jp-vocab/sync?since=${encodeURIComponent(since)}&limit=0`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: JpVocabWord[];
        };
        if (data.ok) {
          if (Array.isArray(data.words) && data.words.length) {
            applySyncPatches(data.words);
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
    applySyncPatches,
    checking,
    user,
    editingRemarksWordId,
    editingWordId,
    enableBackgroundSyncPoll,
  ]);

  useEffect(() => {
    if (checking || !user) return;
    if (!enableBackgroundSyncPoll) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      resolveVocabPollIntervalMs({
        activeMs: teacherIdleCompleteRef.current
          ? JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS
          : JP_VOCAB_TEACHER_VISIBLE_POLL_MS,
        hiddenMs: teacherIdleCompleteRef.current
          ? JP_VOCAB_TEACHER_VISIBLE_POLL_IDLE_COMPLETE_MS
          : JP_VOCAB_TEACHER_VISIBLE_POLL_MS,
        username: usernameRef.current,
      });

    const schedule = (delayMs = pollDelay()) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void syncTeacherVisibleLimitFromServer().finally(() => schedule());
      }, delayMs);
    };

    void syncTeacherVisibleLimitFromServer();
    schedule();

    const onVisible = () => {
      if (!document.hidden && !cancelled) {
        if (timer) clearTimeout(timer);
        void syncTeacherVisibleLimitFromServer();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    syncTeacherVisibleLimitFromServer,
    checking,
    user,
    enableBackgroundSyncPoll,
  ]);

  useEffect(() => {
    if (checking || !user) return;
    return subscribeJpVocabQuizTargetUpdated(() => {
      void syncTeacherVisibleLimitFromServer();
    });
  }, [checking, user, syncTeacherVisibleLimitFromServer]);

  return {
    words,
    setWords,
    refs,
    setRefs,
    loading,
    refreshing,
    displayOrder,
    setDisplayOrder,
    sharedTodayWordIds,
    setSharedTodayWordIds,
    teacherVisibleLimit,
    setTeacherVisibleLimit,
    quizTimeWeight,
    setQuizTimeWeight,
    quizPriorityBoost,
    setQuizPriorityBoost,
    displayOrderRef,
    wordsRef,
    refsRef,
    loadWords,
    persistCache: persistJpVocabPageCache,
    syncTeacherVisibleLimitFromServer,
  };
}
