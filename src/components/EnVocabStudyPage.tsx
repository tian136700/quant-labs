"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { beijingDateString } from "@/lib/en-vocab-daily-check";
import { type EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import {
  computeEnVocabStudyPageQuizProgress,
  type EnVocabDailyQuizProgress,
} from "@/lib/en-vocab-daily-quiz-progress";
import { parseEnVocabLastUsageLevels } from "@/lib/en-vocab-review";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import { EnClassNotesEditModal } from "@/components/EnClassNotesEditModal";
import { EnVocabEditModal } from "@/components/EnVocabEditModal";
import { EnVocabRefPreviewModal } from "@/components/EnVocabRefPreviewModal";
import { resolveEnVocabRefForPreview } from "@/lib/en-vocab-ref-shared";
import { EnVocabRemarksViewModal } from "@/components/EnVocabRemarksViewModal";
import { EnVocabTeacherQuizFlashcardModal } from "@/components/EnVocabTeacherQuizFlashcardModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { useEnVocabStudyPersonalLevels } from "@/hooks/useVocabStudyPersonalLevels";
import { subscribeEnVocabSharedUpdated } from "@/lib/en-vocab-shared-notify";
import {
  EN_VOCAB_STUDY_POLL_HIDDEN_MS,
  EN_VOCAB_STUDY_POLL_MS,
  EN_VOCAB_STUDY_QUIZ_EVERY_N,
} from "@/lib/en-vocab-sync";
import { useVocabStudySharedPoll } from "@/hooks/useVocabStudySharedPoll";
import {
  abortSignalAfter,
  VOCAB_STUDENT_PEEK_TIMEOUT_MS,
} from "@/lib/vocab-teacher-quiz-live-sync";
import type { EnVocabLevel, EnVocabRef, EnVocabSharedItem, EnVocabWord } from "@/lib/types";
import { EnVocabStudyPageStyles } from "@/components/en-vocab-study-page/EnVocabStudyPageStyles";
import { EnVocabStudyPageTable } from "@/components/en-vocab-study-page/EnVocabStudyPageTable";

export function EnVocabStudyPage() {
  const { locale } = useI18n();
  const {
    user,
    checking,
    canAccessEnVocab,
    canAccessEnVocabStudy,
    isAdmin,
    openAuthPanel,
  } = useEtrAuth();
  const {
    personalLevels,
    personalUsageLevels,
    setPersonalLevel,
    setPersonalUsageLevelsForWord,
  } = useEnVocabStudyPersonalLevels(user?.id);
  const canOperate = canAccessEnVocab;
  const canViewStudy = canAccessEnVocabStudy;
  /** 学生自行查看老师当前抽查词（对齐日语 study peek） */
  const showPeekTeacherQuiz =
    Boolean(user) && canViewStudy && (!canOperate || isAdmin);
  const [items, setItems] = useState<EnVocabSharedItem[]>([]);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>({});
  const [shareDate, setShareDate] = useState("");
  /** API 只带回分母（今日抽查数量）；分子按下方 items 条数自算 */
  const [quizTargetTotal, setQuizTargetTotal] = useState(0);
  const [teacherQuizComplete, setTeacherQuizComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingWord, setEditingWord] = useState<EnVocabWord | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<EnVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: EnVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<EnVocabWord | null>(null);
  const [flashcardItem, setFlashcardItem] = useState<EnVocabSharedItem | null>(null);
  const [teacherLiveWordId, setTeacherLiveWordId] = useState<number | null>(null);
  const [peekingTeacherQuiz, setPeekingTeacherQuiz] = useState(false);
  const pollInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  /** 老师新发词 / 同浏览器共享通知：弹详情卡；禁止 scrollIntoView */
  const pendingFlashcardWordIdRef = useRef<number | null>(null);
  const knownSharedWordIdsRef = useRef<Set<number>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const sharedPollCountRef = useRef(0);
  const quizTargetTotalRef = useRef(0);
  const teacherQuizCompleteRef = useRef(false);

  useEffect(() => {
    teacherQuizCompleteRef.current = teacherQuizComplete;
  }, [teacherQuizComplete]);

  const quizProgress = useMemo((): EnVocabDailyQuizProgress | null => {
    if (quizTargetTotal <= 0) return null;
    return computeEnVocabStudyPageQuizProgress(items.length, quizTargetTotal, {
      teacherComplete: teacherQuizComplete,
    });
  }, [items.length, quizTargetTotal, teacherQuizComplete]);

  const openEnAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 今日背英语单词",
      subtitle: "登录后可查看老师正在抽查的单词，以及老师发给你的词条。",
    });
  }, [openAuthPanel]);

  /** 有操作权限时「查看」也进可编辑备注（对齐老师端）；学生仍只读 */
  const openRemarksWord = useCallback(
    (word: EnVocabWord) => {
      if (canOperate) {
        setEditingRemarksWord(word);
      } else {
        setViewingRemarksWord(word);
      }
    },
    [canOperate]
  );

  const handleWordSaved = useCallback((word: EnVocabWord) => {
    setItems((prev) =>
      prev.map((item) => (item.word_id === word.id ? { ...item, word } : item))
    );
    setFlashcardItem((prev) => {
      if (prev?.word_id !== word.id) return prev;
      return {
        ...prev,
        word,
        level:
          word.last_review_level === "very" ||
          word.last_review_level === "normal" ||
          word.last_review_level === "weak"
            ? word.last_review_level
            : prev.level,
      };
    });
    setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
    setEditingWord((prev) => (prev?.id === word.id ? word : prev));
    setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
    setStatus("词条已保存。");
  }, []);

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: EnVocabWord, message: string) => {
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

  const applyStudyPayload = useCallback(
    (payload: {
      items: EnVocabSharedItem[];
      refs?: Record<string, EnVocabRef>;
      share_date?: string;
      quiz_progress?: EnVocabDailyQuizProgress | null;
    }) => {
      const wasLoadedBefore = hasLoadedOnceRef.current;
      const newWordIds = payload.items.map((item) => item.word_id);
      // 老师勾选 / 发给学生 → 新词自动弹卡；首屏历史列表不弹
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
      setShareDate(payload.share_date ?? beijingDateString());
      if (payload.quiz_progress && payload.quiz_progress.total > 0) {
        quizTargetTotalRef.current = payload.quiz_progress.total;
        setQuizTargetTotal(payload.quiz_progress.total);
        const done = Boolean(payload.quiz_progress.complete);
        teacherQuizCompleteRef.current = done;
        setTeacherQuizComplete(done);
      }
      hasLoadedOnceRef.current = true;
    },
    []
  );

  const loadShared = useCallback(async (opts?: { force?: boolean; includeQuiz?: boolean }) => {
    if (!canViewStudy) {
      setLoading(false);
      return;
    }
    if (pollInFlightRef.current) {
      if (opts?.force) pendingRefreshRef.current = true;
      return;
    }

    const includeQuiz =
      opts?.includeQuiz ??
      (!hasLoadedOnceRef.current ||
        sharedPollCountRef.current % EN_VOCAB_STUDY_QUIZ_EVERY_N === 0);

    pollInFlightRef.current = true;
    try {
      sharedPollCountRef.current += 1;

      const sharedUrl = includeQuiz
        ? "/api/en-vocab/shared"
        : "/api/en-vocab/shared?lite=1";

      const res = await fetch(sharedUrl, {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      });
      const parsed = await readApiJson<{
        ok: boolean;
        items?: EnVocabSharedItem[];
        refs?: Record<string, EnVocabRef>;
        share_date?: string;
        quiz_progress?: EnVocabDailyQuizProgress;
        teacher_live_word_id?: number | null;
        error?: string;
      }>(res);
      if (!parsed.ok) {
        if (!hasLoadedOnceRef.current) {
          setError(parsed.error || "加载失败");
        }
        return;
      }
      const { data, status: httpStatus } = parsed;
      if (httpStatus === 401) {
        setItems([]);
        setRefs({});
        setShareDate(beijingDateString());
        setQuizTargetTotal(0);
        quizTargetTotalRef.current = 0;
        teacherQuizCompleteRef.current = false;
        setTeacherQuizComplete(false);
        setTeacherLiveWordId(null);
        setError("请登录后查看今日英语单词。");
        return;
      }
      if (!data.ok || !data.items) {
        throw new Error(data.error || "加载失败");
      }
      const targetTotal =
        data.quiz_progress && data.quiz_progress.total > 0
          ? data.quiz_progress.total
          : quizTargetTotalRef.current;
      const teacherComplete =
        data.quiz_progress != null
          ? Boolean(data.quiz_progress.complete)
          : teacherQuizCompleteRef.current;
      applyStudyPayload({
        items: data.items,
        refs: data.refs,
        share_date: data.share_date,
        quiz_progress:
          targetTotal > 0
            ? computeEnVocabStudyPageQuizProgress(data.items.length, targetTotal, {
                teacherComplete,
              })
            : null,
      });
      applyTeacherLiveWordId(data.teacher_live_word_id);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    return subscribeEnVocabSharedUpdated((detail) => {
      // 与日语一致：openRemarks 表示打开详情卡（历史字段名）
      if (detail.wordId && detail.openRemarks) {
        pendingFlashcardWordIdRef.current = detail.wordId;
      }
      void loadShared({ force: true });
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
    activeMs: EN_VOCAB_STUDY_POLL_MS,
    hiddenMs: EN_VOCAB_STUDY_POLL_HIDDEN_MS,
  });

  const teacherLiveWordShared =
    teacherLiveWordId != null &&
    items.some((item) => item.word_id === teacherLiveWordId);

  const peekTeacherQuizWord = useCallback(async () => {
    if (!user || !showPeekTeacherQuiz || peekingTeacherQuiz) return;
    if (teacherLiveWordShared) {
      setStatus("老师已发送正在抽查的单词，请看弹出的卡片或下方列表。");
      return;
    }
    setPeekingTeacherQuiz(true);
    try {
      const res = await fetch("/api/en-vocab/teacher-quiz-live", {
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
        item?: EnVocabSharedItem;
        refs?: Record<string, EnVocabRef>;
      }>(res);
      if (!parsed.ok) {
        setStatus(parsed.error || "暂时无法查看，请稍后再试。");
        return;
      }
      const { data, status: httpStatus } = parsed;
      if (httpStatus === 401) {
        openEnAuth();
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
        const existingIndex = prev.findIndex((item) => item.word_id === next.word_id);
        if (existingIndex >= 0) {
          const nextItems = [...prev];
          nextItems[existingIndex] = next;
          return nextItems;
        }
        return [next, ...prev];
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
    openEnAuth,
  ]);

  const loggedIn = Boolean(user);
  const accessDenied = loggedIn && !checking && !canViewStudy;

  const studyFlashcardSession = useMemo<EnVocabTeacherQuizSession | null>(() => {
    if (!flashcardItem) return null;
    return {
      mode: "sequential",
      wordIds: [flashcardItem.word_id],
      currentIndex: 0,
    };
  }, [flashcardItem]);

  const studyWordsById = useMemo(() => {
    const map = new Map<number, EnVocabWord>();
    for (const item of items) {
      map.set(item.word_id, item.word);
    }
    if (flashcardItem) {
      map.set(flashcardItem.word_id, flashcardItem.word);
    }
    return map;
  }, [items, flashcardItem]);

  const studyDisplayOrder = useMemo<EnVocabDailyDisplayOrder>(
    () => ({
      date: shareDate || beijingDateString(),
      ids: items.map((item) => item.word_id),
    }),
    [shareDate, items]
  );

  const studySessionLevel = useMemo(() => {
    const out: Record<number, EnVocabLevel | undefined> = {};
    for (const item of items) {
      if (item.level) out[item.word_id] = item.level;
    }
    if (flashcardItem?.level) {
      out[flashcardItem.word_id] = flashcardItem.level;
    }
    for (const [id, level] of Object.entries(personalLevels)) {
      out[Number(id)] = level;
    }
    return out;
  }, [items, flashcardItem, personalLevels]);

  const studySessionUsageLevels = useMemo(() => {
    const out: Record<number, Array<EnVocabLevel | null | undefined>> = {};
    const apply = (item: EnVocabSharedItem) => {
      const levels = parseEnVocabLastUsageLevels(item.word.last_usage_levels);
      if (levels) out[item.word_id] = levels;
    };
    for (const item of items) apply(item);
    if (flashcardItem) apply(flashcardItem);
    for (const [id, levels] of Object.entries(personalUsageLevels)) {
      out[Number(id)] = levels;
    }
    return out;
  }, [items, flashcardItem, personalUsageLevels]);

  const studyDailySeqByWordId = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item, index) => {
      map.set(item.word_id, index + 1);
    });
    return map;
  }, [items]);

  const openRefPreview = (refKey: string, ref?: EnVocabRef) => {
    const meta = resolveEnVocabRefForPreview(refKey, refs, ref);
    setPreviewRef({ ref: meta, cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at });
  };

  const openStudyFlashcard = useCallback((item: EnVocabSharedItem) => {
    setFlashcardItem(item);
  }, []);

  return (
    <main
      className="page-wrap jp-vocab-page jp-vocab-study-page"
      style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>今日背英语单词</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        没听清时可点「查看老师正在抽查的单词」立刻查看；也可点列表中的单词打开详情卡片。列表供课后复习，每日北京时间 0 点自动清空。
      </p>

      {showPeekTeacherQuiz ? (
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
            onClick={openEnAuth}
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
          当前账号无权访问今日背英语单词。
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

      {canViewStudy && quizProgress && quizProgress.total > 0 ? (
        <JpVocabDailyQuizProgressBar progress={quizProgress} variant="study" />
      ) : null}

      <EnVocabStudyPageTable
        locale={locale}
        loading={loading}
        items={items}
        shareDate={shareDate}
        canViewStudy={canViewStudy}
        canOperate={canOperate}
        openRemarksWord={openRemarksWord}
        setEditingWord={setEditingWord}
        setEditingRemarksWord={setEditingRemarksWord}
        onViewCard={openStudyFlashcard}
      />

      <EnVocabTeacherQuizFlashcardModal
        open={flashcardItem != null}
        mode="study"
        session={studyFlashcardSession}
        wordsById={studyWordsById}
        refs={refs}
        locale={locale}
        displayOrder={studyDisplayOrder}
        sessionLevel={studySessionLevel}
        sessionUsageLevels={studySessionUsageLevels}
        reviewLockedByWordId={{}}
        savingWordId={null}
        dailySeqByWordId={studyDailySeqByWordId}
        canOperate={canOperate}
        shareUiEnabled={false}
        onClose={() => setFlashcardItem(null)}
        onComplete={() => setFlashcardItem(null)}
        onSelectLevel={(wordId, level) => setPersonalLevel(wordId, level)}
        onSelectUsageLevels={(wordId, levels) =>
          setPersonalUsageLevelsForWord(wordId, levels)
        }
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

      <EnVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <EnVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        onClose={() => setViewingRemarksWord(null)}
        onWordUpdated={(word) => {
          setItems((prev) =>
            prev.map((item) =>
              item.word_id === word.id ? { ...item, word } : item
            )
          );
          setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
        }}
      />

      <EnClassNotesEditModal
        open={editingRemarksWord != null}
        word={editingRemarksWord}
        locale={locale}
        canEdit={canOperate}
        sharedToday
        onClose={() => setEditingRemarksWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openEnAuth}
      />

      <EnVocabEditModal
        open={editingWord != null}
        word={editingWord}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openEnAuth}
      />
      <EnVocabStudyPageStyles />

    </main>
  );
}
