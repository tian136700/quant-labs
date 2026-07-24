"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  maxEnVocabUpdatedAt,
  mergeEnVocabSyncPatches,
} from "@/lib/en-vocab-sync";
import {
  defaultEnVocabTeacherVisibleLimit,
  normalizeEnVocabTeacherVisibleLimit,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import type { EnVocabRef, EnVocabWord } from "@/lib/types";
import { writeClientCache } from "@/lib/client-swr-cache";

export function useEnVocabPageSync(options: {
  checking: boolean;
  user: { id: number } | null;
  editingRemarksWordId: number | null;
  editingWordId: number | null;
  setViewingRemarksWord: Dispatch<SetStateAction<EnVocabWord | null>>;
  onLoadError: (message: string) => void;
}) {
  const {
    checking,
    user,
    editingRemarksWordId,
    editingWordId,
    setViewingRemarksWord,
    onLoadError,
  } = options;

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
    setTeacherVisibleLimit(payload.teacher_visible_limit);
  }, []);

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
  }, [applyVocabPayload, onLoadError]);

  useEffect(() => {
    if (checking || !user) return;
    void loadWords().catch(() => {
      /* onLoadError 已在 loadWords 内处理 */
    });
  }, [loadWords, checking, user]);

  const applySyncPatches = useCallback((patches: EnVocabWord[]) => {
    if (!patches.length) return;
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
  }, []);

  useEffect(() => {
    if (checking || !user) return;
    if (loading || !words.length) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : JP_VOCAB_POLL_MS;

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
          `/api/en-vocab/sync?since=${encodeURIComponent(since)}`,
          { credentials: "include" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          words?: EnVocabWord[];
          teacher_visible_limit?: EnVocabTeacherVisibleLimit;
        };
        if (data.ok && Array.isArray(data.words) && data.words.length) {
          applySyncPatches(data.words);
        }
        if (data.ok && data.teacher_visible_limit) {
          const next = normalizeEnVocabTeacherVisibleLimit(
            data.teacher_visible_limit
          );
          setTeacherVisibleLimit((prev) => {
            if (
              prev.quiz_target === next.quiz_target &&
              prev.date === next.date &&
              (prev.visible_ids?.join(",") ?? "") ===
                (next.visible_ids?.join(",") ?? "")
            ) {
              return prev;
            }
            return next;
          });
          const cached = readEnVocabPageCache();
          if (cached) {
            writeClientCache(JP_VOCAB_CACHE_KEY, {
              ...cached,
              teacher_visible_limit: next,
            });
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
