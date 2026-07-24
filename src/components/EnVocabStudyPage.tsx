"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/en-vocab-daily-check";
import { type EnVocabDailyDisplayOrder } from "@/lib/en-vocab-daily-order";
import { hasEnVocabClassNotes } from "@/lib/en-vocab-class-notes";
import { parseEnVocabLastUsageLevels } from "@/lib/en-vocab-review";
import {
  formatEnVocabTotalReviewsDisplay,
  enVocabRiskIndex,
  enVocabTotalReviewsZeroHint,
} from "@/lib/en-vocab-shared";
import type { EnVocabTeacherQuizSession } from "@/lib/en-vocab-teacher-quiz";
import { EnClassNotesEditModal } from "@/components/EnClassNotesEditModal";
import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnVocabEditModal } from "@/components/EnVocabEditModal";
import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { EnVocabRefPreviewModal } from "@/components/EnVocabRefPreviewModal";
import { resolveEnVocabRefForPreview } from "@/lib/en-vocab-ref-shared";
import { EnVocabRemarksViewModal } from "@/components/EnVocabRemarksViewModal";
import { EnVocabTeacherQuizFlashcardModal } from "@/components/EnVocabTeacherQuizFlashcardModal";
import { subscribeEnVocabSharedUpdated } from "@/lib/en-vocab-shared-notify";
import {
  EN_VOCAB_STUDY_POLL_HIDDEN_MS,
  EN_VOCAB_STUDY_POLL_MS,
  EN_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS,
  EN_VOCAB_STUDY_QUIZ_LIVE_POLL_MS,
} from "@/lib/en-vocab-sync";
import type { EnVocabLevel, EnVocabRef, EnVocabSharedItem, EnVocabWord } from "@/lib/types";
import { EnVocabStudyPageStyles } from "@/components/en-vocab-study-page/EnVocabStudyPageStyles";

const LEVELS: { key: EnVocabLevel; label: string }[] = [
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
  const canOperate = canAccessEnVocab;
  const canViewStudy = canAccessEnVocabStudy;
  /** 学生自行查看老师当前抽查词（对齐日语 study peek） */
  const showPeekTeacherQuiz =
    Boolean(user) && canViewStudy && (!canOperate || isAdmin);
  const [items, setItems] = useState<EnVocabSharedItem[]>([]);
  const [refs, setRefs] = useState<Record<string, EnVocabRef>>({});
  const [shareDate, setShareDate] = useState("");
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

  const applyStudyPayload = useCallback(
    (payload: {
      items: EnVocabSharedItem[];
      refs?: Record<string, EnVocabRef>;
      share_date?: string;
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
      hasLoadedOnceRef.current = true;
    },
    []
  );

  const loadShared = useCallback(async (opts?: { force?: boolean }) => {
    if (!canViewStudy) {
      setLoading(false);
      return;
    }
    if (pollInFlightRef.current) {
      if (opts?.force) pendingRefreshRef.current = true;
      return;
    }
    pollInFlightRef.current = true;
    try {
      const res = await fetch("/api/en-vocab/shared", {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      });
      const parsed = await readApiJson<{
        ok: boolean;
        items?: EnVocabSharedItem[];
        refs?: Record<string, EnVocabRef>;
        share_date?: string;
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
        setError("请登录后查看今日英语单词。");
        return;
      }
      if (!data.ok || !data.items) {
        throw new Error(data.error || "加载失败");
      }
      applyStudyPayload({
        items: data.items,
        refs: data.refs,
        share_date: data.share_date,
      });
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
  }, [locale, canViewStudy, applyStudyPayload]);

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
        void loadShared().finally(schedule);
      }, hidden ? EN_VOCAB_STUDY_POLL_HIDDEN_MS : EN_VOCAB_STUDY_POLL_MS);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadShared, canViewStudy]);

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

  const teacherLiveWordShared =
    teacherLiveWordId != null &&
    items.some((item) => item.word_id === teacherLiveWordId);

  useEffect(() => {
    if (!showPeekTeacherQuiz) {
      setTeacherLiveWordId(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      typeof document !== "undefined" && document.hidden
        ? EN_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS
        : EN_VOCAB_STUDY_QUIZ_LIVE_POLL_MS;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/en-vocab/teacher-quiz-live?scope=study", {
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
  }, [showPeekTeacherQuiz]);

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
        setStatus(data.error || "老师当前没有在抽查单词，请稍后再试。");
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
    return out;
  }, [items, flashcardItem]);

  const studySessionUsageLevels = useMemo(() => {
    const out: Record<number, Array<EnVocabLevel | null | undefined>> = {};
    const apply = (item: EnVocabSharedItem) => {
      const levels = parseEnVocabLastUsageLevels(item.word.last_usage_levels);
      if (levels) out[item.word_id] = levels;
    };
    for (const item of items) apply(item);
    if (flashcardItem) apply(flashcardItem);
    return out;
  }, [items, flashcardItem]);

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
                  const readingTrim = (w.reading || "").trim();
                  const meaningTrim = (w.meaning || "").trim();
                  const posTrim = (w.pos || "").trim();
                  const selected = item.level;
                  const risk = enVocabRiskIndex(w);
                  const riskBadgeTier = risk >= 2 ? "high" : risk <= 0 ? "low" : "mid";
                  const todayChecks = effectiveTodayCheckCount(
                    w.today_check_count ?? 0,
                    w.today_check_date
                  );

                  return (
                    <tr key={item.id} id={`jp-vocab-study-row-${w.id}`}>
                      <td className="jp-vocab-seq-col" data-label="序号">
                        {index + 1}
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
                          <button
                            type="button"
                            className="jp-vocab-word-link"
                            title="查看详情卡片"
                            onClick={() => openStudyFlashcard(item)}
                          >
                            {w.word}
                          </button>
                          <span className="jp-vocab-ref-hint">（点击查看详情卡片）</span>
                        </div>
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                        style={{ color: "var(--muted)" }}
                      >
                        {readingTrim}
                        {w.reading_source?.trim() ? (
                          <JpVocabSourceLabel source={w.reading_source} />
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-meaning-col${
                          !meaningTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="释义"
                        style={{ color: "var(--muted)" }}
                      >
                        {meaningTrim}
                        {w.meaning_source?.trim() ? (
                          <JpVocabSourceLabel source={w.meaning_source} />
                        ) : null}
                      </td>
                      <td
                        className={`jp-vocab-pos-col${
                          !posTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="词性"
                        style={{ color: "var(--muted)" }}
                      >
                        {posTrim}
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
                          const totalDisplay = formatEnVocabTotalReviewsDisplay(w, locale);
                          if (totalDisplay.isZero) {
                            return (
                              <span
                                className="jp-vocab-total-never"
                                title={enVocabTotalReviewsZeroHint(locale)}
                              >
                                {totalDisplay.labelLines ? (
                                  <>
                                    <span>{totalDisplay.labelLines[0]}</span>
                                    <span>{totalDisplay.labelLines[1]}</span>
                                  </>
                                ) : (
                                  totalDisplay.label
                                )}
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
                            !hasEnVocabClassNotes(w.class_notes, w.class_notes_present) && !canOperate
                              ? " jp-vocab-field-empty"
                              : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-actions">
                            {hasEnVocabClassNotes(w.class_notes, w.class_notes_present) ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                title={canOperate ? "查看并编辑备注" : "查看备注"}
                                onClick={() => openRemarksWord(w)}
                              >
                                查看
                              </button>
                            ) : null}
                            {canOperate ? (
                              <EnEditIconButton
                                title="编辑备注"
                                onClick={() => setEditingRemarksWord(w)}
                              />
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      <td
                        className={`jp-vocab-action-col${!canOperate ? " jp-vocab-field-empty" : ""}`}
                        data-label="操作"
                      >
                        {canOperate ? (
                          <div className="jp-vocab-action-buttons">
                            <button
                              type="button"
                              className="btn-rsi-filter btn-rsi-filter--compact"
                              onClick={() => setEditingWord(w)}
                            >
                              编辑
                            </button>
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
        onSelectLevel={() => {}}
        onSelectUsageLevels={() => {}}
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
