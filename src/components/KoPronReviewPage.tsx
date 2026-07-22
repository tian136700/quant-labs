"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { KoPronLetterCopyButton } from "@/components/KoPronLetterCopyButton";
import { KoPronReviewFlashcardModal } from "@/components/KoPronReviewFlashcardModal";
import { KoPronSpeakButton } from "@/components/KoPronSpeakButton";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import {
  animateJpVocabSaveProgressTo100,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import {
  buildKoPronReviewSession,
  clearKoPronReviewInterruptedSession,
  persistKoPronReviewSessionBreakpoint,
  readKoPronReviewInterruptedSession,
  type KoPronReviewSession,
} from "@/lib/ko-pron-review-session";
import { koPronSelectPath } from "@/lib/locale-path";
import type { KoPronCatalogLetter } from "@/lib/types";

export function KoPronReviewPage() {
  const { user, checking, canAccessKoPronAdminPage, setUser } = useEtrAuth();
  const [catalog, setCatalog] = useState<KoPronCatalogLetter[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<KoPronReviewSession | null>(null);
  const [interrupted, setInterrupted] = useState<KoPronReviewSession | null>(
    null
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [savePercent, setSavePercent] = useState<number | null>(null);
  const [saveQueued, setSaveQueued] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ko-pron/review", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        catalog?: KoPronCatalogLetter[];
        reviewed_catalog_ids?: number[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      setCatalog(data.catalog ?? []);
      setReviewedIds(new Set(data.reviewed_catalog_ids ?? []));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !user || !canAccessKoPronAdminPage) return;
    void load();
  }, [checking, user, canAccessKoPronAdminPage, load]);

  const orderedIds = useMemo(() => catalog.map((c) => c.id), [catalog]);
  const reviewedInPool = useMemo(
    () => orderedIds.filter((id) => reviewedIds.has(id)).length,
    [orderedIds, reviewedIds]
  );
  const currentLetter = useMemo(() => {
    if (!session) return null;
    const id = session.catalogIds[session.currentIndex];
    return catalog.find((c) => c.id === id) ?? null;
  }, [session, catalog]);

  // 池加载后刷新「可继续」断点（误关在第 N 张）
  useEffect(() => {
    if (loading || !orderedIds.length) {
      setInterrupted(null);
      return;
    }
    setInterrupted(readKoPronReviewInterruptedSession(orderedIds));
  }, [loading, orderedIds, reviewedIds]);

  const restartReview = () => {
    if (!orderedIds.length) return;
    clearKoPronReviewInterruptedSession();
    setInterrupted(null);
    const next = buildKoPronReviewSession(orderedIds, reviewedIds, "fresh");
    if (!next) {
      setError("复习池为空。");
      return;
    }
    setError("");
    setSession(next);
    persistKoPronReviewSessionBreakpoint(next);
  };

  const continueReview = () => {
    const saved =
      interrupted ?? readKoPronReviewInterruptedSession(orderedIds);
    if (!saved) {
      setError("没有可继续的进度。可点「重新开始复习」。");
      setInterrupted(null);
      return;
    }
    setError("");
    setSession(saved);
    persistKoPronReviewSessionBreakpoint(saved);
  };

  const closeSession = () => {
    if (session) {
      persistKoPronReviewSessionBreakpoint(session);
      setInterrupted(session);
    }
    setSession(null);
  };

  const goNext = async (familiarity: "familiar" | "unfamiliar") => {
    if (!session || !currentLetter || saveBusy) return;
    const catalogId = currentLetter.id;
    const startedAt = Date.now();
    setSaveBusy(true);
    setSaveQueued(true);
    setSavePercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const timer = setInterval(() => {
      setSaveQueued(false);
      setSavePercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);

    try {
      const res = await fetch("/api/ko-pron/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review_next",
          catalog_id: catalogId,
          familiarity,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reviewed_catalog_ids?: number[];
        catalog_id?: number;
        review_cnt_familiar?: number;
        review_cnt_unfamiliar?: number;
        review_count?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "保存复习进度失败");
      }
      setReviewedIds(new Set(data.reviewed_catalog_ids ?? []));
      if (data.catalog_id != null && data.catalog_id > 0) {
        const updatedId = data.catalog_id;
        setCatalog((prev) =>
          prev.map((row) =>
            row.id === updatedId
              ? {
                  ...row,
                  review_cnt_familiar:
                    data.review_cnt_familiar ?? row.review_cnt_familiar,
                  review_cnt_unfamiliar:
                    data.review_cnt_unfamiliar ?? row.review_cnt_unfamiliar,
                  review_count: data.review_count ?? row.review_count,
                }
              : row
          )
        );
      }
      await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);

      const nextIndex = session.currentIndex + 1;
      if (nextIndex >= session.catalogIds.length) {
        clearKoPronReviewInterruptedSession();
        setInterrupted(null);
        setSession(null);
      } else {
        const nextSession = { ...session, currentIndex: nextIndex };
        persistKoPronReviewSessionBreakpoint(nextSession);
        setInterrupted(nextSession);
        setSession(nextSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearInterval(timer);
      setSaveBusy(false);
      setSavePercent(null);
      setSaveQueued(false);
    }
  };

  const clearProgress = async () => {
    if (!window.confirm("确定清除本轮复习进度吗？总复习次数会保留，字母仍留在复习池。")) return;
    setError("");
    try {
      const res = await fetch("/api/ko-pron/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reviewed_catalog_ids?: number[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "清除失败");
      }
      setReviewedIds(new Set(data.reviewed_catalog_ids ?? []));
      clearKoPronReviewInterruptedSession();
      setInterrupted(null);
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (checking) {
    return <p className="ko-pron-review-status">正在检查登录状态…</p>;
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title="登录 · 韩语发音复习"
        subtitle="请登录后复习已加入的韩语字母。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  if (!canAccessKoPronAdminPage) {
    return <p className="ko-pron-review-status">无权限访问韩语发音复习。</p>;
  }

  const canContinue = Boolean(interrupted && !session);

  return (
    <div className="ko-pron-review-page">
      <div className="ko-pron-review-toolbar">
        <h1 className="ko-pron-review-title">韩语发音复习</h1>
        <div className="ko-pron-review-stats">
          <span>复习池 {catalog.length} 条</span>
          <span>
            已复习 {reviewedInPool} / {catalog.length}
          </span>
        </div>
      </div>

      <p className="ko-pron-review-hint">
        先只看字母猜读音，点「显示读音」后再选「熟悉」或「不熟悉」。误关卡片后可用「继续复习」从断点接着（如第 4 张）；「重新开始复习」会重洗未完成队列。清除本轮进度不清总次数。
      </p>

      {error ? <p className="ko-pron-review-error">{error}</p> : null}
      {loading ? <p className="ko-pron-review-status">加载中…</p> : null}

      {!loading && !catalog.length ? (
        <p className="ko-pron-review-empty">
          复习池为空。请到{" "}
          <Link href={koPronSelectPath()} className="ko-pron-review-link">
            韩语发音勾选
          </Link>{" "}
          批量加入复习。
        </p>
      ) : null}

      {!loading && catalog.length > 0 ? (
        <>
          <div className="ko-pron-review-actions-bar">
            <button
              type="button"
              className="ko-pron-review-start"
              onClick={restartReview}
              disabled={Boolean(session)}
            >
              重新开始复习
            </button>
            {canContinue ? (
              <button
                type="button"
                className="ko-pron-review-start ko-pron-review-start--secondary"
                onClick={continueReview}
                disabled={Boolean(session)}
              >
                继续复习
                {interrupted
                  ? `（第 ${interrupted.currentIndex + 1}/${interrupted.catalogIds.length} 张）`
                  : ""}
              </button>
            ) : null}
            {reviewedInPool > 0 ? (
              <button
                type="button"
                className="ko-pron-review-clear"
                onClick={() => {
                  void clearProgress();
                }}
                disabled={Boolean(session) || saveBusy}
              >
                清除本轮进度
              </button>
            ) : null}
          </div>

          {saveBusy && !session ? (
            <JpVocabSaveProgressBar
              label={saveQueued ? "排队同步中…" : "正在保存复习进度…"}
              percent={
                savePercent != null
                  ? savePercent
                  : jpVocabSaveProgressDisplayPercent(null)
              }
              fullWidth
            />
          ) : null}

          <div
            className="ko-pron-review-table-wrap"
            aria-hidden={session ? true : undefined}
          >
            <table className="ko-pron-review-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>字母</th>
                  <th>读音</th>
                  <th>分类</th>
                  <th>熟悉</th>
                  <th>不熟悉</th>
                  <th>总复习</th>
                  <th>本轮</th>
                  <th>加入时间</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((item, i) => {
                  const done = reviewedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={done ? "ko-pron-review-row--done" : undefined}
                    >
                      <td>{i + 1}</td>
                      <td className="ko-pron-review-letter-cell">
                        <span>{item.letter}</span>
                        <KoPronLetterCopyButton letter={item.letter} />
                        {/* 复习进行中不渲染发音键，避免未揭示前听到答案 */}
                        {!session ? (
                          <KoPronSpeakButton
                            letter={item.letter}
                            reading={item.reading}
                            variant="compact"
                          />
                        ) : null}
                      </td>
                      {/* 复习进行中隐藏罗马音，防止半透明/漏层剧透 */}
                      <td>{session ? "···" : item.reading}</td>
                      <td>{item.category}</td>
                      <td>{item.review_cnt_familiar ?? 0}</td>
                      <td>{item.review_cnt_unfamiliar ?? 0}</td>
                      <td>{item.review_count ?? 0}</td>
                      <td>{done ? "已复习" : "未复习"}</td>
                      <td>
                        {item.review_selected_at
                          ? formatBeijingDateTime(item.review_selected_at)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <KoPronReviewFlashcardModal
        open={Boolean(session && currentLetter)}
        letter={currentLetter}
        index={session?.currentIndex ?? 0}
        total={session?.catalogIds.length ?? 0}
        saveBusy={saveBusy}
        savePercent={savePercent}
        saveQueued={saveQueued}
        onFamiliarity={(familiarity) => {
          void goNext(familiarity);
        }}
        onClose={closeSession}
      />

      <style jsx>{`
        .ko-pron-review-page {
          max-width: 72rem;
          margin: 0 auto;
          padding: 1.25rem 1rem 2.5rem;
          color: var(--text);
        }
        .ko-pron-review-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ko-pron-review-title {
          margin: 0;
          font-size: 1.4rem;
        }
        .ko-pron-review-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-review-hint {
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
          margin: 0 0 1rem;
        }
        .ko-pron-review-error {
          color: #f87171;
        }
        .ko-pron-review-status,
        .ko-pron-review-empty {
          color: var(--muted);
        }
        .ko-pron-review-link {
          color: color-mix(in srgb, var(--accent) 85%, #fdba74);
        }
        .ko-pron-review-actions-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem 0.75rem;
          margin-bottom: 0.85rem;
        }
        .ko-pron-review-start {
          border: none;
          border-radius: 0.5rem;
          padding: 0.45rem 0.9rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .ko-pron-review-start--secondary {
          background: color-mix(in srgb, #f97316 55%, #0ea5e9);
        }
        .ko-pron-review-start:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ko-pron-review-clear {
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-size: 0.85rem;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .ko-pron-review-clear:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ko-pron-review-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: var(--panel);
        }
        .ko-pron-review-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .ko-pron-review-table th,
        .ko-pron-review-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: middle;
        }
        .ko-pron-review-table th {
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          font-weight: 600;
          color: var(--muted);
          white-space: nowrap;
        }
        .ko-pron-review-row--done td {
          color: var(--muted);
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }
        .ko-pron-review-letter-cell {
          white-space: nowrap;
          font-weight: 700;
          font-size: 1.25rem;
        }
      `}</style>
    </div>
  );
}
