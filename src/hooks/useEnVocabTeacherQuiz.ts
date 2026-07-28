"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_VOCAB_POLL_HIDDEN_MS,
  EN_VOCAB_QUIZ_LIVE_POLL_MS,
} from "@/lib/en-vocab-sync";
import { resolveVocabPollIntervalMs, isVocabTeacherAccountActiveForRefresh } from "@/lib/vocab-poll-throttle";
import {
  putVocabTeacherQuizLiveWord,
  VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS,
} from "@/lib/vocab-teacher-quiz-live-sync";
import {
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS,
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS,
} from "@/lib/vocab-teacher-quiz-sync-poll";
import { effectiveEnVocabDisplayLevel } from "@/lib/en-vocab-review";
import type { EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  computeEnVocabDailyQuizProgress,
  type EnVocabDailyQuizProgress,
} from "@/lib/en-vocab-daily-quiz-progress";
import {
  createEnVocabTeacherQuizSession,
  expandEnVocabTeacherQuizSessionForTarget,
  filterEnVocabTeacherQuizUncheckedWords,
  findFirstUncheckedEnVocabTeacherQuizIndex,
  isEnVocabTeacherQuizSessionComplete,
  pickRandomEnVocabTeacherQuizMode,
  reconcileEnVocabTeacherQuizSession,
  resolveEnVocabTeacherQuizRefreshResumeIndex,
  resolveEnVocabTeacherQuizResumeIndex,
  type EnVocabTeacherQuizMode,
  type EnVocabTeacherQuizSession,
} from "@/lib/en-vocab-teacher-quiz";
import {
  clearEnVocabTeacherQuizSession,
  readEnVocabTeacherQuizSession,
  writeEnVocabTeacherQuizSession,
} from "@/lib/en-vocab-teacher-quiz-storage";
import { shouldShowEnVocabTeacherQuizIntro } from "@/components/EnVocabTeacherQuizIntroModal";
import type { EnVocabLevel, EnVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

type AuthUser = { id: number; username?: string; disabled?: number | boolean | null };

export function useEnVocabTeacherQuiz(options: {
  locale: Locale;
  user: AuthUser | null;
  checking: boolean;
  loading: boolean;
  canOperate: boolean;
  isAdminMode: boolean;
  words: EnVocabWord[];
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  sessionReviewAt: Record<number, number>;
  displayOrder: EnVocabDailyDisplayOrder;
  quizTarget: number;
  quizTargetWords: EnVocabWord[];
  quizTargetWordIds: Set<number>;
  dailySeqByWordId: Map<number, number>;
  dailyQuizProgress: EnVocabDailyQuizProgress;
  /** 开卡后半小时无勾选 → live 轮询降频 */
  teacherQuizIdleRef?: MutableRefObject<boolean>;
  teacherQuizPollIdle?: boolean;
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setStatus: (message: string) => void;
  /** 本轮会话真正抽完（卡片关闭前）→ 弹出完成提示 */
  onTeacherQuizSessionFinished?: () => void;
}) {
  const {
    locale,
    user,
    checking,
    loading,
    canOperate,
    isAdminMode,
    words,
    sessionLevel,
    sessionReviewAt,
    displayOrder,
    quizTarget,
    quizTargetWords,
    quizTargetWordIds,
    dailySeqByWordId,
    dailyQuizProgress,
    teacherQuizIdleRef,
    teacherQuizPollIdle = false,
    setSharedTodayWordIds,
    setStatus,
    onTeacherQuizSessionFinished,
  } = options;

  const usernameRef = useRef(user?.username);
  usernameRef.current = user?.username;

  const [quizSession, setQuizSession] = useState<EnVocabTeacherQuizSession | null>(
    null
  );
  const [showQuizFlashcard, setShowQuizFlashcard] = useState(false);
  const [studentPeekedCurrentWord, setStudentPeekedCurrentWord] = useState(false);
  const [showTeacherQuizIntro, setShowTeacherQuizIntro] = useState(false);
  const [pendingTeacherQuizSession, setPendingTeacherQuizSession] =
    useState<EnVocabTeacherQuizSession | null>(null);
  const [quizCardPreviewWordId, setQuizCardPreviewWordId] = useState<
    number | null
  >(null);

  /** 已成功写入 D1 的 live word_id；失败时保持 undefined 以便重试 */
  const teacherQuizLiveSyncedIdRef = useRef<number | null | undefined>(undefined);
  const liveSyncGenRef = useRef(0);
  const liveSyncRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const quizSessionRestoredRef = useRef(false);

  const wordsById = useMemo(
    () => new Map(words.map((w) => [w.id, w])),
    [words]
  );

  const quizWordHasLevel = useCallback(
    (wordId: number) => {
      const w = words.find((item) => item.id === wordId);
      if (!w) return false;
      return (
        effectiveEnVocabDisplayLevel(w, sessionLevel[wordId], { displayOrder }) !=
        null
      );
    },
    [words, sessionLevel, displayOrder]
  );

  const persistQuizSession = useCallback(
    (session: EnVocabTeacherQuizSession | null) => {
      if (!user?.id) return;
      // 只写不主动清：mount 时 session=null 若 clear 会丢掉待恢复的抽查会话，
      // 刷新后只能重开第 0 张，「上一个」变灰。结束抽查请显式 clearEnVocabTeacherQuizSession。
      if (!session) return;
      writeEnVocabTeacherQuizSession(user.id, quizTarget, session);
    },
    [user?.id, quizTarget]
  );

  useEffect(() => {
    if (!user?.id || quizTarget <= 0 || loading || checking) return;
    if (quizSessionRestoredRef.current) return;
    // 词表未就绪时不要标记已恢复，否则永远不会读回 localStorage
    if (quizTargetWords.length === 0) return;

    quizSessionRestoredRef.current = true;
    const stored = readEnVocabTeacherQuizSession(user.id, quizTarget);
    if (!stored) return;

    const reconciled = reconcileEnVocabTeacherQuizSession(stored, quizTargetWordIds);
    if (!reconciled) {
      clearEnVocabTeacherQuizSession(user.id);
      return;
    }

    const expanded = expandEnVocabTeacherQuizSessionForTarget(
      reconciled,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );

    if (
      !expanded ||
      isEnVocabTeacherQuizSessionComplete(expanded, quizWordHasLevel) ||
      computeEnVocabDailyQuizProgress(words, quizTarget).complete
    ) {
      clearEnVocabTeacherQuizSession(user.id);
      setQuizSession(null);
      setShowQuizFlashcard(false);
      return;
    }

    if (canOperate && !isAdminMode) {
      // 按离开时那一词的 id 定位（保留完整队列，已勾选词仍在前面 →「上一个」可用）
      const savedWordId =
        reconciled.wordIds[
          Math.max(
            0,
            Math.min(reconciled.currentIndex, reconciled.wordIds.length - 1)
          )
        ];
      const resumeIndex = resolveEnVocabTeacherQuizResumeIndex(
        expanded,
        savedWordId,
        quizWordHasLevel
      );
      const session = { ...expanded, currentIndex: resumeIndex };
      setQuizSession(session);
      return;
    }

    setQuizSession(expanded);
  }, [
    user?.id,
    quizTarget,
    loading,
    checking,
    quizTargetWords,
    quizTargetWordIds,
    canOperate,
    isAdminMode,
    words,
    sessionReviewAt,
    quizWordHasLevel,
    dailySeqByWordId,
    wordsById,
  ]);

  useEffect(() => {
    persistQuizSession(quizSession);
  }, [quizSession, persistQuizSession]);

  useEffect(() => {
    if (!quizSession || quizTargetWords.length === 0) return;
    const sessionSet = new Set(quizSession.wordIds);
    const hasNewUnchecked = filterEnVocabTeacherQuizUncheckedWords(
      quizTargetWords,
      quizWordHasLevel
    ).some((w) => !sessionSet.has(w.id));
    if (!hasNewUnchecked) return;
    setQuizSession((prev) => {
      if (!prev) return prev;
      const next = expandEnVocabTeacherQuizSessionForTarget(
        prev,
        quizTargetWords,
        dailySeqByWordId,
        quizWordHasLevel
      );
      if (!next) return null;
      if (
        next.mode === prev.mode &&
        next.currentIndex === prev.currentIndex &&
        next.wordIds.length === prev.wordIds.length &&
        next.wordIds.every((id, i) => id === prev.wordIds[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [quizTarget, quizTargetWords, dailySeqByWordId, quizWordHasLevel, quizSession]);

  const quizCardPreviewSession = useMemo((): EnVocabTeacherQuizSession | null => {
    if (quizCardPreviewWordId == null) return null;
    if (!wordsById.has(quizCardPreviewWordId)) return null;
    return {
      mode: "sequential",
      wordIds: [quizCardPreviewWordId],
      currentIndex: 0,
    };
  }, [quizCardPreviewWordId, wordsById]);

  const closeQuizCardPreview = useCallback(() => {
    setQuizCardPreviewWordId(null);
  }, []);

  const launchTeacherQuizSession = useCallback((session: EnVocabTeacherQuizSession) => {
    setQuizSession(session);
    setShowQuizFlashcard(true);
  }, []);

  const requestTeacherQuizSession = useCallback(
    (mode: EnVocabTeacherQuizMode, startWordId?: number) => {
      const next = createEnVocabTeacherQuizSession(
        mode,
        quizTargetWords,
        dailySeqByWordId,
        startWordId,
        quizWordHasLevel
      );
      if (!next) {
        setStatus(
          quizTarget > 0
            ? "今日抽查池内词条均已勾选熟悉程度。"
            : "今日暂无抽查词条。"
        );
        return;
      }
      if (user && shouldShowEnVocabTeacherQuizIntro(user.id)) {
        setPendingTeacherQuizSession(next);
        setShowTeacherQuizIntro(true);
        return;
      }
      launchTeacherQuizSession(next);
    },
    [
      quizTargetWords,
      dailySeqByWordId,
      quizTarget,
      quizWordHasLevel,
      user,
      launchTeacherQuizSession,
      setStatus,
    ]
  );

  const handleTeacherQuizIntroConfirm = useCallback(() => {
    if (!pendingTeacherQuizSession) {
      setShowTeacherQuizIntro(false);
      return;
    }
    launchTeacherQuizSession(pendingTeacherQuizSession);
    setPendingTeacherQuizSession(null);
    setShowTeacherQuizIntro(false);
  }, [pendingTeacherQuizSession, launchTeacherQuizSession]);

  const handleTeacherQuizIntroClose = useCallback(() => {
    setPendingTeacherQuizSession(null);
    setShowTeacherQuizIntro(false);
  }, []);

  const startTeacherQuizWithRandomMode = useCallback(
    (startWordId?: number) => {
      requestTeacherQuizSession(pickRandomEnVocabTeacherQuizMode(), startWordId);
    },
    [requestTeacherQuizSession]
  );

  const teacherQuizLocksTable = canOperate && !isAdminMode;
  const teacherQuizInProgress = quizSession != null;

  useEffect(() => {
    if (quizSession == null) setShowQuizFlashcard(false);
  }, [quizSession]);

  const resumeTeacherQuizFlashcard = useCallback(
    (preferredWordId?: number) => {
      if (!quizSession) return;
      const index =
        preferredWordId != null
          ? resolveEnVocabTeacherQuizResumeIndex(
              quizSession,
              preferredWordId,
              quizWordHasLevel
            )
          : resolveEnVocabTeacherQuizRefreshResumeIndex(
              quizSession,
              wordsById,
              sessionReviewAt,
              quizWordHasLevel
            );
      setQuizSession((prev) => (prev ? { ...prev, currentIndex: index } : prev));
      setShowQuizFlashcard(true);
    },
    [quizSession, quizWordHasLevel, wordsById, sessionReviewAt]
  );

  const finishTeacherQuiz = useCallback(() => {
    if (!quizSession) {
      setShowQuizFlashcard(false);
      return;
    }
    const expanded = expandEnVocabTeacherQuizSessionForTarget(
      quizSession,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );
    if (expanded) {
      const firstUnchecked = findFirstUncheckedEnVocabTeacherQuizIndex(
        expanded,
        quizWordHasLevel,
        0
      );
      if (firstUnchecked >= 0) {
        setQuizSession({ ...expanded, currentIndex: firstUnchecked });
        setShowQuizFlashcard(true);
        return;
      }
    }
    setShowQuizFlashcard(false);
    setQuizSession(null);
    if (user?.id) clearEnVocabTeacherQuizSession(user.id);
    onTeacherQuizSessionFinished?.();
  }, [
    quizSession,
    quizTargetWords,
    dailySeqByWordId,
    quizWordHasLevel,
    user?.id,
    onTeacherQuizSessionFinished,
  ]);

  const syncTeacherQuizLiveWord = useCallback(
    async (wordId: number | null) => {
      if (!canOperate) return;
      if (teacherQuizLiveSyncedIdRef.current === wordId) return;

      const gen = ++liveSyncGenRef.current;
      if (liveSyncRetryTimerRef.current) {
        clearTimeout(liveSyncRetryTimerRef.current);
        liveSyncRetryTimerRef.current = undefined;
      }

      try {
        const ok = await putVocabTeacherQuizLiveWord({
          apiPath: "/api/en-vocab/teacher-quiz-live",
          wordId,
          locale,
          localeHeaderName: LOCALE_HEADER,
        });
        if (gen !== liveSyncGenRef.current) return;
        if (!ok) throw new Error("teacher quiz live sync failed");
        teacherQuizLiveSyncedIdRef.current = wordId;
      } catch {
        if (gen !== liveSyncGenRef.current) return;
        teacherQuizLiveSyncedIdRef.current = undefined;
        liveSyncRetryTimerRef.current = setTimeout(() => {
          void syncTeacherQuizLiveWord(wordId);
        }, VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS);
      }
    },
    [canOperate, locale]
  );

  const quizFlashcardWordId =
    quizSession?.wordIds[quizSession.currentIndex] ?? null;

  useEffect(() => {
    if (!canOperate) return;
    if (!quizSession) {
      void syncTeacherQuizLiveWord(null);
      return;
    }
    void syncTeacherQuizLiveWord(quizFlashcardWordId);
  }, [canOperate, quizSession, quizFlashcardWordId, syncTeacherQuizLiveWord]);

  useEffect(() => {
    return () => {
      liveSyncGenRef.current += 1;
      if (liveSyncRetryTimerRef.current) {
        clearTimeout(liveSyncRetryTimerRef.current);
        liveSyncRetryTimerRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (
      !canOperate ||
      !isVocabTeacherAccountActiveForRefresh(user) ||
      !showQuizFlashcard ||
      !quizFlashcardWordId
    ) {
      setStudentPeekedCurrentWord(false);
      return;
    }
    // 换词必须先清闩锁：否则上一词学生 peek 会误带到当前词顶栏
    setStudentPeekedCurrentWord(false);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      resolveVocabPollIntervalMs({
        activeMs: teacherQuizIdleRef?.current
          ? VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS
          : EN_VOCAB_QUIZ_LIVE_POLL_MS,
        hiddenMs: teacherQuizIdleRef?.current
          ? VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS
          : JP_VOCAB_POLL_HIDDEN_MS,
        username: usernameRef.current,
      });

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/en-vocab/teacher-quiz-live?word_id=${encodeURIComponent(
            String(quizFlashcardWordId)
          )}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          student_peeked?: boolean;
        };
        if (!cancelled && data.ok) {
          const peeked = Boolean(data.student_peeked);
          if (peeked) {
            // 学生 peek 只写一次；老师端亮灯后停轮询，勿再每 8s 打 Worker
            setStudentPeekedCurrentWord(true);
            setSharedTodayWordIds((prev) => {
              if (prev.has(quizFlashcardWordId)) return prev;
              return new Set([...prev, quizFlashcardWordId]);
            });
            return;
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) schedule(pollDelay());
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canOperate, user, showQuizFlashcard, quizFlashcardWordId, setSharedTodayWordIds, teacherQuizPollIdle]);

  return {
    quizSession,
    setQuizSession,
    showQuizFlashcard,
    setShowQuizFlashcard,
    studentPeekedCurrentWord,
    setStudentPeekedCurrentWord,
    showTeacherQuizIntro,
    pendingTeacherQuizSession,
    handleTeacherQuizIntroConfirm,
    handleTeacherQuizIntroClose,
    quizCardPreviewWordId,
    setQuizCardPreviewWordId,
    quizCardPreviewSession,
    closeQuizCardPreview,
    quizWordHasLevel,
    startTeacherQuizWithRandomMode,
    resumeTeacherQuizFlashcard,
    finishTeacherQuiz,
    teacherQuizLocksTable,
    teacherQuizInProgress,
    quizFlashcardWordId,
  };
}
