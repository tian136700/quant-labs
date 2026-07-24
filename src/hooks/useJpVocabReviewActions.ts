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
import type { Locale } from "@/i18n/messages";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import {
  markJpVocabRoundChecked,
  unmarkJpVocabRoundChecked,
  type JpVocabDailyDisplayOrder,
} from "@/lib/jp-vocab-daily-order";
import { effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import { resolveJpVocabPreviousLevel } from "@/lib/jp-vocab-review";
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import {
  animateJpVocabShareProgressTo100,
  bumpJpVocabWordReview,
  jpVocabShareProgressPercent,
  JP_VOCAB_SAVE_ERR,
} from "@/lib/jp-vocab-page-helpers";
import { JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT } from "@/lib/jp-vocab-save-progress";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

export function useJpVocabReviewActions(options: {
  locale: Locale;
  canOperate: boolean;
  canShareToStudy: boolean;
  isAdminMode: boolean;
  quizTarget: number;
  isWordInQuizTarget: (wordId: number) => boolean;
  isWordReviewLocked: (word: JpVocabWord, sessionReviewAtMs?: number) => boolean;
  quizSession: JpVocabTeacherQuizSession | null;
  resumeTeacherQuizFlashcard: (preferredWordId?: number) => void;
  startTeacherQuizWithRandomMode: (startWordId?: number) => void;
  studentPeekedCurrentWord: boolean;
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  sessionReviewAt: Record<number, number>;
  sharedTodayWordIds: Set<number>;
  displayOrderRef: MutableRefObject<JpVocabDailyDisplayOrder>;
  wordsRef: MutableRefObject<JpVocabWord[]>;
  refsRef: MutableRefObject<Record<string, JpVocabRef>>;
  sharedTodayWordIdsRef: MutableRefObject<Set<number>>;
  setWords: Dispatch<SetStateAction<JpVocabWord[]>>;
  setDisplayOrder: Dispatch<SetStateAction<JpVocabDailyDisplayOrder>>;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, JpVocabLevel | undefined>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  setStatus: (message: string) => void;
  openJpAuth: () => void;
  refresh: () => Promise<void>;
  persistCache: (
    words: JpVocabWord[],
    refs: Record<string, JpVocabRef>,
    display_order: JpVocabDailyDisplayOrder,
    shared_today_word_ids?: number[]
  ) => void;
}) {
  const {
    locale,
    canOperate,
    canShareToStudy,
    isAdminMode,
    quizTarget,
    isWordInQuizTarget,
    isWordReviewLocked,
    quizSession,
    resumeTeacherQuizFlashcard,
    startTeacherQuizWithRandomMode,
    studentPeekedCurrentWord,
    words,
    refs,
    sessionLevel,
    sessionReviewAt,
    sharedTodayWordIds,
    displayOrderRef,
    wordsRef,
    refsRef,
    sharedTodayWordIdsRef,
    setWords,
    setDisplayOrder,
    setSessionLevel,
    setSessionReviewAt,
    setSharedTodayWordIds,
    setHighlightId,
    setStatus,
    openJpAuth,
    refresh,
    persistCache,
  } = options;

  const [wordSyncState, setWordSyncState] = useState<
    Record<number, "queued" | "syncing">
  >({});
  const [shareProgressMap, setShareProgressMap] = useState<Record<number, number>>(
    {}
  );
  const [saveQueuePending, setSaveQueuePending] = useState(0);
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
    return jpVocabSaveQueue.subscribe(setSaveQueuePending);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of shareProgressTimersRef.current.values()) {
        clearInterval(timer);
      }
      shareProgressTimersRef.current.clear();
    };
  }, []);

  const reviewLockedByWordId = useMemo(() => {
    const map: Record<number, boolean> = {};
    for (const w of words) {
      map[w.id] = isWordReviewLocked(w, sessionReviewAt[w.id]);
    }
    return map;
  }, [words, sessionReviewAt, isWordReviewLocked]);

  const quizFlashcardSavingWordId = useMemo(() => {
    for (const [wordId, phase] of Object.entries(wordSyncState)) {
      if (phase === "queued" || phase === "syncing") {
        return Number(wordId);
      }
    }
    return null;
  }, [wordSyncState]);

  const recordLevel = async (
    wordId: number,
    level: JpVocabLevel,
    source: "flashcard" | "table" = "table"
  ) => {
    if (!canOperate) {
      setStatus("请登录后再勾选熟悉程度。");
      openJpAuth();
      return;
    }
    if (!isWordInQuizTarget(wordId) && !isAdminMode) {
      setStatus(`仅今日抽查池内的词条可勾选熟悉程度（共 ${quizTarget} 个）。`);
      return;
    }
    if (source !== "flashcard" && !isAdminMode) {
      if (quizSession != null) {
        resumeTeacherQuizFlashcard(wordId);
      } else {
        startTeacherQuizWithRandomMode(wordId);
      }
      setStatus("今日抽查范围内的熟悉程度请在单词卡片内勾选。");
      return;
    }
    const snapshotForLock = words.find((w) => w.id === wordId);
    if (
      snapshotForLock &&
      isWordReviewLocked(snapshotForLock, sessionReviewAt[wordId])
    ) {
      setStatus("勾选已满 1 小时，无法再修改熟悉程度。");
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }

    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    const prevReviewAt = sessionReviewAt[wordId];
    const nowMs = Date.now();
    const prevLevel =
      resolveJpVocabPreviousLevel(snapshot, {
        sessionLevel: sessionLevel[wordId],
        sessionReviewAtMs: prevReviewAt,
        nowMs,
      }) ?? undefined;
    const displayOrderSnapshot = displayOrderRef.current;
    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const wasAlreadyShared = sharedTodayWordIds.has(wordId);
    const skipShareUi = wasAlreadyShared || studentPeekedCurrentWord;

    setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
    setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
    setDisplayOrder((prev) => markJpVocabRoundChecked(prev, wordId));
    setHighlightId(wordId);
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? bumpJpVocabWordReview(w, level, prevLevel) : w
      )
    );
    if (!wasAlreadyShared) {
      const nextSharedIds = [...sharedIdsSnapshot, wordId];
      setSharedTodayWordIds(new Set(nextSharedIds));
      persistCache(
        wordsRef.current.map((w) =>
          w.id === wordId ? bumpJpVocabWordReview(w, level, prevLevel) : w
        ),
        refsRef.current,
        markJpVocabRoundChecked(displayOrderSnapshot, wordId),
        nextSharedIds
      );
    }

    setWordSyncPhase(wordId, "queued");
    patchShareProgress(wordId, JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    if (saveQueuePending > 0) {
      setStatus(`已更新界面，排队同步中（${saveQueuePending + 1} 项）…`);
    } else if (!skipShareUi) {
      setStatus("已更新界面，正在同步到学生端…");
    } else {
      setStatus("已更新界面，正在保存熟悉程度…");
    }

    try {
      await jpVocabSaveQueue.enqueue(async () => {
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
          const res = await fetch("/api/jp-vocab", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({ word_id: wordId, level }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            shared?: boolean;
            shared_new?: boolean;
            error?: string;
          };
          if (res.status === 401) {
            await refresh();
            throw new Error(JP_VOCAB_SAVE_ERR[locale]);
          }
          if (!data.ok || !data.word) {
            const msg =
              data.error || (locale === "zh" ? "保存失败" : "Save failed");
            throw new Error(msg);
          }

          clearShareTimer(wordId);
          await animateJpVocabShareProgressTo100(
            wordId,
            startedAt,
            (id, percent) => patchShareProgress(id, percent)
          );
          patchShareProgress(wordId, null);

          const nextSharedIds =
            data.shared && !sharedTodayWordIdsRef.current.has(wordId)
              ? [...sharedTodayWordIdsRef.current, wordId]
              : [...sharedTodayWordIdsRef.current];

          setWords((prev) => {
            const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
            persistCache(
              next,
              refsRef.current,
              displayOrderRef.current,
              nextSharedIds
            );
            return next;
          });
          if (data.shared) {
            setSharedTodayWordIds(new Set(nextSharedIds));
          }
          setStatus(
            data.shared_new
              ? "已勾选熟悉程度，并同步到学生「今日日语单词」。"
              : studentPeekedCurrentWord
                ? "熟悉程度已保存。"
                : wasAlreadyShared || data.shared
                  ? "熟悉程度已更新，学生端已同步。"
                  : "熟悉程度已保存。"
          );
          if (data.shared_new) {
            notifyJpVocabSharedUpdated({ wordId, openRemarks: true });
          }
        } finally {
          clearShareTimer(wordId);
          patchShareProgress(wordId, null);
          setWordSyncPhase(wordId, null);
        }
      });
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      if (snapshot) {
        setWords((prev) =>
          prev.map((w) => (w.id === wordId ? snapshot : w))
        );
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
        persistCache(
          wordsRef.current,
          refsRef.current,
          displayOrderSnapshot,
          sharedIdsSnapshot
        );
      }
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const tryRecordLevel = (wordId: number, level: JpVocabLevel) => {
    void recordLevel(wordId, level, "table");
  };

  const shareWord = async (wordId: number) => {
    if (!canShareToStudy) {
      setStatus("仅管理员或日语老师可共享。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再共享。");
      openJpAuth();
      return;
    }
    if (!isWordInQuizTarget(wordId)) {
      setStatus(`仅今日抽查池内的词条可发给学生（共 ${quizTarget} 个）。`);
      return;
    }
    const snapshot = words.find((w) => w.id === wordId);
    if (!snapshot) return;
    if (isWordReviewLocked(snapshot, sessionReviewAt[wordId])) {
      setStatus("勾选已满 1 小时，无法再发给学生。");
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }
    if (sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日已共享。");
      return;
    }

    setWordSyncPhase(wordId, "queued");
    patchShareProgress(wordId, JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);

    try {
      const result = await jpVocabSaveQueue.enqueue(async () => {
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
        setStatus("正在发给学生，传输中…");

        try {
          const res = await fetch("/api/jp-vocab/share", {
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
            word?: JpVocabWord;
            error?: string;
          };
          if (res.status === 401) {
            await refresh();
            throw new Error(JP_VOCAB_SAVE_ERR[locale]);
          }
          if (res.status === 409 || data.error === "already_shared_today") {
            return { kind: "already" as const, startedAt };
          }
          if (!data.ok || !data.word) {
            throw new Error(data.error || (locale === "zh" ? "共享失败" : "Share failed"));
          }
          return { kind: "ok" as const, word: data.word, startedAt };
        } finally {
          clearShareTimer(wordId);
        }
      });

      const startedAt =
        result.kind === "already" || result.kind === "ok"
          ? result.startedAt
          : Date.now();
      await animateJpVocabShareProgressTo100(
        wordId,
        startedAt,
        (id, percent) => patchShareProgress(id, percent)
      );
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);

      if (result.kind === "already") {
        setSharedTodayWordIds((prev) => new Set([...prev, wordId]));
        setStatus("该词今日已共享。");
        return;
      }

      const prevReviewAt = sessionReviewAt[wordId];
      const nowMs = Date.now();
      const prevLevel =
        resolveJpVocabPreviousLevel(snapshot, {
          sessionLevel: sessionLevel[wordId],
          sessionReviewAtMs: prevReviewAt,
          nowMs,
        }) ?? undefined;
      const alreadyMarked =
        prevLevel != null ||
        effectiveTodayCheckCount(
          snapshot.today_check_count ?? 0,
          snapshot.today_check_date
        ) > 0;
      const updatedWord = result.word;
      let nextDisplayOrder = displayOrderRef.current;

      if (!alreadyMarked) {
        nextDisplayOrder = markJpVocabRoundChecked(nextDisplayOrder, wordId);
        setDisplayOrder(nextDisplayOrder);
        setSessionLevel((prev) => ({ ...prev, [wordId]: "weak" }));
        setSessionReviewAt((prev) => ({ ...prev, [wordId]: nowMs }));
      }

      const nextSharedIds = [...sharedTodayWordIdsRef.current, wordId];
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? updatedWord : w));
        persistCache(next, refsRef.current, nextDisplayOrder, nextSharedIds);
        return next;
      });
      setSharedTodayWordIds(new Set(nextSharedIds));
      setHighlightId(wordId);
      setStatus(
        alreadyMarked
          ? "已共享到学生「今日日语单词」。"
          : "已共享到学生「今日日语单词」，并标记为不熟悉。"
      );
      notifyJpVocabSharedUpdated({ wordId, openRemarks: true });
    } catch (err) {
      clearShareTimer(wordId);
      patchShareProgress(wordId, null);
      setWordSyncPhase(wordId, null);
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const unshareWord = async (wordId: number) => {
    if (!canShareToStudy) {
      setStatus("仅管理员或日语老师可取消共享。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再取消共享。");
      openJpAuth();
      return;
    }
    if (wordSyncState[wordId]) {
      setStatus("正在提交，请勿重复提交");
      return;
    }
    if (!sharedTodayWordIds.has(wordId)) {
      setStatus("该词今日尚未共享。");
      return;
    }

    const sharedIdsSnapshot = [...sharedTodayWordIdsRef.current];
    const nextSharedIds = sharedIdsSnapshot.filter((id) => id !== wordId);
    setSharedTodayWordIds(new Set(nextSharedIds));
    persistCache(
      wordsRef.current,
      refsRef.current,
      displayOrderRef.current,
      nextSharedIds
    );

    setHighlightId(wordId);
    setStatus("已取消共享，学生「今日日语单词」中不再显示该词。");
    notifyJpVocabSharedUpdated({ wordId });

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/jp-vocab/share", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_id: wordId }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          word?: JpVocabWord;
          reverted?: boolean;
          display_order?: JpVocabDailyDisplayOrder | null;
          error?: string;
        };
        if (res.status === 401) {
          await refresh();
          throw new Error(JP_VOCAB_SAVE_ERR[locale]);
        }
        if (res.status === 409 || data.error === "not_shared_today") {
          return;
        }
        if (!data.ok || !data.word) {
          throw new Error(data.error || (locale === "zh" ? "取消共享失败" : "Unshare failed"));
        }

        setWords((prev) => {
          const next = prev.map((w) => (w.id === data.word!.id ? data.word! : w));
          persistCache(
            next,
            refsRef.current,
            data.display_order ?? displayOrderRef.current,
            [...sharedTodayWordIdsRef.current]
          );
          return next;
        });

        if (data.reverted) {
          setSessionLevel((prev) => {
            const next = { ...prev };
            delete next[wordId];
            return next;
          });
          setSessionReviewAt((prev) => {
            const next = { ...prev };
            delete next[wordId];
            return next;
          });
          if (data.display_order) {
            setDisplayOrder(data.display_order);
          } else {
            setDisplayOrder((prev) => unmarkJpVocabRoundChecked(prev, wordId));
          }
          setStatus("已取消共享，并撤销自动标记的不熟悉。");
        }
      });
    } catch (err) {
      setSharedTodayWordIds(new Set(sharedIdsSnapshot));
      persistCache(
        wordsRef.current,
        refsRef.current,
        displayOrderRef.current,
        sharedIdsSnapshot
      );
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    wordSyncState,
    shareProgressMap,
    saveQueuePending,
    reviewLockedByWordId,
    recordLevel,
    tryRecordLevel,
    shareWord,
    unshareWord,
    patchShareProgress,
    setWordSyncPhase,
    quizFlashcardSavingWordId,
  };
}
