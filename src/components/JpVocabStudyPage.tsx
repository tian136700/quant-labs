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
import {
  computeJpVocabStudyPageQuizProgress,
  type JpVocabDailyQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
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
import { useJpVocabStudyPersonalLevels } from "@/hooks/useVocabStudyPersonalLevels";
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
import {
  JP_VOCAB_STUDY_POLL_HIDDEN_MS,
  JP_VOCAB_STUDY_POLL_MS,
  JP_VOCAB_STUDY_QUIZ_EVERY_N,
} from "@/lib/jp-vocab-sync";
import { useVocabStudySharedPoll } from "@/hooks/useVocabStudySharedPoll";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import { JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import {
  abortSignalAfter,
  VOCAB_STUDENT_PEEK_TIMEOUT_MS,
} from "@/lib/vocab-teacher-quiz-live-sync";
import type { JpVocabLevel, JpVocabRef, JpVocabSharedItem, JpVocabWord } from "@/lib/types";
import { JpVocabStudyPageTable } from "@/components/jp-vocab-study-page/JpVocabStudyPageTable";
import { JpVocabStudyPageStyles } from "@/components/jp-vocab-study-page/JpVocabStudyPageStyles";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

export function JpVocabStudyPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, canAccessJpVocabStudy, isAdmin, openAuthPanel } =
    useEtrAuth();
  const { personalLevels, setPersonalLevel } = useJpVocabStudyPersonalLevels(user?.id);
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
  /** API 只带回分母（今日抽查数量）；分子按下方 items 条数自算 */
  const [quizTargetTotal, setQuizTargetTotal] = useState<number>(() => {
    const cached = readJpVocabStudyCache()?.quiz_progress?.total;
    return cached != null && cached > 0 ? cached : 0;
  });
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
  const quizTargetTotalRef = useRef<number>(
    (() => {
      const cached = readJpVocabStudyCache()?.quiz_progress?.total;
      return cached != null && cached > 0 ? cached : 0;
    })()
  );

  const quizProgress = useMemo((): JpVocabDailyQuizProgress | null => {
    if (quizTargetTotal <= 0) return null;
    return computeJpVocabStudyPageQuizProgress(items.length, quizTargetTotal);
  }, [items.length, quizTargetTotal]);

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
      const total = quizTargetTotalRef.current;
      persistJpVocabStudyCache({
        items: nextItems,
        refs: cached?.refs ?? {},
        share_date: cached?.share_date || beijingDateString(),
        quiz_progress:
          total > 0
            ? computeJpVocabStudyPageQuizProgress(nextItems.length, total)
            : cached?.quiz_progress ?? null,
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

  const applyTeacherLiveWordId = useCallback((raw: unknown) => {
    // 跟 shared 轮询里的老师当前 live 词；老师切词后按钮可再点（勿只钉上次 peek）
    // undefined = 字段缺失（旧响应），保留本地；null = 老师当前无 live 词
    if (raw === undefined) return;
    if (raw === null) {
      setTeacherLiveWordId(null);
      return;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    setTeacherLiveWordId(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
  }, []);

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
    if (payload.quiz_progress && payload.quiz_progress.total > 0) {
      quizTargetTotalRef.current = payload.quiz_progress.total;
      setQuizTargetTotal(payload.quiz_progress.total);
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
        teacher_live_word_id?: number | null;
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
        setQuizTargetTotal(0);
        quizTargetTotalRef.current = 0;
        setTeacherLiveWordId(null);
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
      const targetTotal =
        data.quiz_progress && data.quiz_progress.total > 0
          ? data.quiz_progress.total
          : quizTargetTotalRef.current;
      const next: JpVocabStudyApiPayload = {
        items: data.items,
        refs: data.refs ?? {},
        share_date: data.share_date ?? beijingDateString(),
        quiz_progress:
          targetTotal > 0
            ? computeJpVocabStudyPageQuizProgress(data.items.length, targetTotal)
            : null,
      };
      applyStudyPayload(next);
      applyTeacherLiveWordId(data.teacher_live_word_id);
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
  }, [locale, canViewStudy, applyStudyPayload, applyTeacherLiveWordId]);

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

  /** 跨手机/电脑：同浏览器 BroadcastChannel 无效，须轻量轮询才能及时弹卡 */
  useVocabStudySharedPoll({
    enabled: canViewStudy && !checking && Boolean(user),
    username: user?.username,
    loadShared,
    activeMs: JP_VOCAB_STUDY_POLL_MS,
    hiddenMs: JP_VOCAB_STUDY_POLL_HIDDEN_MS,
  });

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
    quizProgress,
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
        signal: abortSignalAfter(VOCAB_STUDENT_PEEK_TIMEOUT_MS),
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
        setStatus(
          data.error ||
            "老师当前没有在抽查单词（或同步尚未完成），请过几秒再点一次。"
        );
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
        const total = quizTargetTotalRef.current;
        persistJpVocabStudyCache({
          items: nextItems,
          refs: mergedRefs,
          share_date: shareDate || beijingDateString(),
          quiz_progress:
            total > 0
              ? computeJpVocabStudyPageQuizProgress(nextItems.length, total)
              : null,
        });
        return nextItems;
      });
      hasLoadedOnceRef.current = true;
      setTeacherLiveWordId(data.item.word_id);
      setFlashcardItem(data.item);
      setStatus("已打开老师正在抽查的单词，并加入今日列表。");
    } catch (err) {
      const aborted =
        err instanceof DOMException
          ? err.name === "AbortError"
          : err instanceof Error && err.name === "AbortError";
      setStatus(
        aborted
          ? "获取超时，请再点一次「查看老师正在抽查的单词」。"
          : err instanceof Error
            ? err.message
            : "暂时无法查看，请稍后再试。"
      );
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
    // 学生自用覆盖（本机）；不写回老师抽查统计
    for (const [id, level] of Object.entries(personalLevels)) {
      out[Number(id)] = level;
    }
    return out;
  }, [items, flashcardItem, personalLevels]);

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

      <JpVocabStudyPageTable
        locale={locale}
        loading={loading}
        items={items}
        shareDate={shareDate}
        canViewStudy={canViewStudy}
        canOperate={canOperate}
        refs={refs}
        openRemarksWord={openRemarksWord}
        setEditingWord={setEditingWord}
        setEditingRemarksWord={setEditingRemarksWord}
        openRefPreview={openRefPreview}
        onViewCard={(item) => setFlashcardItem(item)}
      />

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
        onSelectLevel={(wordId, level) => setPersonalLevel(wordId, level)}
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
      <JpVocabStudyPageStyles />
    </main>
  );
}
