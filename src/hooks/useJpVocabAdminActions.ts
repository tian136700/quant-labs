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
import { normalizeJpVocabQuizTimeWeight } from "@/lib/jp-vocab-quiz-score";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  type JpVocabStatSortKey,
} from "@/lib/jp-vocab-shared";
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
  setQuizTimeWeight: Dispatch<SetStateAction<number>>;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, JpVocabLevel | undefined>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  setUseDailyRowOrder: Dispatch<SetStateAction<boolean>>;
  setStatSort: Dispatch<
    SetStateAction<{ key: JpVocabStatSortKey; dir: "asc" | "desc" }>
  >;
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
    setQuizTimeWeight,
    setSessionLevel,
    setSessionReviewAt,
    setHighlightId,
    setUseDailyRowOrder,
    setStatSort,
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
  const [settingQuizTimeWeight, setSettingQuizTimeWeight] = useState(false);

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
      setUseDailyRowOrder(true);
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
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

  const setQuizTimeWeightConfig = async (weight: number): Promise<boolean> => {
    if (!isAdminMode || settingQuizTimeWeight) return false;
    const normalized = normalizeJpVocabQuizTimeWeight(weight);
    setSettingQuizTimeWeight(true);
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
          action: "set_quiz_time_weight",
          quiz_time_weight: normalized,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        quiz_time_weight?: number;
        error?: string;
      };
      if (!data.ok || data.quiz_time_weight == null) {
        throw new Error(data.error || "操作失败");
      }
      const saved = normalizeJpVocabQuizTimeWeight(data.quiz_time_weight);
      setQuizTimeWeight(saved);
      const prev = readJpVocabPageCache();
      if (prev) {
        writeClientCache(JP_VOCAB_CACHE_KEY, {
          ...prev,
          quiz_time_weight: saved,
        });
      }
      setStatus(
        `久未复习抬升权重已设为 ${saved}（最终得分 = 抽查优先级 + 距上次抽问天数 × ${saved}）。次日凌晨或「今日重置」后重排生效。`
      );
      return true;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSettingQuizTimeWeight(false);
    }
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
          ` japanese 域名下已打开的老师页约 3 秒内自动同步；若未打开请刷新 japanese.info-quests.com/jp-vocab。`
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
    settingQuizTimeWeight,
    boostQuizPriority,
    deleteWord,
    openResetChoice,
    resetToday,
    resetAll,
    setDailyQuizTarget,
    setQuizTimeWeightConfig,
  };
}
