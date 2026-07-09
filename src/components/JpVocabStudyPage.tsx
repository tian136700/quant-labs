"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { beijingDateString, effectiveTodayCheckCount } from "@/lib/jp-vocab-daily-check";
import {
  markJpVocabStudyDailyCompleteDismissed,
  shouldShowJpVocabStudyDailyComplete,
} from "@/lib/jp-vocab-daily-complete-dismiss";
import type { JpVocabDailyQuizProgress } from "@/lib/jp-vocab-daily-quiz-progress";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import {
  formatJpVocabTotalReviewsDisplay,
  jpVocabRiskIndex,
  jpVocabTotalReviewsZeroHint,
} from "@/lib/jp-vocab-shared";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";
import { JpVocabDailyQuizProgressBar } from "@/components/JpVocabDailyQuizProgressBar";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { subscribeJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
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

const POLL_MS = 2000;
const POLL_HIDDEN_MS = 8000;

export function JpVocabStudyPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, canAccessJpVocabStudy, openAuthPanel } =
    useEtrAuth();
  const canOperate = canAccessJpVocab;
  const canViewStudy = canAccessJpVocabStudy;
  const [items, setItems] = useState<JpVocabSharedItem[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [shareDate, setShareDate] = useState("");
  const [quizProgress, setQuizProgress] = useState<JpVocabDailyQuizProgress | null>(null);
  const [showDailyComplete, setShowDailyComplete] = useState(false);
  const dailyQuizCompleteWasRef = useRef<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [requestingShare, setRequestingShare] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const pollInFlightRef = useRef(false);
  const requestCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);
  const pendingOpenRemarksWordIdRef = useRef<number | null>(null);

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 今日日语单词",
      subtitle: "登录后可查看老师共享的单词，或请求老师发送。",
    });
  }, [openAuthPanel]);

  const handleWordSaved = useCallback((word: JpVocabWord) => {
    setItems((prev) =>
      prev.map((item) => (item.word_id === word.id ? { ...item, word } : item))
    );
    setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
    setEditingWord((prev) => (prev?.id === word.id ? word : prev));
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
      const res = await fetch("/api/jp-vocab/shared", {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok: boolean;
        items?: JpVocabSharedItem[];
        refs?: Record<string, JpVocabRef>;
        share_date?: string;
        quiz_progress?: JpVocabDailyQuizProgress;
        error?: string;
      };
      if (res.status === 401) {
        setItems([]);
        setRefs({});
        setShareDate(beijingDateString());
        setError("仅管理员、日语老师或已授权学生可访问今日日语单词。");
        return;
      }
      if (!data.ok || !data.items) {
        throw new Error(data.error || "加载失败");
      }
      setItems(data.items);
      setRefs(data.refs ?? {});
      setShareDate(data.share_date ?? beijingDateString());
      setQuizProgress(data.quiz_progress ?? null);
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
  }, [locale, canViewStudy]);

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
      }, hidden ? POLL_HIDDEN_MS : POLL_MS);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadShared, canViewStudy]);

  useEffect(() => {
    if (!canViewStudy) return;
    return subscribeJpVocabSharedUpdated((detail) => {
      if (detail.openRemarks && detail.wordId && user) {
        pendingOpenRemarksWordIdRef.current = detail.wordId;
      }
      void loadShared({ force: true });
    });
  }, [user, loadShared, canViewStudy]);

  useEffect(() => {
    const wordId = pendingOpenRemarksWordIdRef.current;
    if (!wordId || items.length === 0) return;
    const item = items.find((entry) => entry.word_id === wordId);
    if (!item) return;

    pendingOpenRemarksWordIdRef.current = null;
    requestAnimationFrame(() => {
      document
        .getElementById(`jp-vocab-study-row-${wordId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    if (canOperate) {
      setEditingRemarksWord(item.word);
    } else {
      setViewingRemarksWord(item.word);
    }
  }, [items, canOperate]);

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

    const wasComplete = dailyQuizCompleteWasRef.current;
    dailyQuizCompleteWasRef.current = quizProgress.complete;

    if (!quizProgress.complete) return;
    if (!shouldShowJpVocabStudyDailyComplete(user.id)) return;
    if (wasComplete === true) return;

    setShowDailyComplete(true);
  }, [canViewStudy, user?.id, quizProgress?.complete, quizProgress?.total]);

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

  const requestTeacherShare = useCallback(async () => {
    if (!user || !canViewStudy || requestingShare) return;
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
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.status === 401) {
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
  }, [user, canViewStudy, requestingShare, locale, openJpAuth]);

  const loggedIn = Boolean(user);
  const accessDenied = loggedIn && !checking && !canViewStudy;

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
        老师在抽问时共享的单词会出现在这里，方便课后复习。每日北京时间 0 点自动清空。
      </p>

      {loggedIn && canViewStudy ? (
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
            disabled={requestingShare || requestSent}
            onClick={() => void requestTeacherShare()}
          >
            {requestingShare ? "发送中…" : requestSent ? "已发送" : "请老师发送"}
          </button>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            没听清时，可请老师发送正在抽查的单词/语法。
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
                  const selected = item.level;
                  const risk = jpVocabRiskIndex(w);
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
                      </td>
                      <td
                        className={`jp-vocab-reading-col${
                          !readingTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="读音"
                        style={{ color: "var(--muted)" }}
                      >
                        {readingTrim}
                      </td>
                      <td
                        className={`jp-vocab-meaning-col${
                          !meaningTrim ? " jp-vocab-field-empty" : ""
                        }`}
                        data-label="释义"
                        style={{ color: "var(--muted)" }}
                      >
                        {meaningTrim}
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
                            !hasJpVocabClassNotes(w.class_notes) && !canOperate
                              ? " jp-vocab-field-empty"
                              : ""
                          }`}
                          data-label="备注"
                        >
                          <div className="jp-vocab-notes-actions">
                            {hasJpVocabClassNotes(w.class_notes) ? (
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                onClick={() => setViewingRemarksWord(w)}
                              >
                                查看
                              </button>
                            ) : null}
                            {canOperate ? (
                              <JpEditIconButton
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

      {user && quizProgress ? (
        <JpVocabDailyQuizCompleteModal
          open={showDailyComplete}
          total={quizProgress.total}
          variant="study"
          onClose={() => {
            markJpVocabStudyDailyCompleteDismissed(user.id);
            setShowDailyComplete(false);
          }}
        />
      ) : null}

      <JpVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <JpVocabRemarksViewModal
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
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordSaved}
        onSaveFailed={handleWordSaveFailed}
        onNeedAuth={openJpAuth}
      />

      <style jsx global>{`
        .jp-vocab-study-page .jp-vocab-scroll-hint {
          margin: 0 0 0.5rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
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
          align-items: center;
          justify-content: center;
          text-align: center;
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
          min-width: 1180px;
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
