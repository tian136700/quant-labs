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
import { JP_VOCAB_CACHE_KEY } from "@/lib/en-api-cache";
import { writeClientCache } from "@/lib/client-swr-cache";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  JP_VOCAB_DEFAULT_STAT_SORT,
  type EnVocabStatSortKey,
} from "@/lib/en-vocab-shared";
import {
  defaultEnVocabTeacherVisibleLimit,
  normalizeEnVocabTeacherVisibleLimit,
  type EnVocabTeacherVisibleLimit,
} from "@/lib/en-vocab-teacher-visible";
import {
  persistEnVocabPageCache,
  readEnVocabPageCache,
} from "@/lib/en-vocab-page-cache";
import { publishEnVocabAdminReset } from "@/lib/en-vocab-reset-broadcast";
import { clearEnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz-storage";
import type { EnVocabLevel, EnVocabRef, EnVocabWord } from "@/lib/types";

export function useEnVocabAdminActions(options: {
  locale: Locale;
  isAdminMode: boolean;
  canOperate: boolean;
  openEnAuth: () => void;
  setStatus: (message: string) => void;
  setError: (message: string) => void;
  words: EnVocabWord[];
  refs: Record<string, EnVocabRef>;
  refsRef: MutableRefObject<Record<string, EnVocabRef>>;
  displayOrderRef: MutableRefObject<EnVocabDailyDisplayOrder>;
  teacherVisibleLimit: EnVocabTeacherVisibleLimit;
  highlightId: number | null;
  editingWord: EnVocabWord | null;
  userId: number | null;
  setWords: Dispatch<SetStateAction<EnVocabWord[]>>;
  setDisplayOrder: Dispatch<SetStateAction<EnVocabDailyDisplayOrder>>;
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setTeacherVisibleLimit: Dispatch<SetStateAction<EnVocabTeacherVisibleLimit>>;
  setSessionLevel: Dispatch<
    SetStateAction<Record<number, EnVocabLevel | undefined>>
  >;
  setSessionUsageLevels: Dispatch<
    SetStateAction<Record<number, Array<EnVocabLevel | null | undefined>>>
  >;
  setSessionReviewAt: Dispatch<SetStateAction<Record<number, number>>>;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  setEditingWord: Dispatch<SetStateAction<EnVocabWord | null>>;
  setUseDailyRowOrder: Dispatch<SetStateAction<boolean>>;
  setStatSort: Dispatch<
    SetStateAction<{ key: EnVocabStatSortKey; dir: "asc" | "desc" }>
  >;
  setPage: Dispatch<SetStateAction<number>>;
  /** 重置后清本页抽查卡会话 */
  onResetClearTeacherQuizUi?: () => void;
}) {
  const {
    locale,
    isAdminMode,
    canOperate,
    openEnAuth,
    setStatus,
    setError,
    words,
    refs,
    refsRef,
    displayOrderRef,
    teacherVisibleLimit,
    highlightId,
    editingWord,
    userId,
    setWords,
    setDisplayOrder,
    setSharedTodayWordIds,
    setTeacherVisibleLimit,
    setSessionLevel,
    setSessionUsageLevels,
    setSessionReviewAt,
    setHighlightId,
    setEditingWord,
    setUseDailyRowOrder,
    setStatSort,
    setPage,
    onResetClearTeacherQuizUi,
  } = options;

  const [resetting, setResetting] = useState(false);
  const [showResetChoice, setShowResetChoice] = useState(false);
  const [quizTargetInput, setQuizTargetInput] = useState(() =>
    String(
      readEnVocabPageCache()?.teacher_visible_limit?.quiz_target ??
        defaultEnVocabTeacherVisibleLimit().quiz_target
    )
  );
  const [settingQuizTarget, setSettingQuizTarget] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(
    () => new Set()
  );

  // 仅在「已保存值」变化时回写输入框；保存中禁止被 sync 旧值打回
  useEffect(() => {
    if (settingQuizTarget) return;
    setQuizTargetInput(String(teacherVisibleLimit.quiz_target));
  }, [teacherVisibleLimit.quiz_target, settingQuizTarget]);

  const setDailyQuizTarget = async () => {
    if (!isAdminMode || settingQuizTarget) return;
    const trimmed = quizTargetInput.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setStatus("请输入今日抽查数量。");
      return;
    }
    const count = Math.min(999, Math.max(1, Math.floor(parsed)));
    // 等接口成功后再改 teacherVisibleLimit / 进度分母，禁止乐观更新
    setSettingQuizTarget(true);
    setStatus("");
    try {
      const res = await fetch("/api/en-vocab", {
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
        teacher_visible_limit?: EnVocabTeacherVisibleLimit;
        error?: string;
      };
      if (!data.ok || !data.teacher_visible_limit) {
        throw new Error(data.error || "操作失败");
      }
      const next = normalizeEnVocabTeacherVisibleLimit(data.teacher_visible_limit);
      setTeacherVisibleLimit(next);
      setQuizTargetInput(String(next.quiz_target));
      const prev = readEnVocabPageCache();
      if (prev) {
        writeClientCache(JP_VOCAB_CACHE_KEY, {
          ...prev,
          teacher_visible_limit: next,
        });
      }
      setStatus(
        `今日抽查数量已设为 ${next.quiz_target} 个（老师端按当日序号 1…N 抽查）。` +
          ` english 域名下已打开的老师页约数秒内自动同步；若未打开请刷新 english.info-quests.com/en-vocab。`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // 失败时把输入框恢复为当前已保存值（非乐观回滚草稿以外的状态）
      setQuizTargetInput(String(teacherVisibleLimit.quiz_target));
    } finally {
      setSettingQuizTarget(false);
    }
  };

  const runReset = async (action: "reset_today" | "reset") => {
    setResetting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/en-vocab", {
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
        words?: EnVocabWord[];
        display_order?: EnVocabDailyDisplayOrder;
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
      persistEnVocabPageCache(data.words, refs, data.display_order, nextSharedIds);
      setSessionLevel({});
      setSessionUsageLevels({});
      setSessionReviewAt({});
      if (userId != null) clearEnVocabTeacherQuizSession(userId);
      onResetClearTeacherQuizUi?.();
      publishEnVocabAdminReset(action === "reset_today" ? "today" : "all");
      setUseDailyRowOrder(true);
      setStatSort(JP_VOCAB_DEFAULT_STAT_SORT);
      setHighlightId(null);
      setPage(1);
      setShowResetChoice(false);
      setStatus(
        action === "reset_today"
          ? "已今日重置：单词顺序已更新，当前轮次勾选与今日共享已清空，统计次数保持不变。"
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
      openEnAuth();
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

  const exportExcel = async (displayedWords: EnVocabWord[], sessionLevel: Record<number, EnVocabLevel | undefined>) => {
    if (exporting || !displayedWords.length) return;
    setExporting(true);
    setStatus("");
    try {
      const { exportEnVocabToExcel } = await import("@/lib/en-vocab-export");
      await exportEnVocabToExcel(displayedWords, refs, sessionLevel);
      setStatus(`已导出 ${displayedWords.length} 条到 Excel。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const toggleDeleteSelection = (wordId: number, checked: boolean) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(wordId);
      else next.delete(wordId);
      return next;
    });
  };

  const toggleSelectAllPageForDelete = (pagedDeleteIds: number[], allPageDeleteSelected: boolean) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (allPageDeleteSelected) {
        for (const id of pagedDeleteIds) next.delete(id);
      } else {
        for (const id of pagedDeleteIds) next.add(id);
      }
      return next;
    });
  };

  const batchDeleteSelected = async () => {
    if (!isAdminMode) {
      setStatus("仅管理员端可删除词条。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再删除。");
      openEnAuth();
      return;
    }
    if (deletingBatch || selectedDeleteIds.size === 0) return;

    const ids = [...selectedDeleteIds];
    const ok = window.confirm(
      `确定删除选中的 ${ids.length} 条词条？此操作不可恢复。`
    );
    if (!ok) return;

    setDeletingBatch(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/en-vocab/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ word_ids: ids }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        deleted?: number;
        words?: EnVocabWord[];
        display_order?: EnVocabDailyDisplayOrder;
        error?: string;
      };
      if (res.status === 403) {
        throw new Error("仅 Admin 账户可删除词条。");
      }
      if (!data.ok || !data.words || !data.display_order) {
        throw new Error(data.error || "删除失败");
      }

      const deletedSet = new Set(ids);
      setWords(data.words);
      setDisplayOrder(data.display_order);
      persistEnVocabPageCache(data.words, refs, data.display_order);
      setSelectedDeleteIds(new Set());
      setSharedTodayWordIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setSessionLevel((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setSessionReviewAt((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      if (highlightId != null && deletedSet.has(highlightId)) {
        setHighlightId(null);
      }
      setStatus(`已删除 ${data.deleted ?? ids.length} 条词条。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingBatch(false);
    }
  };

  const deleteWord = async (w: EnVocabWord) => {
    if (!isAdminMode) {
      setStatus("仅管理员端可删除词条。");
      return;
    }
    if (!canOperate) {
      setStatus("请登录后再删除。");
      openEnAuth();
      return;
    }
    if (deletingBatch) return;
    const ok = window.confirm(`确定删除词条「${w.word}」？此操作不可恢复。`);
    if (!ok) return;

    setDeletingBatch(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/en-vocab/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ word_ids: [w.id] }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        deleted?: number;
        error?: string;
      };
      if (res.status === 401) {
        openEnAuth();
        throw new Error("请登录后再删除。");
      }
      if (res.status === 403) {
        throw new Error("仅 Admin 账户可删除词条。");
      }
      if (!data.ok) {
        throw new Error(data.error || "删除失败");
      }
      setWords((prev) => prev.filter((item) => item.id !== w.id));
      setSelectedDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(w.id);
        return next;
      });
      if (highlightId === w.id) setHighlightId(null);
      if (editingWord?.id === w.id) setEditingWord(null);
      setStatus("已删除 1 条词条。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingBatch(false);
    }
  };

  return {
    resetting,
    showResetChoice,
    setShowResetChoice,
    quizTargetInput,
    setQuizTargetInput,
    settingQuizTarget,
    exporting,
    deletingBatch,
    selectedDeleteIds,
    setDailyQuizTarget,
    openResetChoice,
    resetToday,
    resetAll,
    exportExcel,
    toggleDeleteSelection,
    toggleSelectAllPageForDelete,
    batchDeleteSelected,
    deleteWord,
  };
}
