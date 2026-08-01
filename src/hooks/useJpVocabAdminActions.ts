"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Locale } from "@/i18n/messages";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { JP_VOCAB_CACHE_KEY } from "@/lib/jp-api-cache";
import { writeClientCache } from "@/lib/client-swr-cache";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import {
  jpVocabTomorrowBoostSeq,
  type JpVocabQuizPriorityBoost,
} from "@/lib/jp-vocab-quiz-priority-boost";
import { readJpVocabPageCache } from "@/lib/jp-vocab-page-cache";
import { normalizeJpVocabTeacherVisibleLimit } from "@/lib/jp-vocab-teacher-visible";
import type { JpVocabTeacherVisibleLimit } from "@/lib/jp-vocab-teacher-visible";
import { notifyJpVocabQuizTargetUpdated } from "@/lib/jp-vocab-quiz-target-notify";
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

export function useJpVocabAdminActions(options: {
  locale: Locale;
  isAdminMode: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  openJpAuth: () => void;
  setStatus: (message: string) => void;
  setError: (message: string) => void;
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  sharedTodayWordIds: Set<number>;
  teacherVisibleLimit: JpVocabTeacherVisibleLimit;
  highlightId: number | null;
  wordSyncState: Record<number, "queued" | "syncing">;
  sharedTodayWordIdsRef: MutableRefObject<Set<number>>;
  refsRef: MutableRefObject<Record<string, JpVocabRef>>;
  setWords: Dispatch<SetStateAction<JpVocabWord[]>>;
  setDisplayOrder: Dispatch<SetStateAction<JpVocabDailyDisplayOrder>>;
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setTeacherVisibleLimit: Dispatch<SetStateAction<JpVocabTeacherVisibleLimit>>;
  setQuizPriorityBoost: Dispatch<SetStateAction<JpVocabQuizPriorityBoost | null>>;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, JpVocabLevel | undefined>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  /** 重置后回到当日序号排序 */
  restoreDailyRowOrder: () => void;
  setPage: Dispatch<SetStateAction<number>>;
  persistCache: (
    words: JpVocabWord[],
    refs: Record<string, JpVocabRef>,
    display_order: JpVocabDailyDisplayOrder,
    shared_today_word_ids?: number[],
    teacher_visible_limit?: JpVocabTeacherVisibleLimit
  ) => void;
}) {
  const {
    locale,
    isAdminMode,
    isAdmin,
    canOperate,
    openJpAuth,
    setStatus,
    setError,
    words,
    refs,
    sharedTodayWordIds,
    teacherVisibleLimit,
    highlightId,
    wordSyncState,
    sharedTodayWordIdsRef,
    refsRef,
    setWords,
    setDisplayOrder,
    setSharedTodayWordIds,
    setTeacherVisibleLimit,
    setQuizPriorityBoost,
    setSessionLevel,
    setSessionReviewAt,
    setHighlightId,
    restoreDailyRowOrder,
    setPage,
    persistCache,
  } = options;

  const [resetting, setResetting] = useState(false);
  const [showResetChoice, setShowResetChoice] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [boostingWordId, setBoostingWordId] = useState<number | null>(null);
  const [quizTargetInput, setQuizTargetInput] = useState(() =>
    String(
      readJpVocabPageCache()?.teacher_visible_limit?.quiz_target ??
        normalizeJpVocabTeacherVisibleLimit(null).quiz_target
    )
  );
  const [settingQuizTarget, setSettingQuizTarget] = useState(false);

  // 仅在「已保存值」变化时回写输入框；保存中禁止被 sync 旧值打回
  useEffect(() => {
    if (settingQuizTarget) return;
    setQuizTargetInput(String(teacherVisibleLimit.quiz_target));
  }, [teacherVisibleLimit.quiz_target, settingQuizTarget]);

  const boostQuizPriority = async (word: JpVocabWord) => {
    if (!isAdminMode || !canOperate) {
      setStatus("请登录后再操作。");
      openJpAuth();
      return;
    }
    if (boostingWordId != null) return;

    setBoostingWordId(word.id);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "boost_quiz_priority",
          word_id: word.id,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        quiz_priority_boost?: JpVocabQuizPriorityBoost;
        error?: string;
      };
      if (!data.ok || !data.quiz_priority_boost) {
        throw new Error(data.error || "设置失败");
      }
      setQuizPriorityBoost(data.quiz_priority_boost);
      const seq = jpVocabTomorrowBoostSeq(data.quiz_priority_boost, word.id);
      setStatus(
        seq != null
          ? `「${word.word}」已加入明日优先抽查队列（第 ${seq} 位）。`
          : `「${word.word}」已加入明日优先抽查队列。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBoostingWordId(null);
    }
  };

  const deleteWord = async (word: JpVocabWord) => {
    if (!isAdmin) {
      setStatus("仅 Admin 账户可删除词条。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再删除。");
      openJpAuth();
      return;
    }
    if (deletingId === word.id || wordSyncState[word.id]) return;

    const ok = window.confirm(`确定删除「${word.word}」？此操作不可恢复。`);
    if (!ok) return;

    setDeletingId(word.id);
    setStatus("");
    setError("");

    try {
      await jpVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/jp-vocab/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_ids: [word.id] }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          deleted?: number;
          words?: JpVocabWord[];
          display_order?: JpVocabDailyDisplayOrder;
          error?: string;
        };
        if (res.status === 403) {
          throw new Error("仅 Admin 账户可删除词条。");
        }
        if (!data.ok || !data.words || !data.display_order) {
          throw new Error(data.error || "删除失败");
        }

        const wasShared = sharedTodayWordIds.has(word.id);
        const nextSharedIds = [...sharedTodayWordIdsRef.current].filter(
          (id) => id !== word.id
        );
        setWords(data.words);
        setDisplayOrder(data.display_order);
        persistCache(
          data.words,
          refsRef.current,
          data.display_order,
          nextSharedIds
        );
        setSharedTodayWordIds(new Set(nextSharedIds));
        setSessionLevel((prev) => {
          const next = { ...prev };
          delete next[word.id];
          return next;
        });
        setSessionReviewAt((prev) => {
          const next = { ...prev };
          delete next[word.id];
          return next;
        });
        if (highlightId === word.id) {
          setHighlightId(null);
        }
        if (wasShared) {
          notifyJpVocabSharedUpdated({ wordId: word.id });
        }
        setStatus(`已删除词条「${word.word}」。`);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const runReset = async (action: "reset_today" | "reset") => {
    setResetting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        display_order?: JpVocabDailyDisplayOrder;
        teacher_visible_limit?: JpVocabTeacherVisibleLimit;
        shared_today_word_ids?: number[];
        error?: string;
      };
      if (!data.ok || !data.words || !data.display_order) {
        throw new Error(data.error || "重置失败");
      }
      const nextSharedIds = data.shared_today_word_ids ?? [];
      setWords(data.words);
      setDisplayOrder(data.display_order);
      setSharedTodayWordIds(new Set(nextSharedIds));
      if (data.teacher_visible_limit) {
        setTeacherVisibleLimit(data.teacher_visible_limit);
        persistCache(
          data.words,
          refs,
          data.display_order,
          nextSharedIds,
          data.teacher_visible_limit
        );
      } else {
        persistCache(data.words, refs, data.display_order, nextSharedIds);
      }
      setSessionLevel({});
      setSessionReviewAt({});
      restoreDailyRowOrder();
      setHighlightId(null);
      setPage(1);
      setShowResetChoice(false);
      setStatus(
        action === "reset_today"
          ? "已今日重置：单词顺序已更新，当前轮次勾选与今日共享已清空；今日抽查数量与统计次数保持不变。"
          : "已全部重置（含今日共享记录），可以开始新一轮复习。"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  const openResetChoice = () => {
    if (!canOperate) {
      setStatus("请登录后再重置。");
      openJpAuth();
      return;
    }
    if (resetting) return;
    setShowResetChoice(true);
  };

  const resetToday = () => void runReset("reset_today");

  const resetAll = () => {
    const ok = window.confirm(
      "确定全部重置？将清空所有单词的熟悉程度勾选与统计次数，并清除今日共享记录，开始新一轮复习。"
    );
    if (!ok) return;
    void runReset("reset");
  };

  const setDailyQuizTarget = async () => {
    if (!isAdminMode || settingQuizTarget) return;
    const trimmed = quizTargetInput.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setStatus("请输入今日抽查数量。");
      return;
    }
    const count = Math.min(999, Math.max(1, Math.floor(parsed)));
    setSettingQuizTarget(true);
    setStatus("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "set_daily_quiz_target",
          count,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        teacher_visible_limit?: JpVocabTeacherVisibleLimit;
        error?: string;
      };
      if (!data.ok || !data.teacher_visible_limit) {
        throw new Error(data.error || "操作失败");
      }
      setTeacherVisibleLimit(data.teacher_visible_limit);
      setQuizTargetInput(String(data.teacher_visible_limit.quiz_target));
      const prev = readJpVocabPageCache();
      if (prev) {
        writeClientCache(JP_VOCAB_CACHE_KEY, {
          ...prev,
          teacher_visible_limit: data.teacher_visible_limit,
        });
      }
      notifyJpVocabQuizTargetUpdated({
        quiz_target: data.teacher_visible_limit.quiz_target,
        quiz_target_adjusted_at: data.teacher_visible_limit.quiz_target_adjusted_at,
      });
      setStatus(
        `今日抽查数量已设为 ${data.teacher_visible_limit.quiz_target} 个（老师端按可见池抽查，优先从未抽查过的词条）。` +
          ` 同浏览器已打开的老师页会立即同步；老师在别的手机/电脑上请点「刷新」，或开着抽查卡时会自动跟上。`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingQuizTarget(false);
    }
  };

  return {
    resetting,
    showResetChoice,
    setShowResetChoice,
    deletingId,
    boostingWordId,
    quizTargetInput,
    setQuizTargetInput,
    settingQuizTarget,
    boostQuizPriority,
    deleteWord,
    openResetChoice,
    resetToday,
    resetAll,
    setDailyQuizTarget,
  };
}
