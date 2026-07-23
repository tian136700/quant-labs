"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { KoPronDailyQuizCompleteModal } from "@/components/KoPronDailyQuizCompleteModal";
import { KoPronEditModal } from "@/components/KoPronEditModal";
import { KoPronLetterCopyButton } from "@/components/KoPronLetterCopyButton";
import { KoPronSpeakButton } from "@/components/KoPronSpeakButton";
import { KoPronTeacherQuizFlashcardModal } from "@/components/KoPronTeacherQuizFlashcardModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import {
  computeKoPronDailyQuizProgress,
  computeKoPronTeacherPageQuizProgress,
} from "@/lib/ko-pron-daily-quiz-progress";
import {
  effectiveKoPronDisplayLevel,
  isKoPronLetterReviewLocked,
} from "@/lib/ko-pron-review";
import {
  advanceKoPronTeacherQuizSession,
  buildKoPronTeacherQuizLetterIds,
  expandKoPronTeacherQuizSessionForTarget,
  filterKoPronTeacherQuizUncheckedLetters,
  pruneKoPronTeacherQuizSessionChecked,
  type KoPronTeacherQuizSession,
} from "@/lib/ko-pron-teacher-quiz";
import {
  buildKoPronDailySeqMap,
  listKoPronTeacherQuizPoolLetters,
  type KoPronTeacherVisibleLimit,
} from "@/lib/ko-pron-teacher-visible";
import type { KoPronDailyDisplayOrder } from "@/lib/ko-pron-daily-order";
import { koPronFinalQuizScoreOrNull } from "@/lib/ko-pron-daily-order";
import {
  filterKoPronLettersBySearch,
  KO_PRON_CATEGORIES,
  type KoPronCategoryFilter,
} from "@/lib/ko-pron-search";
import {
  animateJpVocabSaveProgressTo100,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import { JP_VOCAB_POLL_HIDDEN_MS, JP_VOCAB_POLL_MS } from "@/lib/jp-vocab-sync";
import { koPronAdminPath, koPronPath, koPronSelectPath } from "@/lib/locale-path";
import type { KoPronLetter, KoPronLevel } from "@/lib/types";

export type KoPronPageVariant = "teacher" | "admin";

type Props = {
  variant: KoPronPageVariant;
};

type SessionLevels = Record<number, KoPronLevel>;

export function KoPronPage({ variant }: Props) {
  const router = useRouter();
  const {
    user,
    checking,
    isAdmin,
    canAccessKoPron,
    canAccessKoPronTeacherPage,
    canAccessKoPronAdminPage,
    openAuthPanel,
    setUser,
  } = useEtrAuth();

  const isAdminMode = variant === "admin";
  const isTeacherMode = variant === "teacher";
  const canOperate = canAccessKoPron;

  const [letters, setLetters] = useState<KoPronLetter[]>([]);
  const [teacherVisible, setTeacherVisible] =
    useState<KoPronTeacherVisibleLimit | null>(null);
  const [displayOrder, setDisplayOrder] =
    useState<KoPronDailyDisplayOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionLevels, setSessionLevels] = useState<SessionLevels>({});
  const [quizSession, setQuizSession] = useState<KoPronTeacherQuizSession | null>(
    null
  );
  const [showFlashcard, setShowFlashcard] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<KoPronLetter | null>(null);
  const [editingLetter, setEditingLetter] = useState<KoPronLetter | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [targetDraft, setTargetDraft] = useState("10");
  const [targetSaving, setTargetSaving] = useState(false);
  const [saveBusyId, setSaveBusyId] = useState<number | null>(null);
  const [savePercent, setSavePercent] = useState<number | null>(null);
  const [saveQueued, setSaveQueued] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<KoPronCategoryFilter>("all");
  const completeShownRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sinceRef = useRef("");

  useEffect(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: isAdminMode ? "韩语发音-管理员端" : "韩语发音-老师端",
      subtitle: "请登录后继续",
    });
  }, [openAuthPanel, isAdminMode]);

  useEffect(() => {
    if (checking || !user) return;
    if (variant === "teacher" && isAdmin) {
      router.replace(koPronAdminPath());
      return;
    }
    if (variant === "admin" && !canAccessKoPronAdminPage) {
      router.replace(
        canAccessKoPronTeacherPage ? koPronPath() : koPronPath()
      );
    }
  }, [
    checking,
    user,
    variant,
    isAdmin,
    canAccessKoPronAdminPage,
    canAccessKoPronTeacherPage,
    router,
  ]);

  const loadLetters = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ko-pron", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        letters?: KoPronLetter[];
        teacher_visible_limit?: KoPronTeacherVisibleLimit;
        display_order?: KoPronDailyDisplayOrder;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      const next = data.letters ?? [];
      setLetters(next);
      if (data.teacher_visible_limit) {
        setTeacherVisible(data.teacher_visible_limit);
        setTargetDraft(String(data.teacher_visible_limit.quiz_target));
      }
      if (data.display_order) {
        setDisplayOrder(data.display_order);
      }
      sinceRef.current = next.reduce(
        (max, l) => (l.updated_at > max ? l.updated_at : max),
        ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !user) return;
    void loadLetters();
  }, [checking, user, loadLetters]);

  useEffect(() => {
    if (checking || !user) return;
    const tick = async () => {
      try {
        const since = encodeURIComponent(sinceRef.current || "");
        const res = await fetch(`/api/ko-pron/sync?since=${since}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          letters?: KoPronLetter[];
          teacher_visible_limit?: KoPronTeacherVisibleLimit;
        };
        if (!res.ok || !data.ok) return;
        if (data.letters?.length) {
          setLetters((prev) => {
            const byId = new Map(data.letters!.map((l) => [l.id, l]));
            return prev.map((l) => {
              const patch = byId.get(l.id);
              if (!patch || patch.updated_at <= l.updated_at) return l;
              return { ...l, ...patch };
            });
          });
          sinceRef.current = data.letters.reduce(
            (max, l) => (l.updated_at > max ? l.updated_at : max),
            sinceRef.current
          );
        }
        if (data.teacher_visible_limit) {
          setTeacherVisible(data.teacher_visible_limit);
          setTargetDraft(String(data.teacher_visible_limit.quiz_target));
        }
      } catch {
        /* ignore poll errors */
      }
    };
    const id = window.setInterval(
      () => {
        void tick();
      },
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : JP_VOCAB_POLL_MS
    );
    return () => window.clearInterval(id);
  }, [checking, user]);

  const visible = teacherVisible ?? {
    date: "",
    limit: 10,
    count: 10,
    quiz_target: 10,
    released_today: false,
    release_count: 10,
  };

  const dailySeqById = useMemo(
    () => buildKoPronDailySeqMap(letters, displayOrder?.ids),
    [letters, displayOrder]
  );
  const quizPool = useMemo(
    () =>
      listKoPronTeacherQuizPoolLetters(letters, visible, displayOrder?.ids),
    [letters, visible, displayOrder]
  );

  const hasLevel = useCallback(
    (letterId: number) => {
      if (sessionLevels[letterId]) return true;
      const letter = letters.find((l) => l.id === letterId);
      return letter
        ? Boolean(effectiveKoPronDisplayLevel(letter, undefined))
        : false;
    },
    [letters, sessionLevels]
  );

  const teacherPending = useMemo(() => {
    if (!isTeacherMode) return quizPool;
    return quizPool.filter((l) => !hasLevel(l.id));
  }, [isTeacherMode, quizPool, hasLevel]);

  const baseDisplayLetters = useMemo(() => {
    if (isAdminMode) {
      if (displayOrder?.ids?.length) {
        const byId = new Map(letters.map((l) => [l.id, l]));
        const ordered = displayOrder.ids
          .map((id) => byId.get(id))
          .filter((l): l is KoPronLetter => l != null);
        const seen = new Set(ordered.map((l) => l.id));
        for (const letter of letters) {
          if (!seen.has(letter.id)) ordered.push(letter);
        }
        return ordered;
      }
      return letters;
    }
    if (visible.quiz_target > 0 && quizPool.every((l) => hasLevel(l.id))) {
      return quizPool;
    }
    return teacherPending.length ? teacherPending : quizPool;
  }, [
    isAdminMode,
    letters,
    displayOrder,
    quizPool,
    teacherPending,
    visible.quiz_target,
    hasLevel,
  ]);

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || categoryFilter !== "all";

  const displayLetters = useMemo(
    () =>
      filterKoPronLettersBySearch(
        baseDisplayLetters,
        searchQuery,
        categoryFilter
      ),
    [baseDisplayLetters, searchQuery, categoryFilter]
  );

  const adminProgress = useMemo(
    () => computeKoPronDailyQuizProgress(letters, visible),
    [letters, visible]
  );

  const teacherProgress = useMemo(
    () =>
      computeKoPronTeacherPageQuizProgress(
        quizPool.map((l) => ({ id: l.id })),
        hasLevel
      ),
    [quizPool, hasLevel]
  );

  const displayProgress = isAdminMode ? adminProgress : teacherProgress;

  useEffect(() => {
    if (!isTeacherMode || !canOperate) return;
    if (!displayProgress.complete) {
      completeShownRef.current = false;
      return;
    }
    if (completeShownRef.current) return;
    completeShownRef.current = true;
    setShowComplete(true);
    setShowFlashcard(false);
    setQuizSession(null);
  }, [isTeacherMode, canOperate, displayProgress.complete]);

  const clearSaveTimer = () => {
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const syncLiveLetter = useCallback(async (letterId: number | null) => {
    if (!isTeacherMode || !canOperate) return;
    try {
      await fetch("/api/ko-pron/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          letterId == null
            ? { action: "clear" }
            : { action: "set", letter_id: letterId }
        ),
      });
    } catch {
      /* ignore live sync errors */
    }
  }, [isTeacherMode, canOperate]);

  const revealLiveReading = useCallback(async (letterId: number) => {
    if (!isTeacherMode || !canOperate) return;
    try {
      await fetch("/api/ko-pron/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", letter_id: letterId }),
      });
    } catch {
      /* ignore */
    }
  }, [isTeacherMode, canOperate]);

  const recordLevel = useCallback(
    async (letterId: number, level: KoPronLevel) => {
      if (!canOperate) return;
      setSaveBusyId(letterId);
      setSaveQueued(true);
      setSavePercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
      const startedAt = Date.now();
      clearSaveTimer();
      setSaveQueued(false);
      saveTimerRef.current = setInterval(() => {
        setSavePercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
      }, 200);

      try {
        const res = await fetch("/api/ko-pron", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ letter_id: letterId, level }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          code?: string;
          letter?: KoPronLetter;
        };
        if (!res.ok || !data.ok || !data.letter) {
          if (data.code === "review_locked" || data.error === "review_locked") {
            throw new Error("勾选已满 1 小时，无法再修改。");
          }
          throw new Error(data.error || "保存失败");
        }
        setLetters((prev) =>
          prev.map((l) => (l.id === letterId ? data.letter! : l))
        );
        setSessionLevels((prev) => ({ ...prev, [letterId]: level }));
        await revealLiveReading(letterId);
        await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        clearSaveTimer();
        setSaveBusyId(null);
        setSavePercent(null);
        setSaveQueued(false);
      }
    },
    [canOperate, revealLiveReading]
  );

  const startQuiz = useCallback(
    (preferredId?: number) => {
      const unchecked = filterKoPronTeacherQuizUncheckedLetters(quizPool, hasLevel);
      if (!unchecked.length) return;
      const letterIds = buildKoPronTeacherQuizLetterIds(unchecked);
      let currentIndex = 0;
      if (preferredId != null) {
        const found = letterIds.indexOf(preferredId);
        if (found >= 0) currentIndex = found;
      }
      setQuizSession({ mode: "random", letterIds, currentIndex });
      setShowFlashcard(true);
    },
    [quizPool, hasLevel]
  );

  const currentQuizLetter = useMemo(() => {
    if (!quizSession) return null;
    const id = quizSession.letterIds[quizSession.currentIndex];
    return letters.find((l) => l.id === id) ?? null;
  }, [quizSession, letters]);

  useEffect(() => {
    if (!isTeacherMode) return;
    if (showFlashcard && currentQuizLetter) {
      void syncLiveLetter(currentQuizLetter.id);
      return;
    }
    void syncLiveLetter(null);
  }, [isTeacherMode, showFlashcard, currentQuizLetter?.id, syncLiveLetter]);

  const goNextInQuiz = useCallback(() => {
    setQuizSession((prev) => {
      if (!prev) return null;
      const withoutCurrentLevel = pruneKoPronTeacherQuizSessionChecked(prev, hasLevel);
      if (!withoutCurrentLevel) {
        return expandKoPronTeacherQuizSessionForTarget(null, quizPool, hasLevel);
      }
      const advanced = advanceKoPronTeacherQuizSession(withoutCurrentLevel);
      if (advanced) return advanced;
      return expandKoPronTeacherQuizSessionForTarget(
        withoutCurrentLevel,
        quizPool,
        hasLevel
      );
    });
  }, [hasLevel, quizPool]);

  useEffect(() => {
    if (!showFlashcard || !quizSession) return;
    if (displayProgress.complete) {
      setShowFlashcard(false);
      setQuizSession(null);
      return;
    }
    const pruned = pruneKoPronTeacherQuizSessionChecked(quizSession, hasLevel);
    if (!pruned) {
      const expanded = expandKoPronTeacherQuizSessionForTarget(
        null,
        quizPool,
        hasLevel
      );
      if (!expanded) {
        setShowFlashcard(false);
        setQuizSession(null);
      } else {
        setQuizSession(expanded);
      }
    }
  }, [showFlashcard, quizSession, hasLevel, quizPool, displayProgress.complete]);

  const setDailyQuizTarget = async () => {
    const count = Math.floor(Number(targetDraft));
    if (!Number.isFinite(count) || count < 1) {
      setError("请输入有效的今日抽查数量");
      return;
    }
    setTargetSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ko-pron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_daily_quiz_target", count }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        teacher_visible_limit?: KoPronTeacherVisibleLimit;
      };
      if (!res.ok || !data.ok || !data.teacher_visible_limit) {
        throw new Error(data.error || "设置失败");
      }
      setTeacherVisible(data.teacher_visible_limit);
      setTargetDraft(String(data.teacher_visible_limit.quiz_target));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTargetSaving(false);
    }
  };

  const unmarkedCount = teacherPending.length;
  const hideQuizList =
    isTeacherMode &&
    showFlashcard &&
    Boolean(quizSession) &&
    !displayProgress.complete;

  if (checking) {
    return <p className="ko-pron-status">正在检查登录状态…</p>;
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title={isAdminMode ? "登录 · 韩语发音抽问（管理员）" : "登录 · 韩语发音抽问"}
        subtitle="请登录后继续访问韩语发音抽问。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  if (isTeacherMode && !canAccessKoPronTeacherPage && !isAdmin) {
    return <p className="ko-pron-status">无权限访问韩语发音抽问老师端。</p>;
  }

  if (isAdminMode && !canAccessKoPronAdminPage) {
    return <p className="ko-pron-status">无权限访问韩语发音抽问管理员端。</p>;
  }

  return (
    <div className="ko-pron-page">
      <div className="ko-pron-toolbar">
        <h1 className="ko-pron-title">
          {isAdminMode ? "韩语发音抽问-管理员端" : "韩语发音抽问-老师端"}
        </h1>
        <div className="ko-pron-toolbar-stats">
          {isAdminMode ? (
            <>
              <span>共 {letters.length} 条</span>
              <span>今日抽查目标 {visible.quiz_target}</span>
            </>
          ) : (
            <span>本轮未勾选 {unmarkedCount}</span>
          )}
        </div>
        {isTeacherMode && canOperate && !displayProgress.complete ? (
          <button
            type="button"
            className="ko-pron-start-btn"
            onClick={() => startQuiz()}
            disabled={!teacherPending.length}
          >
            开始抽查
          </button>
        ) : null}
      </div>

      <JpVocabDailyQuizProgressBar
        progress={displayProgress}
        variant="teacher"
        adminQuizTarget={
          isAdminMode
            ? {
                value: targetDraft,
                savedValue: visible.quiz_target,
                saving: targetSaving,
                onChange: setTargetDraft,
                onSave: () => {
                  void setDailyQuizTarget();
                },
              }
            : undefined
        }
      />

      {error ? <p className="ko-pron-error">{error}</p> : null}
      {loading ? <p className="ko-pron-status">加载中…</p> : null}

      {!loading && !letters.length ? (
        <div className="ko-pron-empty-pool">
          <p>
            抽问池为空。请先在「韩语发音勾选」勾选已背过的字母；勾选后会进入本页，同日勾选次日才进老师今日抽查池。
          </p>
          {isAdminMode ? (
            <a className="ko-pron-empty-pool__link" href={koPronSelectPath()}>
              前往韩语发音勾选
            </a>
          ) : null}
        </div>
      ) : null}

      {!loading && !hideQuizList && letters.length > 0 ? (
        <>
          <div className="ko-pron-search" role="search">
            <label htmlFor="ko-pron-search" className="ko-pron-search__label">
              搜索
            </label>
            <div className="ko-pron-search__row">
              <select
                id="ko-pron-category-filter"
                className="ko-pron-search__category"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as KoPronCategoryFilter)
                }
                disabled={loading}
                aria-label="分类筛选"
              >
                <option value="all">全部分类</option>
                {KO_PRON_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                id="ko-pron-search"
                type="search"
                className="ko-pron-search__input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="字母、读音、说明…（本地即时）"
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {filterActive ? (
              <>
                <button
                  type="button"
                  className="ko-pron-search__clear"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("all");
                  }}
                >
                  清除
                </button>
                <span className="ko-pron-search__meta">
                  匹配 {displayLetters.length} / {baseDisplayLetters.length} 条
                </span>
              </>
            ) : null}
          </div>
          {filterActive && !displayLetters.length ? (
            <p className="ko-pron-search__empty">
              {searchActive
                ? `没有匹配「${searchQuery.trim()}」的字母，请换个关键词试试。`
                : `当前没有「${categoryFilter}」分类的字母。`}
            </p>
          ) : (
            <div className="ko-pron-table-wrap">
              <table className="ko-pron-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>字母</th>
                    <th>读音</th>
                    <th>说明</th>
                    <th>分类</th>
                    <th
                      title="最终得分 = 抽查优先级 + 距上次抽问天数 × 0.1（与日语抽问同一算法）"
                    >
                      <span className="ko-pron-th-stack">
                        <span>抽查</span>
                        <span>优先级</span>
                      </span>
                    </th>
                    <th>
                      <span className="ko-pron-th-stack">
                        <span>熟悉程度</span>
                        <span className="ko-pron-th-sub">（今日勾选）</span>
                      </span>
                    </th>
                    <th>
                      <span className="ko-pron-th-stack">
                        <span>复习次数</span>
                        <span className="ko-pron-th-sub">非常/一般/不熟悉</span>
                      </span>
                    </th>
                    {isAdminMode ? <th>操作</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {displayLetters.map((letter) => {
                    const seq = dailySeqById.get(letter.id) ?? "—";
                    const level = effectiveKoPronDisplayLevel(
                      letter,
                      sessionLevels[letter.id]
                    );
                    const risk = koPronFinalQuizScoreOrNull(letter);
                    const riskBadgeTier =
                      risk == null
                        ? "never"
                        : risk >= 2
                          ? "high"
                          : risk <= 0
                            ? "low"
                            : "mid";
                    return (
                      <tr
                        key={letter.id}
                        className={
                          isTeacherMode && canOperate
                            ? "ko-pron-row--clickable"
                            : undefined
                        }
                        onClick={() => {
                          if (!isTeacherMode || !canOperate) return;
                          if (!hasLevel(letter.id)) startQuiz(letter.id);
                        }}
                      >
                        <td className="ko-pron-seq-col" data-label="序号">
                          {seq}
                        </td>
                        <td className="ko-pron-letter-col" data-label="字母">
                          <div className="ko-pron-letter-cell">
                            <span className="ko-pron-letter-glyph">
                              {letter.letter}
                            </span>
                            <KoPronLetterCopyButton letter={letter.letter} />
                            <KoPronSpeakButton
                              letter={letter.letter}
                              reading={letter.reading}
                              variant="compact"
                            />
                          </div>
                          {letter.reading ? (
                            <div className="ko-pron-mobile-reading-row">
                              {letter.reading}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className="ko-pron-reading-col"
                          data-label="读音"
                        >
                          {letter.reading}
                        </td>
                        <td
                          className={`ko-pron-meaning-col${
                            !letter.meaning ? " ko-pron-field-empty" : ""
                          }`}
                          data-label="说明"
                        >
                          {letter.meaning || "—"}
                        </td>
                        <td className="ko-pron-category-col" data-label="分类">
                          {letter.category}
                        </td>
                        <td className="ko-pron-risk-col" data-label="优先级">
                          {risk == null ? (
                            <span
                              className="ko-pron-risk-badge ko-pron-risk-badge--never"
                              title="从未抽查：不按优先级计分，日序默认置顶"
                            >
                              —
                            </span>
                          ) : (
                            <span
                              className={`ko-pron-risk-badge ko-pron-risk-badge--${riskBadgeTier}`}
                              title="数值越大越应该被抽查"
                            >
                              {risk.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="ko-pron-level-col" data-label="熟悉程度">
                          {level === "very"
                            ? "非常熟悉"
                            : level === "normal"
                              ? "一般"
                              : level === "weak"
                                ? "不熟悉"
                                : "—"}
                          {saveBusyId === letter.id ? (
                            <JpVocabSaveProgressBar
                              label={jpVocabSaveProgressLabel("save_level", {
                                queued: saveQueued,
                              })}
                              percent={
                                savePercent != null
                                  ? savePercent
                                  : jpVocabSaveProgressDisplayPercent(null)
                              }
                            />
                          ) : null}
                        </td>
                        <td
                          className="ko-pron-stats-col ko-pron-stats-cell"
                          data-label="复习次数"
                        >
                          <span title="非常熟悉">{letter.cnt_very}</span>
                          <span aria-hidden="true">/</span>
                          <span title="一般">{letter.cnt_normal}</span>
                          <span aria-hidden="true">/</span>
                          <span title="不熟悉">{letter.cnt_weak}</span>
                        </td>
                        {isAdminMode ? (
                          <td className="ko-pron-action-col" data-label="操作">
                            <button
                              type="button"
                              className="ko-pron-preview-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewLetter(letter);
                              }}
                            >
                              查看抽问卡片
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      <KoPronTeacherQuizFlashcardModal
        open={showFlashcard && Boolean(currentQuizLetter)}
        letter={currentQuizLetter}
        mode={quizSession?.mode ?? "random"}
        index={quizSession?.currentIndex ?? 0}
        total={quizSession?.letterIds.length ?? 0}
        selectedLevel={
          currentQuizLetter
            ? effectiveKoPronDisplayLevel(
                currentQuizLetter,
                sessionLevels[currentQuizLetter.id]
              )
            : undefined
        }
        reviewLocked={
          currentQuizLetter
            ? isKoPronLetterReviewLocked(currentQuizLetter)
            : false
        }
        saveBusy={
          currentQuizLetter != null && saveBusyId === currentQuizLetter.id
        }
        savePercent={savePercent}
        saveQueued={saveQueued}
        onSelectLevel={(level) => {
          if (currentQuizLetter) void recordLevel(currentQuizLetter.id, level);
        }}
        onNext={goNextInQuiz}
        onEdit={(letter) => setEditingLetter(letter)}
        onClose={() => {
          setShowFlashcard(false);
          setQuizSession(null);
          void syncLiveLetter(null);
        }}
      />

      <KoPronTeacherQuizFlashcardModal
        open={Boolean(previewLetter)}
        letter={previewLetter}
        mode="random"
        index={0}
        total={1}
        previewMode
        onSelectLevel={() => {}}
        onNext={() => setPreviewLetter(null)}
        onEdit={(letter) => setEditingLetter(letter)}
        onClose={() => setPreviewLetter(null)}
      />

      <KoPronEditModal
        open={Boolean(editingLetter)}
        letter={editingLetter}
        onClose={() => setEditingLetter(null)}
        onSaved={(updated) => {
          setLetters((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l))
          );
          setPreviewLetter((prev) =>
            prev?.id === updated.id ? updated : prev
          );
          setEditingLetter(null);
        }}
      />

      <KoPronDailyQuizCompleteModal
        open={showComplete}
        total={visible.quiz_target}
        onClose={() => setShowComplete(false)}
      />

      <style jsx>{`
        .ko-pron-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1rem 1rem 2.5rem;
          color: var(--text);
        }
        .ko-pron-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem 1rem;
          margin-bottom: 0.85rem;
        }
        .ko-pron-title {
          margin: 0;
          font-size: 1.35rem;
          color: var(--text);
        }
        .ko-pron-toolbar-stats {
          display: flex;
          gap: 0.85rem;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-start-btn,
        .ko-pron-preview-btn {
          border: none;
          border-radius: 0.55rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          padding: 0.45rem 0.85rem;
          cursor: pointer;
        }
        .ko-pron-start-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ko-pron-error {
          color: #f87171;
        }
        .ko-pron-empty-pool {
          border: 1px dashed var(--border);
          border-radius: 0.85rem;
          padding: 1.25rem 1rem;
          background: var(--panel);
          color: var(--muted);
          line-height: 1.55;
          margin: 0.75rem 0 1rem;
        }
        .ko-pron-empty-pool p {
          margin: 0 0 0.75rem;
        }
        .ko-pron-empty-pool__link {
          color: color-mix(in srgb, var(--accent) 70%, #fdba74);
          font-weight: 600;
          text-decoration: none;
        }
        .ko-pron-empty-pool__link:hover {
          text-decoration: underline;
        }
        .ko-pron-status {
          color: var(--muted);
        }
        .ko-pron-search {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.65rem;
          margin: 0.85rem 0 0.65rem;
        }
        .ko-pron-search__label {
          font-size: 0.875rem;
          color: var(--muted);
          flex-shrink: 0;
        }
        .ko-pron-search__row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 28rem;
        }
        .ko-pron-search__category {
          flex: 0 0 auto;
          min-width: 6.5rem;
          padding: 0.45rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .ko-pron-search__category option {
          background: var(--panel);
          color: var(--text);
        }
        .ko-pron-search__category:focus,
        .ko-pron-search__input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
        }
        .ko-pron-search__input {
          flex: 1 1 auto;
          min-width: 0;
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
        }
        .ko-pron-search__input::placeholder {
          color: var(--muted);
        }
        .ko-pron-search__clear {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg) 45%, var(--panel));
          color: var(--text);
          font-size: 0.8125rem;
          padding: 0.35rem 0.65rem;
          cursor: pointer;
        }
        .ko-pron-search__meta {
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .ko-pron-search__empty {
          margin: 0.5rem 0 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
          margin-top: 0.35rem;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: var(--panel);
        }
        .ko-pron-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
          color: var(--text);
        }
        .ko-pron-table th,
        .ko-pron-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: middle;
          color: var(--text);
          background: transparent;
        }
        .ko-pron-table th {
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          font-weight: 600;
          color: var(--muted);
        }
        .ko-pron-th-stack {
          display: inline-flex;
          flex-direction: column;
          line-height: 1.15;
          gap: 0.1rem;
        }
        .ko-pron-th-sub {
          font-size: 0.7rem;
          font-weight: 500;
          color: var(--muted);
        }
        .ko-pron-letter-cell {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 1.35rem;
          font-weight: 700;
          white-space: nowrap;
        }
        .ko-pron-letter-glyph {
          vertical-align: middle;
        }
        .ko-pron-mobile-reading-row {
          display: none;
        }
        .ko-pron-stats-cell {
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          white-space: nowrap;
        }
        .ko-pron-stats-cell span[aria-hidden="true"] {
          margin: 0 0.15rem;
          color: var(--border);
        }
        .ko-pron-risk-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.125rem 0.4375rem;
          border-radius: 999px;
          font-size: 0.8125rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 40%, var(--panel));
          color: var(--text);
        }
        .ko-pron-risk-badge--low {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 40%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        .ko-pron-risk-badge--mid {
          color: #fdba74;
          border-color: color-mix(in srgb, #f97316 40%, var(--border));
          background: color-mix(in srgb, #f97316 14%, var(--panel));
        }
        .ko-pron-risk-badge--high {
          color: var(--rise);
          border-color: color-mix(in srgb, var(--rise) 40%, var(--border));
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
        }
        .ko-pron-risk-badge--never {
          color: var(--muted);
          font-weight: 500;
        }
        .ko-pron-row--clickable {
          cursor: pointer;
        }
        .ko-pron-row--clickable:hover {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
      `}</style>
    </div>
  );
}
