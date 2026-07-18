"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readApiJson, sanitizeApiClientError } from "@/lib/api-json";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  evaluateJpVocabDailyCompleteModal,
  markJpVocabStudyDailyCompleteDismissed,
  shouldShowJpVocabStudyDailyComplete,
  type JpVocabDailyCompleteSnapshot,
} from "@/lib/jp-vocab-daily-complete-dismiss";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import { resolveJpVocabSharedTeacherLevel } from "@/lib/jp-vocab-review";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { subscribeJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import {
  clearJpVocabStudyCache,
  JP_VOCAB_STUDY_REFRESH_TTL_MS,
  persistJpVocabStudyCache,
  readJpVocabStudyCache,
  readJpVocabStudyCacheAge,
  type JpVocabStudyApiPayload,
} from "@/lib/jp-vocab-study-cache";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import { JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import {
  JP_VOCAB_STUDY_POLL_HIDDEN_MS,
  JP_VOCAB_STUDY_POLL_MS,
  JP_VOCAB_STUDY_QUIZ_EVERY_N,
  JP_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS,
  JP_VOCAB_STUDY_QUIZ_LIVE_POLL_MS,
} from "@/lib/jp-vocab-sync";
import type { JpVocabLevel, JpVocabRef, JpVocabSharedItem, JpVocabWord } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const STAT_COLUMNS = [
  { key: "very", label: "非常熟悉", labelLines: ["非常", "熟悉"] as [string, string], className: "jp-vocab-stat-detail" },
  { key: "normal", label: "一般", className: "jp-vocab-stat-detail" },
  { key: "weak", label: "不熟悉", labelLines: ["不", "熟悉"] as [string, string], className: "jp-vocab-stat-detail" },
  { key: "total", label: "合计", className: "jp-vocab-stat-total" },
] as const;

const SHOW_REMARKS_COLUMN = true;

export function JpVocabStudyPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, canAccessJpVocabStudy, isAdmin, openAuthPanel } =
    useEtrAuth();
  const canOperate = canAccessJpVocab;
  const canViewStudy = canAccessJpVocabStudy;
  /** 学生与管理员可见；日语老师不可进复习页 */
  const showRequestTeacherShare =
    JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED &&
    Boolean(user) &&
    canViewStudy &&
    (!canOperate || isAdmin);
  /** 学生自行查看老师当前抽查词（不依赖发给学生 UI 开关） */
  const showPeekTeacherQuiz =
    Boolean(user) && canViewStudy && (!canOperate || isAdmin);
  const [items, setItems] = useState<JpVocabSharedItem[]>(
    () => readJpVocabStudyCache()?.items ?? []
  );
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(
    () => readJpVocabStudyCache()?.refs ?? {}
  );
  const [shareDate, setShareDate] = useState(
    () => readJpVocabStudyCache()?.share_date ?? ""
  );
  const [quizProgress, setQuizProgress] = useState<JpVocabDailyQuizProgress | null>(
    () => readJpVocabStudyCache()?.quiz_progress ?? null
  );
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const dailyCompleteSnapshotRef = useRef<JpVocabDailyCompleteSnapshot | null>(null);
  const [loading, setLoading] = useState(() => readJpVocabStudyCache() == null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  /** 有操作权限时「查看」也进可编辑备注（对齐老师端）；学生仍只读 */
  const openRemarksWord = useCallback(
    (word: JpVocabWord) => {
      if (canOperate) {
        setEditingRemarksWord(word);
      } else {
        setViewingRemarksWord(word);
      }
    },
    [canOperate]
  );
  const [flashcardItem, setFlashcardItem] = useState<JpVocabSharedItem | null>(null);
  const [saveQueuePending, setSaveQueuePending] = useState(0);
  const [requestingShare, setRequestingShare] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [teacherLiveWordId, setTeacherLiveWordId] = useState<number | null>(null);
  const [peekingTeacherQuiz, setPeekingTeacherQuiz] = useState(false);
  const pollInFlightRef = useRef(false);
  const requestCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);
  /** 老师新发词 / 同浏览器备注通知：弹卡；禁止 scrollIntoView */
  const pendingFlashcardWordIdRef = useRef<number | null>(null);
  const knownSharedWordIdsRef = useRef<Set<number>>(
    new Set((readJpVocabStudyCache()?.items ?? []).map((item) => item.word_id))
  );
  const pendingRefreshAfterSaveRef = useRef(false);
  const saveQueuePendingRef = useRef(0);
  const hasLoadedOnceRef = useRef(readJpVocabStudyCache() != null);
  const sharedPollCountRef = useRef(0);
  const quizProgressRef = useRef<JpVocabDailyQuizProgress | null>(
    readJpVocabStudyCache()?.quiz_progress ?? null
  );

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 今日日语单词",
      subtitle: JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED
        ? "登录后可查看老师共享的单词，或请求老师发送。"
        : "登录后可查看老师正在抽查的单词，以及老师发给你的词条。",
    });
  }, [openAuthPanel]);

  useEffect(() => {
    return jpVocabSaveQueue.subscribe((pending) => {
      saveQueuePendingRef.current = pending;
      setSaveQueuePending(pending);
    });
  }, []);

  const handleWordSaved = useCallback((word: JpVocabWord) => {
    setItems((prev) => {
      const nextItems = prev.map((item) =>
        item.word_id === word.id ? { ...item, word } : item
      );
      const cached = readJpVocabStudyCache();
      persistJpVocabStudyCache({
        items: nextItems,
        refs: cached?.refs ?? {},
        share_date: cached?.share_date || beijingDateString(),
        quiz_progress: quizProgressRef.current ?? cached?.quiz_progress ?? null,
      });
      return nextItems;
    });
    setFlashcardItem((prev) => {
      if (prev?.word_id !== word.id) return prev;
      return {
        ...prev,
        word,
        level: resolveJpVocabSharedTeacherLevel(word),
      };
    });
    setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
    setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
    setStatus("词条已保存。");
  }, []);

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: JpVocabWord, message: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.word_id === wordId ? { ...item, word: snapshot } : item
        )
      );
      setStatus(message);
    },
    []
  );

  const applyStudyPayload = useCallback((payload: JpVocabStudyApiPayload) => {
    const wasLoadedBefore = hasLoadedOnceRef.current;
    const newWordIds = payload.items.map((item) => item.word_id);
    // 老师勾选熟悉程度 / 发给学生 → 新词自动弹卡；首屏历史列表不弹
    if (wasLoadedBefore) {
      const brandNew = newWordIds.filter(
        (id) => !knownSharedWordIdsRef.current.has(id)
      );
      if (brandNew.length > 0 && pendingFlashcardWordIdRef.current == null) {
        pendingFlashcardWordIdRef.current = brandNew[brandNew.length - 1]!;
      }
    }
    knownSharedWordIdsRef.current = new Set(newWordIds);
    setItems(payload.items);
    setRefs(payload.refs ?? {});
    setShareDate(payload.share_date || beijingDateString());
    if (payload.quiz_progress) {
      quizProgressRef.current = payload.quiz_progress;
      setQuizProgress(payload.quiz_progress);
    }
    hasLoadedOnceRef.current = true;
  }, []);

  const loadShared = useCallback(async (opts?: { force?: boolean; includeQuiz?: boolean }) => {
    if (!canViewStudy) {
      setLoading(false);
      return;
    }
    if (saveQueuePendingRef.current > 0) {
      if (opts?.force) pendingRefreshAfterSaveRef.current = true;
      return;
    }
    if (pollInFlightRef.current) {
      if (opts?.force) pendingRefreshRef.current = true;
      return;
    }

    const includeQuiz =
      opts?.includeQuiz ??
      (!hasLoadedOnceRef.current ||
        sharedPollCountRef.current % JP_VOCAB_STUDY_QUIZ_EVERY_N === 0);

    const cached = readJpVocabStudyCache();
    const cacheAge = readJpVocabStudyCacheAge();
    const cacheFresh =
      !opts?.force &&
      cached != null &&
      cacheAge != null &&
      cacheAge < JP_VOCAB_STUDY_REFRESH_TTL_MS;

    if (cached) {
      applyStudyPayload(cached);
      setLoading(false);
      setError("");
    }

    // 本地仍新鲜且本次不需要抽查进度时，跳过 D1 请求
    if (cacheFresh && !includeQuiz) {
      sharedPollCountRef.current += 1;
      return;
    }

    pollInFlightRef.current = true;
    if (!cached) setLoading(true);
    try {
      sharedPollCountRef.current += 1;

      type SharedPayload = {
        ok: boolean;
        items?: JpVocabSharedItem[];
        refs?: Record<string, JpVocabRef>;
        share_date?: string;
        quiz_progress?: JpVocabDailyQuizProgress;
        error?: string;
      };

      const sharedUrl = includeQuiz
        ? "/api/jp-vocab/shared"
        : "/api/jp-vocab/shared?lite=1";

      const res = await fetch(sharedUrl, {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      });
      const parsed = await readApiJson<SharedPayload>(res);

      if (!parsed.ok) {
        if (!hasLoadedOnceRef.current) {
          setError(parsed.error);
        }
        return;
      }
      const { data, status } = parsed;
      if (status === 401) {
        clearJpVocabStudyCache();
        setItems([]);
        setRefs({});
        setShareDate(beijingDateString());
        setQuizProgress(null);
        quizProgressRef.current = null;
        hasLoadedOnceRef.current = false;
        setError("仅管理员或已授权学生可访问今日日语单词。");
        return;
      }
      if (!data.ok || !data.items) {
        if (!hasLoadedOnceRef.current) {
          throw new Error(data.error || "加载失败");
        }
        return;
      }
      const next: JpVocabStudyApiPayload = {
        items: data.items,
        refs: data.refs ?? {},
        share_date: data.share_date ?? beijingDateString(),
        quiz_progress: data.quiz_progress ?? quizProgressRef.current,
      };
      applyStudyPayload(next);
      persistJpVocabStudyCache(next);
      setError("");
    } catch (err) {
      if (!hasLoadedOnceRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        setError(sanitizeApiClientError(message));
      }
    } finally {
      setLoading(false);
      pollInFlightRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        void loadShared({ force: true });
      }
    }
  }, [locale, canViewStudy, applyStudyPayload]);

  useEffect(() => {
    if (saveQueuePending > 0) return;
    if (!pendingRefreshAfterSaveRef.current) return;
    pendingRefreshAfterSaveRef.current = false;
    void loadShared({ force: true });
  }, [saveQueuePending, loadShared]);

  useEffect(() => {
    if (checking) return;
    if (!canViewStudy) {
      setLoading(false);
      setItems([]);
      setRefs({});
      return;
    }
    void loadShared();
  }, [loadShared, canViewStudy, checking]);

  useEffect(() => {
    if (!canViewStudy) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      timer = setTimeout(() => {
        if (saveQueuePendingRef.current > 0) {
          schedule();
          return;
        }
        void loadShared().finally(schedule);
      }, hidden ? JP_VOCAB_STUDY_POLL_HIDDEN_MS : JP_VOCAB_STUDY_POLL_MS);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadShared, canViewStudy]);

  useEffect(() => {
    if (!canViewStudy) return;
    return subscribeJpVocabSharedUpdated((detail) => {
      if (detail.wordId && detail.openRemarks) {
        pendingFlashcardWordIdRef.current = detail.wordId;
      }
      if (saveQueuePendingRef.current > 0) {
        pendingRefreshAfterSaveRef.current = true;
      } else {
        void loadShared({ force: true });
      }
    });
  }, [loadShared, canViewStudy]);

  useEffect(() => {
    const wordId = pendingFlashcardWordIdRef.current;
    if (!wordId || items.length === 0) return;
    const entry = items.find((item) => item.word_id === wordId);
    if (!entry) return;

    pendingFlashcardWordIdRef.current = null;
    // 弹卡即可；禁止 scrollIntoView（会把用户拽到列表底部）
    setFlashcardItem(entry);
  }, [items]);

  useEffect(() => {
    if (!canViewStudy) return;
    const onVisible = () => {
      if (!document.hidden) void loadShared({ force: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadShared, canViewStudy]);

  useEffect(() => {
    if (!canViewStudy || !user || !quizProgress || quizProgress.total <= 0) return;

    const { nextSnapshot, open } = evaluateJpVocabDailyCompleteModal({
      ready: !loading && !checking && hasLoadedOnceRef.current,
      userId: user.id,
      progress: quizProgress,
      prevSnapshot: dailyCompleteSnapshotRef.current,
      shouldShow: shouldShowJpVocabStudyDailyComplete,
    });
    dailyCompleteSnapshotRef.current = nextSnapshot;
    if (open) setShowDailyComplete(true);
  }, [
    loading,
    checking,
    canViewStudy,
    user?.id,
    quizProgress?.complete,
    quizProgress?.total,
  ]);

  useEffect(() => {
    if (!requestSent) return;
    requestCooldownTimerRef.current = setTimeout(() => {
      setRequestSent(false);
    }, 10_000);
    return () => {
      if (requestCooldownTimerRef.current) {
        clearTimeout(requestCooldownTimerRef.current);
        requestCooldownTimerRef.current = null;
      }
    };
  }, [requestSent]);

  const teacherLiveWordShared =
    teacherLiveWordId != null &&
    items.some((item) => item.word_id === teacherLiveWordId);

  useEffect(() => {
    // peek /「请老师发送」都要知道当前 live 词：已在共享列表则按钮变灰，避免再弹一次
    if (!showPeekTeacherQuiz && !showRequestTeacherShare) {
      setTeacherLiveWordId(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      typeof document !== "undefined" && document.hidden
        ? JP_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS
        : JP_VOCAB_STUDY_QUIZ_LIVE_POLL_MS;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/jp-vocab/teacher-quiz-live?scope=study", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          live?: { word_id?: number | null };
        };
        if (!cancelled && data.ok) {
          const id = Number(data.live?.word_id);
          setTeacherLiveWordId(Number.isFinite(id) && id > 0 ? Math.floor(id) : null);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) schedule(pollDelay());
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showPeekTeacherQuiz, showRequestTeacherShare]);

  const requestTeacherShare = useCallback(async () => {
    if (!user || !showRequestTeacherShare || requestingShare) return;
    setRequestingShare(true);
    try {
      const res = await fetch("/api/jp-vocab/share-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
      });
      const parsed = await readApiJson<{ ok: boolean; error?: string }>(res);
      if (!parsed.ok) {
        setStatus(parsed.error || "请求失败，请稍后再试。");
        return;
      }
      const { data, status } = parsed;
      if (status === 401) {
        openJpAuth();
        return;
      }
      if (!data.ok) {
        setStatus(data.error || "请求失败，请稍后再试。");
        return;
      }
      setRequestSent(true);
      setStatus("已发送，请稍候老师共享。");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "请求失败，请稍后再试。");
    } finally {
      setRequestingShare(false);
    }
  }, [user, showRequestTeacherShare, requestingShare, locale, openJpAuth]);

  const peekTeacherQuizWord = useCallback(async () => {
    if (!user || !showPeekTeacherQuiz || peekingTeacherQuiz) return;
    if (teacherLiveWordShared) {
      setStatus("老师已发送正在抽查的单词，请看弹出的卡片或下方列表。");
      return;
    }
    setPeekingTeacherQuiz(true);
    try {
      const res = await fetch("/api/jp-vocab/teacher-quiz-live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
      });
      const parsed = await readApiJson<{
        ok: boolean;
        error?: string;
        item?: JpVocabSharedItem;
        refs?: Record<string, JpVocabRef>;
      }>(res);
      if (!parsed.ok) {
        setStatus(parsed.error || "暂时无法查看，请稍后再试。");
        return;
      }
      const { data, status } = parsed;
      if (status === 401) {
        openJpAuth();
        return;
      }
      if (!data.ok || !data.item) {
        setStatus(data.error || "老师当前没有在抽查单词，请稍后再试。");
        return;
      }
      if (data.refs) {
        setRefs((prev) => ({ ...prev, ...data.refs }));
      }
      knownSharedWordIdsRef.current.add(data.item.word_id);
      setItems((prev) => {
        const next = data.item!;
        let nextItems: JpVocabSharedItem[];
        const existingIndex = prev.findIndex((item) => item.word_id === next.word_id);
        if (existingIndex >= 0) {
          nextItems = [...prev];
          nextItems[existingIndex] = next;
        } else {
          nextItems = [next, ...prev];
        }
        const mergedRefs = data.refs ? { ...refs, ...data.refs } : refs;
        persistJpVocabStudyCache({
          items: nextItems,
          refs: mergedRefs,
          share_date: shareDate || beijingDateString(),
          quiz_progress: quizProgressRef.current,
        });
        return nextItems;
      });
      hasLoadedOnceRef.current = true;
      setFlashcardItem(data.item);
      setStatus("已打开老师正在抽查的单词，并加入今日列表。");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "暂时无法查看，请稍后再试。");
    } finally {
      setPeekingTeacherQuiz(false);
    }
  }, [
    user,
    showPeekTeacherQuiz,
    peekingTeacherQuiz,
    teacherLiveWordShared,
    locale,
    openJpAuth,
    refs,
    shareDate,
  ]);

  const loggedIn = Boolean(user);
  const accessDenied = loggedIn && !checking && !canViewStudy;

  const studyFlashcardSession = useMemo<JpVocabTeacherQuizSession | null>(() => {
    if (!flashcardItem) return null;
    return {
      mode: "sequential",
      wordIds: [flashcardItem.word_id],
      currentIndex: 0,
    };
  }, [flashcardItem]);

  const studyWordsById = useMemo(() => {
    const map = new Map<number, JpVocabWord>();
    for (const item of items) {
      map.set(item.word_id, item.word);
    }
    if (flashcardItem) {
      map.set(flashcardItem.word_id, flashcardItem.word);
    }
    return map;
  }, [items, flashcardItem]);

  const studyDisplayOrder = useMemo<JpVocabDailyDisplayOrder>(
    () => ({
      date: shareDate || beijingDateString(),
      ids: items.map((item) => item.word_id),
    }),
    [shareDate, items]
  );

  const studySessionLevel = useMemo(() => {
    const out: Record<number, JpVocabLevel | undefined> = {};
    for (const item of items) {
      const level = resolveJpVocabSharedTeacherLevel(item.word);
      if (level) out[item.word_id] = level;
    }
    if (flashcardItem) {
      const level = resolveJpVocabSharedTeacherLevel(flashcardItem.word);
      if (level) out[flashcardItem.word_id] = level;
    }
    return out;
  }, [items, flashcardItem]);

  const studyDailySeqByWordId = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item, index) => {
      map.set(item.word_id, index + 1);
    });
    return map;
  }, [items]);

  const openRefPreview = (refKey: string, ref?: JpVocabRef) => {
    const meta = resolveJpVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({ ref: meta, cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at });
  };

  return (
    <main
      className="page-wrap jp-vocab-page jp-vocab-study-page"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>今日日语单词</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        没听清时可点「查看老师正在抽查的单词」立刻查看；老师也可主动「发给学生」。列表供课后复习，每日北京时间 0 点自动清空。
      </p>

      {showPeekTeacherQuiz ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: showRequestTeacherShare ? "0.5rem" : "1rem",
          }}
        >
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            disabled={peekingTeacherQuiz || teacherLiveWordShared}
            title={
              teacherLiveWordShared
                ? "老师已发送正在抽查的单词，请看下方弹出的卡片或列表"
                : undefined
            }
            onClick={() => void peekTeacherQuizWord()}
          >
            {peekingTeacherQuiz
              ? "加载中…"
              : teacherLiveWordShared
                ? "老师已发送"
                : "查看老师正在抽查的单词"}
          </button>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            {teacherLiveWordShared
              ? "老师已勾选并发送，无需再点查看。"
              : "没听清时，可立即查看老师当前正在抽问的单词。"}
          </span>
        </div>
      ) : null}

      {showRequestTeacherShare ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            disabled={requestingShare || requestSent || teacherLiveWordShared}
            onClick={() => void requestTeacherShare()}
          >
            {requestingShare
              ? "发送中…"
              : teacherLiveWordShared
                ? "老师已发送"
                : requestSent
                  ? "已发送"
                  : "请老师发送"}
          </button>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            {teacherLiveWordShared
              ? "老师已发送正在抽查的单词，无需重复请求。"
              : "没听清时，可请老师发送正在抽查的单词/语法。"}
          </span>
        </div>
      ) : null}

      {!loggedIn && !checking ? (
        <p
          className="hint"
          role="note"
          style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.85rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--panel)",
            fontSize: "0.875rem",
          }}
        >
          请{" "}
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={openJpAuth}
            style={{ display: "inline", padding: "0.1rem 0.35rem" }}
          >
            登录
          </button>
          {" "}后查看今日共享单词。
        </p>
      ) : null}

      {accessDenied ? (
        <p
          className="empty"
          role="alert"
          style={{ color: "var(--rise)", marginBottom: "1rem" }}
        >
          当前账号无权访问今日日语单词，请联系老师或管理员开通权限。
        </p>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {status ? (
        <p className="hint" role="status" style={{ marginBottom: "0.75rem", fontSize: "0.875rem" }}>
          {status}
        </p>
      ) : null}

      {saveQueuePending > 0 ? (
        <p
          className="hint"
          role="status"
          style={{ marginBottom: "0.75rem", fontSize: "0.8125rem", color: "var(--muted)" }}
        >
          保存队列 {saveQueuePending} 项 · 界面已先更新，后台逐项写入数据库
        </p>
      ) : null}

      {canViewStudy && quizProgress && quizProgress.total > 0 ? (
        <JpVocabDailyQuizProgressBar progress={quizProgress} variant="study" />
      ) : null}

      <section className="section etr-panel" aria-label="今日共享单词">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>共享单词</h2>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            {shareDate ? `${shareDate} · ` : ""}
            共 {items.length} 条
          </span>
        </div>

        {loading && canViewStudy ? (
          <p className="empty">加载中…</p>
        ) : !canViewStudy ? null : items.length === 0 ? (
          <p className="empty">今日暂无共享单词。</p>
        ) : (
          <div className="jp-vocab-table-wrap">
            <p className="jp-vocab-scroll-hint" aria-hidden="true">
              表格较宽时可左右滑动查看
            </p>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="jp-vocab-seq-col">
                    序号
                  </th>
                  <th rowSpan={2} className="jp-vocab-kind-col">
                    类型
                  </th>
                  <th rowSpan={2} className="jp-vocab-word-col">
                    单词 / 语法
                  </th>
                  <th rowSpan={2} className="jp-vocab-reading-col">
                    读音
                  </th>
                  <th rowSpan={2} className="jp-vocab-meaning-col">
                    释义
                  </th>
                  <th rowSpan={2} className="jp-vocab-pos-col">
                    词性
                  </th>
                  <th rowSpan={2} className="jp-vocab-risk-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>抽查</span>
                      <span>优先级</span>
                    </span>
                  </th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>熟悉程度</span>
                      <span className="jp-vocab-th-multiline__sub">(老师勾选)</span>
                    </span>
                  </th>
                  <th colSpan={4} className="jp-vocab-stats-group">
                    复习次数统计
                  </th>
                  <th rowSpan={2} className="jp-vocab-today-check-col" title="今日抽查次数">
                    <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                      <span>今日</span>
                      <span>抽查次数</span>
                    </span>
                  </th>
                  {SHOW_REMARKS_COLUMN ? (
                    <th rowSpan={2} className="jp-vocab-notes-col">
                      备注
                    </th>
                  ) : null}
                  <th rowSpan={2} className="jp-vocab-action-col">
                    操作
                  </th>
                </tr>
                <tr>
                  {STAT_COLUMNS.map((col) => (
                    <th key={col.key} className={col.className}>
                      {"labelLines" in col && col.labelLines ? (
                        <span className="jp-vocab-th-multiline jp-vocab-th-multiline--compact">
                          <span>{col.labelLines[0]}</span>
                          <span>{col.labelLines[1]}</span>
                        </span>
                      ) : (
                        <span>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const w = item.word;
                  const ref = w.ref_key ? refs[w.ref_key] : undefined;
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const selected = resolveJpVocabSharedTeacherLevel(w);
                  const risk = jpVocabRiskIndex(w);
                  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );
                  const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
                  const renderNotesActions = () => (
                    <div className="jp-vocab-notes-actions">
                      {hasNotes ? (
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-notes-view-btn"
                          title={canOperate ? "查看并编辑备注" : "查看备注"}
                          onClick={() => openRemarksWord(w)}
                        >
                          查看
                        </button>
                      ) : null}
                      {canOperate ? (
                        <JpEditIconButton
                          title="编辑备注"
                          className="jp-vocab-notes-edit-btn"
                          onClick={() => setEditingRemarksWord(w)}
                        />
                      ) : null}
                    </div>
                  );

                  return (
                    <tr key={item.id} id={`jp-vocab-study-row-${w.id}`}>
                      <td className="jp-vocab-seq-col" data-label="序号">
                        <span className="jp-vocab-seq-cell">
                          <span className="jp-vocab-seq-num">{index + 1}</span>
                        </span>
                      </td>
                      <td className="jp-vocab-kind-col" data-label="类型">
                        <span
                          className={`jp-vocab-kind-badge${
                            w.kind === "grammar" ? " jp-vocab-kind-badge--grammar" : ""
                          }`}
                        >
                          {w.kind === "grammar" ? "语法" : "单词"}
                        </span>
                      </td>
                      <td className="jp-vocab-word-col" data-label="单词 / 语法">
                        <div className="jp-vocab-word-cell">
                          {w.ref_key ? (
                            <>
                              <button
                                type="button"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                {w.word}
                              </button>
                              <span className="jp-vocab-ref-hint">（点击查看教案）</span>
                            </>
                          ) : (
                            <span className="jp-vocab-word-text">{w.word}</span>
                          )}
                        </div>
                        <div className="jp-vocab-mobile-reading-row jp-vocab-mobile-only">
                          {w.kind === "word" ? (
                            readingTrim ? (
                              <span className="jp-vocab-reading-text">{readingTrim}</span>
                            ) : (
                              <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                                待补全
                              </span>
                            )
                          ) : readingTrim ? (
                            <span className="jp-vocab-reading-text">{readingTrim}</span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim && w.kind !== "word" ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                      >
                        <div className="jp-vocab-reading-cell">
                          {readingTrim ? (
                            <span className="jp-vocab-reading-text">{readingTrim}</span>
                          ) : w.kind === "word" ? (
                            <span className="jp-vocab-reading-text jp-vocab-reading-text--pending">
                              待补全
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-meaning-col${
                          !meaningTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="释义"
                        style={{ color: "var(--muted)" }}
                      >
                        {meaningTrim ? (
                          <div className="jp-vocab-meaning-cell">
                            <span className="jp-vocab-meaning-desktop">{meaningTrim}</span>
                            <details className="jp-vocab-meaning-fold jp-vocab-mobile-only">
                              <summary className="jp-vocab-meaning-fold__summary">
                                <span className="jp-vocab-fold-label">释义</span>
                                <span className="jp-vocab-meaning-preview">{meaningTrim}</span>
                              </summary>
                              <p className="jp-vocab-meaning-full">{meaningTrim}</p>
                            </details>
                            <JpVocabSourceLabel
                              source={w.meaning_source}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${!posTrim ? " jp-vocab-field-empty" : ""}`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim ? (
                          <span className="jp-vocab-pos-badge">{posTrim}</span>
                        ) : null}
                      </td>
                      <td className="jp-vocab-risk-col" data-label="优先级">
                        <span
                          className={`jp-vocab-risk-value jp-vocab-risk-badge jp-vocab-risk-badge--${riskBadgeTier}`}
                        >
                          {risk.toFixed(1)}
                        </span>
                      </td>
                      <td className="jp-vocab-level-col" data-label="熟悉程度">
                        <div
                          className="jp-vocab-levels"
                          role="group"
                          aria-label={`${w.word} 熟悉程度`}
                        >
                          {LEVELS.map((lv) => {
                            const checked = selected === lv.key;
                            return (
                              <span
                                key={lv.key}
                                className={`jp-vocab-level-opt${
                                  checked ? " is-checked" : ""
                                } jp-vocab-level-opt--readonly${
                                  lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                }${lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""}`}
                                aria-pressed={checked}
                              >
                                <span className="jp-vocab-check-box" aria-hidden="true">
                                  {checked ? (
                                    <svg viewBox="0 0 12 12" width="10" height="10">
                                      <path
                                        d="M2 6l3 3 5-5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  ) : null}
                                </span>
                                <span>{lv.label}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="jp-vocab-stat-detail chg-dn" data-label="非常熟悉">
                        {w.cnt_very}
                      </td>
                      <td className="jp-vocab-stat-detail" data-label="一般">
                        {w.cnt_normal}
                      </td>
                      <td className="jp-vocab-stat-detail chg-up" data-label="不熟悉">
                        {w.cnt_weak}
                      </td>
                      <td className="jp-vocab-stat-total" data-label="复习合计">
                        {(() => {
                          const totalDisplay = formatJpVocabTotalReviewsDisplay(w, locale);
                          if (totalDisplay.isZero) {
                            return (
                              <span
                                className="jp-vocab-total-never"
                                title={jpVocabTotalReviewsZeroHint(locale)}
                              >
                                {totalDisplay.label}
                              </span>
                            );
                          }
                          return totalDisplay.label;
                        })()}
                      </td>
                      <td className="jp-vocab-today-check-col" data-label="今日抽查次数">
                        <span
                          className={`jp-vocab-today-check-value${
                            todayChecks > 0 ? " jp-vocab-today-check-value--active" : ""
                          }`}
                          title={todayChecks > 0 ? `今日已抽查 ${todayChecks} 次` : "今日尚未抽查"}
                        >
                          {todayChecks}
                        </span>
                      </td>
                      {SHOW_REMARKS_COLUMN ? (
                        <td
                          className={`jp-vocab-notes-col${
                            !hasNotes && !canOperate ? " jp-vocab-field-empty" : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-desktop">{renderNotesActions()}</div>
                          <details className="jp-vocab-notes-fold jp-vocab-mobile-only">
                            <summary className="jp-vocab-notes-fold__summary">
                              <span className="jp-vocab-fold-label">备注</span>
                              <span className="jp-vocab-notes-fold__hint">
                                {hasNotes ? "查看 ›" : canOperate ? "编辑 ›" : "—"}
                              </span>
                            </summary>
                            {renderNotesActions()}
                          </details>
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${
                          !canOperate && !w.ref_key ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="操作"
                      >
                        {canOperate || w.ref_key ? (
                          <div className="jp-vocab-action-buttons">
                            {w.ref_key ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn jp-vocab-mobile-action-btn--full jp-vocab-mobile-only"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                                onClick={() => openRefPreview(w.ref_key!, ref)}
                              >
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                  <path
                                    d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v7A2.5 2.5 0 0 1 13.5 16h-7A2.5 2.5 0 0 1 4 13.5v-7Z"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  />
                                  <path
                                    d="M8 10.5l1.5 1.5L12.5 9"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                查看教案
                              </button>
                            ) : null}
                            {canOperate ? (
                              <div className="jp-vocab-action-row">
                                <button
                                  type="button"
                                  className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-mobile-action-btn"
                                  onClick={() => setEditingWord(w)}
                                >
                                  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                                    <path
                                      d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5Z"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                  编辑
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {user && quizProgress ? (
        <JpVocabDailyQuizCompleteModal
          open={showDailyComplete}
          total={quizProgress.total}
          variant="study"
          onClose={() => {
            markJpVocabStudyDailyCompleteDismissed(user.id, quizProgress.total);
            setShowDailyComplete(false);
          }}
        />
      ) : null}

      <JpVocabTeacherQuizFlashcardModal
        open={flashcardItem != null}
        mode="study"
        session={studyFlashcardSession}
        wordsById={studyWordsById}
        refs={refs}
        locale={locale}
        displayOrder={studyDisplayOrder}
        sessionLevel={studySessionLevel}
        reviewLockedByWordId={{}}
        savingWordId={null}
        dailySeqByWordId={studyDailySeqByWordId}
        canOperate={canOperate}
        shareUiEnabled={false}
        onClose={() => setFlashcardItem(null)}
        onComplete={() => setFlashcardItem(null)}
        onSelectLevel={() => {}}
        onNavigate={() => {}}
        onOpenRef={openRefPreview}
        onViewRemarks={openRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onEditWord={canOperate ? setEditingWord : undefined}
        onWordUpdated={handleWordSaved}
        nestedModalOpen={
          editingWord != null ||
          editingRemarksWord != null ||
          viewingRemarksWord != null ||
          previewRef != null
        }
      />

      <JpVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        canDelete={canOperate}
        onClose={() => setViewingRemarksWord(null)}
        onWordUpdated={(word) => {
          setItems((prev) =>
            prev.map((item) =>
              item.word_id === word.id ? { ...item, word } : item
            )
          );
          setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
        }}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <JpClassNotesEditModal
        open={editingRemarksWord != null}
        word={editingRemarksWord}
        locale={locale}
        canEdit={canOperate}
        sharedToday
        onClose={() => setEditingRemarksWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <JpVocabEditModal
        open={editingWord != null}
        word={editingWord}
        refs={refs}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onRefUpdated={(ref) => {
          setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
        }}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <style jsx global>{`
        .jp-vocab-study-page .jp-vocab-scroll-hint {
          margin: 0 0 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .jp-vocab-study-page .jp-vocab-mobile-only {
          display: none;
        }
        .jp-vocab-study-page .jp-vocab-notes-fold {
          display: none;
        }
        @media (min-width: 768px) {
          .jp-vocab-study-page .jp-vocab-levels {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.35rem 0.5rem;
          }
          .jp-vocab-study-page .jp-vocab-level-opt {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.8125rem;
            white-space: nowrap;
            padding: 0.35rem 0.5rem;
            border-radius: 6px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--text);
            line-height: 1.3;
            min-height: 2rem;
          }
          .jp-vocab-study-page .jp-vocab-table {
            min-width: 1180px;
          }
          .jp-vocab-study-page .jp-vocab-word-cell {
            align-items: center;
            text-align: center;
          }
        }
        .jp-vocab-study-page .jp-vocab-level-opt--readonly {
          cursor: default;
        }
        .jp-vocab-study-page .jp-vocab-check-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1rem;
          height: 1rem;
          flex-shrink: 0;
          border: 1.5px solid var(--border);
          border-radius: 3px;
          background: var(--bg);
          color: var(--accent);
        }
        .jp-vocab-study-page .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-study-page .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .jp-vocab-study-page .jp-vocab-kind-badge {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
          white-space: nowrap;
        }
        .jp-vocab-study-page .jp-vocab-kind-badge--grammar {
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
          color: var(--accent);
        }
        .jp-vocab-study-page .jp-vocab-word-link {
          font-weight: 500;
          color: var(--accent);
          text-decoration: underline;
          text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);
          text-underline-offset: 2px;
          border: none;
          background: transparent;
          padding: 0;
          font: inherit;
          cursor: pointer;
        }
        .jp-vocab-study-page .jp-vocab-word-link:hover {
          text-decoration: underline;
        }
        .jp-vocab-study-page .jp-vocab-word-text {
          font-weight: 500;
        }
        .jp-vocab-study-page .jp-vocab-word-cell {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }
        .jp-vocab-study-page .jp-vocab-ref-hint {
          display: block;
          margin-top: 0.2rem;
          font-size: 0.75rem;
          color: var(--muted);
          text-align: center;
        }
        .jp-vocab-study-page .jp-vocab-table-wrap {
          display: block;
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .jp-vocab-study-page .jp-vocab-table {
          width: 100%;
        }
        .jp-vocab-study-page .jp-vocab-notes-actions,
        .jp-vocab-study-page .jp-vocab-action-buttons {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .jp-vocab-study-page .jp-vocab-table th,
        .jp-vocab-study-page .jp-vocab-table td {
          white-space: normal;
          vertical-align: middle;
          padding: 0.5rem 0.55rem;
          text-align: center;
        }
        .jp-vocab-study-page .jp-vocab-th-multiline {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
          line-height: 1.2;
        }
        .jp-vocab-study-page .jp-vocab-th-multiline__sub {
          font-size: 0.8125em;
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-risk-value {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--high {
          color: var(--rise);
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--mid {
          color: var(--accent);
        }
        .jp-vocab-study-page .jp-vocab-risk-badge--low {
          color: var(--fall);
        }
        .jp-vocab-study-page .jp-vocab-stat-detail,
        .jp-vocab-study-page .jp-vocab-stat-total {
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-total-never {
          color: var(--muted);
          font-size: 0.8125rem;
        }
        .jp-vocab-study-page .jp-vocab-today-check-value {
          font-variant-numeric: tabular-nums;
        }
        .jp-vocab-study-page .jp-vocab-today-check-value--active {
          color: var(--accent);
          font-weight: 700;
        }
      `}</style>
    </main>
  );
}
