"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { enVocabSaveQueue } from "@/lib/request-queue";
import { markEnVocabRoundChecked, type EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  aggregateEnVocabUsageLevels,
  areEnVocabUsageLevelsComplete,
  effectiveEnVocabDisplayLevel,
  isEnVocabWordReviewLocked,
  parseEnVocabLastUsageLevels,
  serializeEnVocabLastUsageLevels,
} from "@/lib/en-vocab-review";
import { effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { listEnVocabUsagePointsForDisplay } from "@/lib/en-vocab-usage-examples-display";
import { bumpEnVocabWordReview, EN_VOCAB_SAVE_ERR } from "@/lib/en-vocab-page-helpers";
import {
  animateJpVocabShareProgressTo100,
  jpVocabShareProgressPercent,
} from "@/lib/jp-vocab-page-helpers";
import { JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT } from "@/lib/jp-vocab-save-progress";
import { notifyEnVocabSharedUpdated } from "@/lib/en-vocab-shared-notify";
import type { EnVocabRef, EnVocabLevel, EnVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export function useEnVocabReviewActions(options: {
  locale: Locale;
  canOperate: boolean;
  teacherShareUiEnabled: boolean;
  studentPeekedCurrentWord: boolean;
  displayOrder: EnVocabDailyDisplayOrder;
  displayOrderRef: MutableRefObject<EnVocabDailyDisplayOrder>;
  sharedTodayWordIdsRef: MutableRefObject<Set<number>>;
  words: EnVocabWord[];
  refs: Record<string, EnVocabRef>;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  sessionUsageLevels: Record<number, Array<EnVocabLevel | null | undefined>>;
  sessionReviewAt: Record<number, number>;
  reviewLockNow: number;
  sharedTodayWordIds: Set<number>;
  setWords: Dispatch<SetStateAction<EnVocabWord[]>>;
  setDisplayOrder: Dispatch<SetStateAction<EnVocabDailyDisplayOrder>>;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, EnVocabLevel | undefined>>
  >;
  setSessionUsageLevels: Dispatch<
    SetStateAction<Record<number, Array<EnVocabLevel | null | undefined>>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  setStatus: (message: string) => void;
  openEnAuth: () => void;
  refresh: () => Promise<void>;
  persistCache: (
    words: EnVocabWord[],
    refs: Record<string, EnVocabRef>,
    display_order: EnVocabDailyDisplayOrder,
    shared_today_word_ids?: number[]
  ) => void;
}) {
  const {
    locale,
    canOperate,
    teacherShareUiEnabled,
    studentPeekedCurrentWord,
    displayOrder,
    displayOrderRef,
    sharedTodayWordIdsRef,
    words,
    refs,
    sessionLevel,
    sessionUsageLevels,
    sessionReviewAt,
    reviewLockNow,
    sharedTodayWordIds,
    setWords,
    setDisplayOrder,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setSharedTodayWordIds,
    setHighlightId,
    setStatus,
    openEnAuth,
    refresh,
    persistCache,
  } = options;

  const [savingId, setSavingId] = useState<number | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [wordSyncState, setWordSyncState] = useState<
    Record<number, "queued" | "syncing">
  >({});
  const [shareProgressMap, setShareProgressMap] = useState<Record<number, number>>(
    {}
  );
  const [saveQueuePending, setSaveQueuePending] = useState(0);
  const usageLevelSavingRef = useRef<number | null>(null);
  const shareProgressTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(
    new Map()
  );

  const patchShareProgress = useCallback((wordId: number, percent: number | null) => {
    setShareProgressMap((prev) => {
      if (percent == null) {
        if (!(wordId in prev)) return prev;
        const next = { ...prev };
        delete next[wordId];
        return next;
      }
      return { ...prev, [wordId]: percent };
    });
  }, []);

  const setWordSyncPhase = useCallback(
    (wordId: number, phase: "queued" | "syncing" | null) => {
      setWordSyncState((prev) => {
        if (phase == null) {
          if (!(wordId in prev)) return prev;
          const next = { ...prev };
          delete next[wordId];
          return next;
        }
        return { ...prev, [wordId]: phase };
      });
    },
    []
  );

  const clearShareTimer = useCallback((wordId: number) => {
    const timer = shareProgressTimersRef.current.get(wordId);
    if (timer) {
      clearInterval(timer);
      shareProgressTimersRef.current.delete(wordId);
    }
  }, []);

  useEffect(() => {
    return enVocabSaveQueue.subscribe(setSaveQueuePending);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of shareProgressTimersRef.current.values()) {
        clearInterval(timer);
      }
      shareProgressTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    for (const [wordId, phase] of Object.entries(wordSyncState)) {
      if (phase === "syncing" && !(Number(wordId) in shareProgressMap)) {
        patchShareProgress(Number(wordId), 0);
      }
    }
  }, [wordSyncState, shareProgressMap, patchShareProgress]);

  const reviewLockedByWordId = useMemo(() => {
    const now = new Date(reviewLockNow);
    const map: Record<number, boolean> = {};
    for (const w of words) {
      map[w.id] = isEnVocabWordReviewLocked(w, {
        sessionReviewAtMs: sessionReviewAt[w.id],
        now,
      });
    }
    return map;
  }, [words, sessionReviewAt, reviewLockNow]);

  const applySharedResponse = useCallback(
    (
      wordId: number,
      data: {
        word: EnVocabWord;
        shared?: boolean;
        shared_new?: boolean;
      },
      opts: { wasAlreadyShared: boolean }
    ) => {
      const nextSharedIds =
        data.shared && !sharedTodayWordIdsRef.current.has(wordId)
          ? [...sharedTodayWordIdsRef.current, wordId]
          : [...sharedTodayWordIdsRef.current];

      setWords((prev) => {
        const next = prev.map((w) => (w.id === data.word.id ? data.word : w));
        persistCache(next, refs, displayOrderRef.current, nextSharedIds);
        return next;
      });
      if (data.shared) {
        setSharedTodayWordIds(new Set(nextSharedIds));
      }
      setStatus(
        data.shared_new
          ? "已勾选熟悉程度，并同步到学生「今日背英语单词」。"
          : studentPeekedCurrentWord
            ? "熟悉程度已保存。"
            : opts.wasAlreadyShared || data.shared
              ? "熟悉程度已更新，学生端已同步。"
              : "熟悉程度已保存。"
      );
      if (data.shared_new) {
        notifyEnVocabSharedUpdated({ wordId, openRemarks: true });
      }
    },
    [
      displayOrderRef,
      persistCache,
      refs,
      setSharedTodayWordIds,
      setStatus,
      setWords,
      sharedTodayWordIdsRef,
      studentPeekedCurrentWord,
    ]
  );

  const runReviewSave = useCallback(
    async (
      wordId: number,
      body: Record<string, unknown>,
      opts: {
        wasAlreadyShared: boolean;
        skipShareUi: boolean;
        onSuccessExtra?: () => void;
      }
    ) => {
      setWordSyncPhase(wordId, "queued");
      patchShareProgress(wordId, JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
      if (saveQueuePending > 0) {
        setStatus(`已更新界面，排队同步中（${saveQueuePending + 1} 项）…`);
      } else if (!opts.skipShareUi) {
        setStatus("已更新界面，正在同步到学生端…");
      } else {
        setStatus("已更新界面，正在保存熟悉程度…");
      }

      await enVocabSaveQueue.enqueue(async () => {
        setWordSyncPhase(wordId, "syncing");
        const startedAt = Date.now();
        patchShareProgress(wordId, 0);
        clearShareTimer(wordId);
        shareProgressTimersRef.current.set(
          wordId,
          setInterval(() => {
            patchShareProgress(
              wordId,
              jpVocabShareProgressPercent(Date.now() - startedAt)
            );
          }, 200)
        );

        try {
          const res = await fetch("/api/en-vocab", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify(body),
          });
          let data: {
            ok: boolean;
            word?: EnVocabWord;
            shared?: boolean;
            shared_new?: boolean;
            error?: string;
          };
          try {
            data = (await res.json()) as typeof data;
          } catch {
            throw new Error(locale === "zh" ? "保存失败" : "Save failed");
          }
          if (res.status === 401) {
            await refresh();
            throw new Error(EN_VOCAB_SAVE_ERR[locale]);
          }
          if (!data.ok || !data.word) {
            const errKey = data.error || "";
            const msg =
              errKey === "review_locked" || errKey === "shared_level_locked"
                ? "勾选已满 1 小时，无法再修改熟悉程度。"
                : errKey === "usage_levels_count_mismatch"
                  ? "用法条数与勾选不一致，请刷新页面后重试。"
                  : errKey === "usage_levels_invalid"
                    ? "用法熟悉程度无效，请重新勾选。"
                    : errKey === "not_found"
                      ? "词条不存在或已删除。"
                      : errKey || (locale === "zh" ? "保存失败" : "Save failed");
            throw new Error(msg);
          }

          clearShareTimer(wordId);
          await animateJpVocabShareProgressTo100(
            wordId,
            startedAt,
            (id, percent) => patchShareProgress(id, percent)
          );
          patchShareProgress(wordId, null);

          applySharedResponse(wordId, {
            word: data.word,
            shared: data.shared,
            shared_new: data.shared_new,
          }, { wasAlreadyShared: opts.wasAlreadyShared });
          opts.onSuccessExtra?.();
        } finally {
          clearShareTimer(wordId);
          patchShareProgress(wordId, null);
          setWordSyncPhase(wordId, null);
        }
      });
    },
    [
      applySharedResponse,
      clearShareTimer,
      locale,
      patchShareProgress,
      refresh,
      saveQueuePending,
      setStatus,
      setWordSyncPhase,
    ]
  );

  const recordLevel = async (wordId: number, level: EnVocabLevel) => {
    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openEnAuth();
      return;
    }
    const lockSnapshot = words.find((w) => w.id === wordId);
    if (
      lockSnapshot &&
      isEnVocabWordReviewLocked(lockSnapshot, {
        sessionReviewAtMs: sessionReviewAt[wordId],
        now: new Date(reviewLockNow),
      })
    ) {
      setStatus("勾选已满 1 小时，无法再修改熟悉程度。");
      return;
    }
    if (savingId === wordId || wordSyncState[wordId]) return;

    const snapshot = lockSnapshot;
    if (!snapshot) return;
    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const wasAlreadyShared = sharedTodayWordIds.has(wordId);
    const skipShareUi = wasAlreadyShared || studentPeekedCurrentWord;
    const nowMs = Date.now();

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markEnVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpEnVocabWordReview(w, level, prevLevel) : w
      )
    );
    // 勿乐观标记「已共享」：否则顶栏已显示「该单词已同步给学生查看」，「下一个」却仍灰，且进度条文案变成「保存」而非「同步」
    setSavingId(wordId);

    try {
      await runReviewSave(
        wordId,
        { word_id: wordId, level },
        { wasAlreadyShared, skipShareUi }
      );
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      if (snapshot) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? snapshot : w)));
      }
      setDisplayOrder(displayOrderSnapshot);
      setSessionLevel((prev) => {
        const next = { ...prev };
        if (prevLevel) next[wordId] = prevLevel;
        else delete next[wordId];
        return next;
      });
      setSessionReviewAt((prev) => {
        const next = { ...prev };
        if (prevReviewAt != null) next[wordId] = prevReviewAt;
        else delete next[wordId];
        return next;
      });
      if (!wasAlreadyShared) {
        setSharedTodayWordIds(new Set(sharedIdsSnapshot));
        persistCache(words, refs, displayOrderSnapshot, sharedIdsSnapshot);
      }
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const recordUsageLevels = async (
    wordId: number,
    levels: Array<EnVocabLevel | null | undefined>
  ) => {
    const lockSnapshot = words.find((w) => w.id === wordId);
    if (
      lockSnapshot &&
      isEnVocabWordReviewLocked(lockSnapshot, {
        sessionReviewAtMs: sessionReviewAt[wordId],
        now: new Date(reviewLockNow),
      })
    ) {
      setStatus("勾选已满 1 小时，无法再修改熟悉程度。");
      return;
    }

    setSessionUsageLevels((prev) => ({ ...prev, [wordId]: levels }));

    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openEnAuth();
      return;
    }

    if (!levels.length || levels.some((lv) => lv == null)) {
      return;
    }
    const complete = levels as EnVocabLevel[];

    if (
      savingId === wordId ||
      usageLevelSavingRef.current === wordId ||
      wordSyncState[wordId]
    ) {
      return;
    }

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;

    const expected = listEnVocabUsagePointsForDisplay(snapshot.usage).points.length;
    if (expected > 0 && complete.length !== expected) {
      setStatus("用法条数与勾选不一致，请刷新页面后重试。");
      return;
    }

    let overall: EnVocabLevel;
    try {
      overall = aggregateEnVocabUsageLevels(complete);
    } catch {
      setStatus("用法熟悉程度无效，请重新勾选。");
      return;
    }

    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const wasAlreadyShared = sharedTodayWordIds.has(wordId);
    const skipShareUi = wasAlreadyShared || studentPeekedCurrentWord;
    const nowMs = Date.now();

    usageLevelSavingRef.current = wordId;
    setSessionLevel((prev) => ({ ...prev, [wordId]: overall }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markEnVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setWords((prev) =>
      prev.map((w) => {
        if (w.id !== wordId) return w;
        const bumped = bumpEnVocabWordReview(w, overall, prevLevel);
        return {
          ...bumped,
          last_usage_levels: serializeEnVocabLastUsageLevels(complete),
        };
      })
    );
    // 勿乐观标记「已共享」：顶栏勿提前「该单词已同步给学生查看」；等 runReviewSave 成功后再由 applySharedResponse 写入
    setSavingId(wordId);

    try {
      await runReviewSave(
        wordId,
        { word_id: wordId, usage_levels: complete },
        {
          wasAlreadyShared,
          skipShareUi,
          onSuccessExtra: () => {
            setSessionUsageLevels((prev) => ({ ...prev, [wordId]: complete }));
          },
        }
      );
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      if (snapshot) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? snapshot : w)));
      }
      setDisplayOrder(displayOrderSnapshot);
      setSessionLevel((prev) => {
        const next = { ...prev };
        if (prevLevel) next[wordId] = prevLevel;
        else delete next[wordId];
        return next;
      });
      setSessionReviewAt((prev) => {
        const next = { ...prev };
        if (prevReviewAt != null) next[wordId] = prevReviewAt;
        else delete next[wordId];
        return next;
      });
      // 写库失败：用法草稿保持 complete（禁止回滚成未齐，见 usage-level-aggregate 规则）
      setSessionUsageLevels((prev) => ({ ...prev, [wordId]: complete }));
      if (!wasAlreadyShared) {
        setSharedTodayWordIds(new Set(sharedIdsSnapshot));
        persistCache(words, refs, displayOrderSnapshot, sharedIdsSnapshot);
      }
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      if (usageLevelSavingRef.current === wordId) {
        usageLevelSavingRef.current = null;
      }
      setSavingId(null);
    }
  };

  const shareWord = async (wordId: number) => {
    if (!teacherShareUiEnabled) {
      setStatus("当前页面不可共享单词。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再共享。");
      openEnAuth();
      return;
    }
    if (sharingId === wordId || savingId === wordId || wordSyncState[wordId]) {
      return;
    }
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日已共享。");
      return;
    }

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    if (
      isEnVocabWordReviewLocked(snapshot, {
        sessionReviewAtMs: sessionReviewAt[wordId],
        now: new Date(reviewLockNow),
      })
    ) {
      setStatus("勾选已满 1 小时，无法再发给学生。");
      return;
    }

    const usageSlotCount = listEnVocabUsagePointsForDisplay(snapshot.usage).points
      .length;
    if (usageSlotCount > 0) {
      const draft = sessionUsageLevels[wordId];
      const stored = parseEnVocabLastUsageLevels(snapshot.last_usage_levels);
      const candidate =
        draft && draft.length === usageSlotCount
          ? draft
          : stored && stored.length === usageSlotCount
            ? stored
            : null;
      const complete =
        candidate != null &&
        areEnVocabUsageLevelsComplete(candidate, usageSlotCount);
      const hasOverall =
        sessionLevel[wordId] != null ||
        effectiveEnVocabDisplayLevel(snapshot, sessionLevel[wordId], {
          displayOrder,
        }) != null;
      if (!complete && !hasOverall) {
        setStatus("请先在抽查卡为每条用法勾选熟悉程度，全部勾完后再共享给学生。");
        return;
      }
    }

    const prevLevel = sessionLevel[wordId];
    const prevReviewAt = sessionReviewAt[wordId];
    const displayOrderSnapshot = displayOrderRef.current;
    const nowMs = Date.now();
    const weakLevel: EnVocabLevel = "weak";
    const alreadyMarked =
      prevLevel != null ||
      effectiveTodayCheckCount(
        snapshot.today_check_count ?? 0,
        snapshot.today_check_date
      ) > 0;

    setHighlightId(wordId);
    setStatus("");
    if (!alreadyMarked) {
      setSessionLevel((prev) => ({ ...prev, [wordId]: weakLevel }));
      setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
      setDisplayOrder((prev) => markEnVocabRoundChecked(prev, wordId));
      setWords((prev) =>
        prev.map((w) =>
          w.id === wordId ? bumpEnVocabWordReview(w, weakLevel, prevLevel) : w
        )
      );
    }
    setSharingId(wordId);
    setWordSyncPhase(wordId, "syncing");
    const startedAt = Date.now();
    patchShareProgress(wordId, 0);
    clearShareTimer(wordId);
    shareProgressTimersRef.current.set(
      wordId,
      setInterval(() => {
        patchShareProgress(
          wordId,
          jpVocabShareProgressPercent(Date.now() - startedAt)
        );
      }, 200)
    );

    try {
      const res = await fetch("/api/en-vocab/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ word_id: wordId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        word?: EnVocabWord;
        error?: string;
      };
      if (res.status === 401) {
        await refresh();
        throw new Error(EN_VOCAB_SAVE_ERR[locale]);
      }
      if (res.status === 409 || data.error === "already_shared_today") {
        setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        throw new Error("该词今日已共享。");
      }
      if (!data.ok || !data.word) {
        throw new Error(data.error || (locale === "zh" ? "共享失败" : "Share failed"));
      }
      clearShareTimer(wordId);
      await animateJpVocabShareProgressTo100(wordId, startedAt, (id, percent) =>
        patchShareProgress(id, percent)
      );
      patchShareProgress(wordId, null);
      setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
      setWords((prev) => {
        const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
        persistCache(
          next,
          refs,
          displayOrderRef.current,
          [...sharedTodayWordIdsRef.current, wordId]
        );
        return next;
      });
      setStatus(
        alreadyMarked
          ? "已共享到学生「今日背英语单词」。"
          : "已共享到学生「今日背英语单词」，并标记为不熟悉。"
      );
      notifyEnVocabSharedUpdated({ wordId, openRemarks: true });
    } catch (err) {
      if (snapshot && !alreadyMarked) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? snapshot : w)));
      }
      if (!alreadyMarked) {
        setDisplayOrder(displayOrderSnapshot);
        setSessionLevel((prev) => {
          const next = { ...prev };
          if (prevLevel) next[wordId] = prevLevel;
          else delete next[wordId];
          return next;
        });
        setSessionReviewAt((prev) => {
          const next = { ...prev };
          if (prevReviewAt != null) next[wordId] = prevReviewAt;
          else delete next[wordId];
          return next;
        });
      }
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      setSharingId(null);
    }
  };

  return {
    savingId,
    sharingId,
    reviewLockedByWordId,
    wordSyncState,
    shareProgressMap,
    recordLevel,
    recordUsageLevels,
    shareWord,
  };
}
