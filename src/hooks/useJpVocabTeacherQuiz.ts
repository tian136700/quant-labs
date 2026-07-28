"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Locale } from "@/i18n/messages";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import {
  computeJpVocabDailyQuizProgress,
} from "@/lib/jp-vocab-daily-quiz-progress";
import { effectiveJpVocabDisplayLevel } from "@/lib/jp-vocab-review";
import {
  JP_VOCAB_POLL_HIDDEN_MS,
  JP_VOCAB_QUIZ_LIVE_POLL_MS,
} from "@/lib/jp-vocab-sync";
import { resolveVocabPollIntervalMs } from "@/lib/vocab-poll-throttle";
import {
  putVocabTeacherQuizLiveWord,
  VOCAB_TEACHER_QUIZ_LIVE_SYNC_RETRY_MS,
} from "@/lib/vocab-teacher-quiz-live-sync";
import {
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_HIDDEN_MS,
  VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS,
} from "@/lib/vocab-teacher-quiz-sync-poll";
import {
  createJpVocabTeacherQuizSession,
  expandJpVocabTeacherQuizSessionForTarget,
  filterJpVocabTeacherQuizUncheckedWords,
  findFirstUncheckedJpVocabTeacherQuizIndex,
  isJpVocabTeacherQuizSessionComplete,
  pickRandomJpVocabTeacherQuizMode,
  reconcileJpVocabTeacherQuizSession,
  resolveJpVocabTeacherQuizRefreshResumeIndex,
  resolveJpVocabTeacherQuizResumeIndex,
  type JpVocabTeacherQuizMode,
  type JpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz";
import {
  clearJpVocabTeacherQuizSession,
  readJpVocabTeacherQuizSession,
  writeJpVocabTeacherQuizSession,
} from "@/lib/jp-vocab-teacher-quiz-storage";
import { shouldShowJpVocabTeacherQuizIntro } from "@/components/JpVocabTeacherQuizIntroModal";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

type AuthUser = { id: number; username?: string };

export function useJpVocabTeacherQuiz(options: {
  locale: Locale;
  user: AuthUser | null;
  checking: boolean;
  loading: boolean;
  canOperate: boolean;
  isAdminMode: boolean;
  words: JpVocabWord[];
  sessionLevel: Record<number, JpVocabLevel | undefined>;
  sessionReviewAt: Record<number, number>;
  displayOrder: JpVocabDailyDisplayOrder;
  quizTarget: number;
  quizTargetWords: JpVocabWord[];
  quizTargetWordIds: Set<number>;
  dailySeqByWordId: Map<number, number>;
  /** 开卡后半小时无勾选 → live 轮询降频 */
  teacherQuizIdleRef?: MutableRefObject<boolean>;
  teacherQuizPollIdle?: boolean;
  setStatus: (message: string) => void;
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
    teacherQuizIdleRef,
    teacherQuizPollIdle = false,
    setStatus,
    onTeacherQuizSessionFinished,
  } = options;
  const usernameRef = useRef(user?.username);
  usernameRef.current = user?.username;

  const [quizSession, setQuizSession] = useState<JpVocabTeacherQuizSession | null>(
    null
  );
  const [showQuizFlashcard, setShowQuizFlashcard] = useState(false);
  const [studentPeekedCurrentWord, setStudentPeekedCurrentWord] = useState(false);
  const [showTeacherQuizIntro, setShowTeacherQuizIntro] = useState(false);
  const [pendingTeacherQuizSession, setPendingTeacherQuizSession] =
    useState<JpVocabTeacherQuizSession | null>(null);
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
        effectiveJpVocabDisplayLevel(w, sessionLevel[wordId], { displayOrder }) !=
        null
      );
    },
    [words, sessionLevel, displayOrder]
  );

  const persistQuizSession = useCallback(
    (session: JpVocabTeacherQuizSession | null) => {
      if (!user?.id) return;
      if (!session) {
        clearJpVocabTeacherQuizSession(user.id);
        return;
      }
      writeJpVocabTeacherQuizSession(user.id, quizTarget, session);
    },
    [user?.id, quizTarget]
  );

  useEffect(() => {
    if (!user?.id || quizTarget <= 0 || loading || checking) return;
    if (quizSessionRestoredRef.current) return;
    if (quizTargetWords.length === 0) {
      quizSessionRestoredRef.current = true;
      return;
    }

    quizSessionRestoredRef.current = true;
    const stored = readJpVocabTeacherQuizSession(user.id, quizTarget);
    if (!stored) return;

    const reconciled = reconcileJpVocabTeacherQuizSession(stored, quizTargetWordIds);
    if (!reconciled) {
      clearJpVocabTeacherQuizSession(user.id);
      return;
    }

    const expanded = expandJpVocabTeacherQuizSessionForTarget(
      reconciled,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );

    if (
      !expanded ||
      isJpVocabTeacherQuizSessionComplete(expanded, quizWordHasLevel) ||
      computeJpVocabDailyQuizProgress(words, {
        quiz_target: quizTarget,
      }).complete
    ) {
      clearJpVocabTeacherQuizSession(user.id);
      setQuizSession(null);
      setShowQuizFlashcard(false);
      return;
    }

    if (canOperate && !isAdminMode) {
      const resumeIndex = resolveJpVocabTeacherQuizRefreshResumeIndex(
        expanded,
        wordsById,
        sessionReviewAt,
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
    const hasNewUnchecked = filterJpVocabTeacherQuizUncheckedWords(
      quizTargetWords,
      quizWordHasLevel
    ).some((w) => !sessionSet.has(w.id));
    if (!hasNewUnchecked) return;
    setQuizSession((prev) => {
      if (!prev) return prev;
      const next = expandJpVocabTeacherQuizSessionForTarget(
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

  const quizCardPreviewSession = useMemo((): JpVocabTeacherQuizSession | null => {
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

  const launchTeacherQuizSession = useCallback((session: JpVocabTeacherQuizSession) => {
    setQuizSession(session);
    setShowQuizFlashcard(true);
  }, []);

  const requestTeacherQuizSession = useCallback(
    (mode: JpVocabTeacherQuizMode, startWordId?: number) => {
      const next = createJpVocabTeacherQuizSession(
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
            : "请管理员先设置今日抽查数量。"
        );
        return;
      }
      if (user && shouldShowJpVocabTeacherQuizIntro(user.id)) {
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
      requestTeacherQuizSession(pickRandomJpVocabTeacherQuizMode(), startWordId);
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
          ? resolveJpVocabTeacherQuizResumeIndex(
              quizSession,
              preferredWordId,
              quizWordHasLevel
            )
          : resolveJpVocabTeacherQuizRefreshResumeIndex(
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
    const expanded = expandJpVocabTeacherQuizSessionForTarget(
      quizSession,
      quizTargetWords,
      dailySeqByWordId,
      quizWordHasLevel
    );
    if (expanded) {
      const firstUnchecked = findFirstUncheckedJpVocabTeacherQuizIndex(
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
    onTeacherQuizSessionFinished?.();
  }, [
    quizSession,
    quizTargetWords,
    dailySeqByWordId,
    quizWordHasLevel,
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
          apiPath: "/api/jp-vocab/teacher-quiz-live",
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
    if (!canOperate || !showQuizFlashcard || !quizFlashcardWordId) {
      setStudentPeekedCurrentWord(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      resolveVocabPollIntervalMs({
        activeMs: teacherQuizIdleRef?.current
          ? VOCAB_TEACHER_QUIZ_SYNC_IDLE_MS
          : JP_VOCAB_QUIZ_LIVE_POLL_MS,
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
          `/api/jp-vocab/teacher-quiz-live?word_id=${encodeURIComponent(
            String(quizFlashcardWordId)
          )}`,
          { credentials: "include", cache: "no-store" }
        );
        const data = (await res.json()) as {
          ok: boolean;
          student_peeked?: boolean;
        };
        if (!cancelled && data.ok) {
          setStudentPeekedCurrentWord(Boolean(data.student_peeked));
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
  }, [canOperate, showQuizFlashcard, quizFlashcardWordId, teacherQuizPollIdle]);

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
    wordsById,
  };
}
