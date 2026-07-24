"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_VOCAB_POLL_HIDDEN_MS,
  EN_VOCAB_QUIZ_LIVE_POLL_MS,
} from "@/lib/en-vocab-sync";
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

type AuthUser = { id: number };

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
  setSharedTodayWordIds: Dispatch<SetStateAction<Set<number>>>;
  setStatus: (message: string) => void;
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
    setSharedTodayWordIds,
    setStatus,
  } = options;

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

  const teacherQuizLiveWordRef = useRef<number | null | undefined>(undefined);
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
      if (!session) {
        clearEnVocabTeacherQuizSession(user.id);
        return;
      }
      writeEnVocabTeacherQuizSession(user.id, quizTarget, session);
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
      const resumeIndex = resolveEnVocabTeacherQuizRefreshResumeIndex(
        expanded,
        wordsById,
        sessionReviewAt,
        quizWordHasLevel
      );
      const session = { ...expanded, currentIndex: resumeIndex };
      setQuizSession(session);
      setShowQuizFlashcard(true);
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
            ? "今日抽查池内暂无未抽查词条（已抽过的不会再进入抽查卡片）。"
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
  }, [quizSession, quizTargetWords, dailySeqByWordId, quizWordHasLevel]);

  const syncTeacherQuizLiveWord = useCallback(
    async (wordId: number | null) => {
      if (!canOperate) return;
      if (teacherQuizLiveWordRef.current === wordId) return;
      teacherQuizLiveWordRef.current = wordId;
      try {
        await fetch("/api/en-vocab/teacher-quiz-live", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({ word_id: wordId }),
        });
      } catch {
        teacherQuizLiveWordRef.current = undefined;
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
    if (!canOperate || !showQuizFlashcard || !quizFlashcardWordId) {
      setStudentPeekedCurrentWord(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : EN_VOCAB_QUIZ_LIVE_POLL_MS;

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
            setStudentPeekedCurrentWord(true);
            setSharedTodayWordIds((prev) => {
              if (prev.has(quizFlashcardWordId)) return prev;
              return new Set([...prev, quizFlashcardWordId]);
            });
          }
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
  }, [canOperate, showQuizFlashcard, quizFlashcardWordId, setSharedTodayWordIds]);

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
