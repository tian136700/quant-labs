"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { KoPronLetterCopyButton } from "@/components/KoPronLetterCopyButton";
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
  filterKoPronLettersBySearch,
  KO_PRON_CATEGORIES,
  readStoredKoPronSelectCategoryFilter,
  writeStoredKoPronSelectCategoryFilter,
  type KoPronCategoryFilter,
} from "@/lib/ko-pron-search";
import type { KoPronCatalogLetter } from "@/lib/types";

type BatchKind = "quiz" | "review";

function membershipLabel(item: KoPronCatalogLetter): string {
  const inQuiz = Boolean(item.selected_at);
  const inReview = Boolean(item.review_selected_at);
  if (inQuiz && inReview) return "已入抽问·已入复习";
  if (inQuiz) return "已入抽问";
  if (inReview) return "已入复习";
  return "未入库";
}

export function KoPronSelectPage() {
  const { user, checking, canAccessKoPronAdminPage, setUser } = useEtrAuth();
  const [catalog, setCatalog] = useState<KoPronCatalogLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<KoPronCategoryFilter>(
    () => readStoredKoPronSelectCategoryFilter()
  );
  /** 本地多选；提交时按按钮过滤对应池 */
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveBatchSize, setSaveBatchSize] = useState(0);
  const [saveKind, setSaveKind] = useState<BatchKind | null>(null);
  const [savePercent, setSavePercent] = useState<number | null>(null);
  const [saveQueued, setSaveQueued] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/ko-pron/select", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        catalog?: KoPronCatalogLetter[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      setCatalog(data.catalog ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !user || !canAccessKoPronAdminPage) return;
    void loadCatalog();
  }, [checking, user, canAccessKoPronAdminPage, loadCatalog]);

  useEffect(() => {
    writeStoredKoPronSelectCategoryFilter(categoryFilter);
  }, [categoryFilter]);

  useEffect(() => () => clearProgressTimer(), []);

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || categoryFilter !== "all";
  const displayLetters = useMemo(
    () => filterKoPronLettersBySearch(catalog, searchQuery, categoryFilter),
    [catalog, searchQuery, categoryFilter]
  );

  const quizSelectedCount = catalog.filter((c) => c.selected_at).length;
  const reviewSelectedCount = catalog.filter(
    (c) => c.review_selected_at
  ).length;

  /** 还能入抽问或复习任一池的可见行 */
  const selectableVisible = useMemo(
    () =>
      displayLetters.filter(
        (c) => !c.selected_at || !c.review_selected_at
      ),
    [displayLetters]
  );
  const checkedVisibleCount = useMemo(
    () => selectableVisible.filter((c) => checkedIds.has(c.id)).length,
    [selectableVisible, checkedIds]
  );
  const allVisibleChecked =
    selectableVisible.length > 0 &&
    checkedVisibleCount === selectableVisible.length;
  const someVisibleChecked =
    checkedVisibleCount > 0 && !allVisibleChecked;
  const pendingCount = checkedIds.size;

  const quizPendingIds = useMemo(
    () =>
      [...checkedIds].filter((id) => {
        const row = catalog.find((c) => c.id === id);
        return row && !row.selected_at;
      }),
    [checkedIds, catalog]
  );
  const reviewPendingIds = useMemo(
    () =>
      [...checkedIds].filter((id) => {
        const row = catalog.find((c) => c.id === id);
        return row && !row.review_selected_at;
      }),
    [checkedIds, catalog]
  );

  const toggleChecked = (id: number, next: boolean) => {
    setCheckedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const toggleAllVisible = (next: boolean) => {
    setCheckedIds((prev) => {
      const copy = new Set(prev);
      for (const row of selectableVisible) {
        if (next) copy.add(row.id);
        else copy.delete(row.id);
      }
      return copy;
    });
  };

  const selectCheckedBatch = async (kind: BatchKind) => {
    const ids = kind === "quiz" ? quizPendingIds : reviewPendingIds;
    if (!ids.length || saveBusy) return;

    setError("");
    setSaveBusy(true);
    setSaveKind(kind);
    setSaveBatchSize(ids.length);
    setSaveQueued(true);
    setSavePercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const startedAt = Date.now();
    clearProgressTimer();
    progressTimerRef.current = setInterval(() => {
      setSaveQueued(false);
      setSavePercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);

    try {
      const res = await fetch("/api/ko-pron/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind === "quiz" ? "select" : "select_review",
          catalog_ids: ids,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        catalog?: KoPronCatalogLetter[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || (kind === "quiz" ? "批量加入抽问失败" : "批量加入复习失败")
        );
      }
      const updated = data.catalog ?? [];
      if (updated.length) {
        const byId = new Map(updated.map((row) => [row.id, row]));
        setCatalog((prev) => prev.map((row) => byId.get(row.id) ?? row));
        setCheckedIds((prev) => {
          const copy = new Set(prev);
          for (const id of ids) {
            const nextRow = byId.get(id);
            if (nextRow?.selected_at && nextRow.review_selected_at) {
              copy.delete(id);
            }
          }
          return copy;
        });
      }
      await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearProgressTimer();
      setSaveBusy(false);
      setSaveBatchSize(0);
      setSaveKind(null);
      setSavePercent(null);
      setSaveQueued(false);
    }
  };

  if (checking) {
    return <p className="ko-pron-select-status">正在检查登录状态…</p>;
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title="登录 · 韩语发音勾选"
        subtitle="请登录后勾选已背过的韩语字母。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  if (!canAccessKoPronAdminPage) {
    return <p className="ko-pron-select-status">无权限访问韩语发音勾选。</p>;
  }

  const progressLabel =
    saveKind === "review"
      ? `正在批量加入复习（${saveBatchSize}）…`
      : `正在批量加入抽问（${saveBatchSize}）…`;

  return (
    <div className="ko-pron-select-page">
      <div className="ko-pron-select-toolbar">
        <h1 className="ko-pron-select-title">韩语发音勾选</h1>
        <div className="ko-pron-select-stats">
          <span>共 {catalog.length} 条</span>
          <span>已入抽问 {quizSelectedCount} 条</span>
          <span>已入复习 {reviewSelectedCount} 条</span>
          {pendingCount > 0 ? <span>已选 {pendingCount} 条</span> : null}
        </div>
      </div>

      <p className="ko-pron-select-hint">
        先勾选多条（可全选当前筛选结果），再选「批量加入抽问」或「批量加入复习」。两池独立，同一字母可两边都进。抽问：立刻进入「韩语发音抽问」管理员端，同日勾选次日才进老师今日抽查池。复习：进入「韩语发音复习」自测读音。入库后不可取消。
      </p>

      {error ? <p className="ko-pron-select-error">{error}</p> : null}
      {loading ? <p className="ko-pron-select-status">加载中…</p> : null}

      {!loading ? (
        <>
          <div className="ko-pron-select-search" role="search">
            <label
              htmlFor="ko-pron-select-search"
              className="ko-pron-select-search__label"
            >
              搜索
            </label>
            <div className="ko-pron-select-search__row">
              <select
                id="ko-pron-select-category"
                className="ko-pron-select-search__category"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as KoPronCategoryFilter)
                }
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
                id="ko-pron-select-search"
                type="search"
                className="ko-pron-select-search__input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="字母、读音、说明…（本地即时）"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {filterActive ? (
              <>
                <button
                  type="button"
                  className="ko-pron-select-search__clear"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("all");
                  }}
                >
                  清除
                </button>
                <span className="ko-pron-select-search__meta">
                  匹配 {displayLetters.length} / {catalog.length} 条
                </span>
              </>
            ) : null}
          </div>

          <div className="ko-pron-select-batch-bar">
            <button
              type="button"
              className="ko-pron-select-btn"
              disabled={quizPendingIds.length < 1 || saveBusy}
              onClick={() => {
                void selectCheckedBatch("quiz");
              }}
            >
              {quizPendingIds.length > 0
                ? `批量加入抽问（${quizPendingIds.length}）`
                : "批量加入抽问"}
            </button>
            <button
              type="button"
              className="ko-pron-select-btn ko-pron-select-btn--secondary"
              disabled={reviewPendingIds.length < 1 || saveBusy}
              onClick={() => {
                void selectCheckedBatch("review");
              }}
            >
              {reviewPendingIds.length > 0
                ? `批量加入复习（${reviewPendingIds.length}）`
                : "批量加入复习"}
            </button>
            {pendingCount > 0 && !saveBusy ? (
              <button
                type="button"
                className="ko-pron-select-batch-clear"
                onClick={() => setCheckedIds(new Set())}
              >
                清空已选
              </button>
            ) : null}
            {saveBusy ? (
              <div className="ko-pron-select-batch-progress">
                <JpVocabSaveProgressBar
                  label={saveQueued ? "排队同步中…" : progressLabel}
                  percent={
                    savePercent != null
                      ? savePercent
                      : jpVocabSaveProgressDisplayPercent(null)
                  }
                  fullWidth
                />
              </div>
            ) : null}
          </div>

          {filterActive && !displayLetters.length ? (
            <p className="ko-pron-select-empty">
              {searchActive
                ? `没有匹配「${searchQuery.trim()}」的字母。`
                : `当前没有「${categoryFilter}」分类的字母。`}
            </p>
          ) : (
            <div className="ko-pron-select-table-wrap">
              <table className="ko-pron-select-table">
                <thead>
                  <tr>
                    <th className="ko-pron-select-check-col">
                      <input
                        type="checkbox"
                        className="ko-pron-select-check"
                        checked={allVisibleChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleChecked;
                        }}
                        disabled={
                          selectableVisible.length < 1 || saveBusy
                        }
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        aria-label="全选当前列表可入库字母"
                        title="全选当前列表可入库字母"
                      />
                    </th>
                    <th>字母</th>
                    <th>读音</th>
                    <th>说明</th>
                    <th>分类</th>
                    <th>入库状态</th>
                    <th>抽问时间</th>
                    <th>复习时间</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLetters.map((item) => {
                    const inQuiz = Boolean(item.selected_at);
                    const inReview = Boolean(item.review_selected_at);
                    const bothDone = inQuiz && inReview;
                    const checked = checkedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={
                          bothDone
                            ? "ko-pron-select-row--done"
                            : checked
                              ? "ko-pron-select-row--pending"
                              : undefined
                        }
                      >
                        <td className="ko-pron-select-check-col">
                          {bothDone ? (
                            <span
                              className="ko-pron-select-check-done"
                              aria-hidden
                            >
                              ✓
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              className="ko-pron-select-check"
                              checked={checked}
                              disabled={saveBusy}
                              onChange={(e) =>
                                toggleChecked(item.id, e.target.checked)
                              }
                              aria-label={`选择 ${item.letter}`}
                            />
                          )}
                        </td>
                        <td className="ko-pron-select-letter-cell">
                          <span className="ko-pron-select-glyph">
                            {item.letter}
                          </span>
                          <KoPronLetterCopyButton letter={item.letter} />
                          <KoPronSpeakButton
                            letter={item.letter}
                            reading={item.reading}
                            variant="compact"
                          />
                        </td>
                        <td>{item.reading}</td>
                        <td>{item.meaning}</td>
                        <td>{item.category}</td>
                        <td>{membershipLabel(item)}</td>
                        <td>
                          {item.selected_at
                            ? formatBeijingDateTime(item.selected_at)
                            : "—"}
                        </td>
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
          )}
        </>
      ) : null}

      <style jsx>{`
        .ko-pron-select-page {
          max-width: 72rem;
          margin: 0 auto;
          padding: 1.25rem 1rem 2.5rem;
          color: var(--text);
        }
        .ko-pron-select-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ko-pron-select-title {
          margin: 0;
          font-size: 1.4rem;
          color: var(--text);
        }
        .ko-pron-select-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .ko-pron-select-hint {
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.5;
          margin: 0 0 1rem;
        }
        .ko-pron-select-error {
          color: #f87171;
        }
        .ko-pron-select-status {
          color: var(--muted);
        }
        .ko-pron-select-search {
          margin-bottom: 0.85rem;
        }
        .ko-pron-select-search__label {
          display: block;
          font-size: 0.8rem;
          color: var(--muted);
          margin-bottom: 0.35rem;
        }
        .ko-pron-select-search__row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .ko-pron-select-search__category,
        .ko-pron-select-search__input {
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          padding: 0.45rem 0.65rem;
          font-size: 0.9rem;
          background: var(--panel);
          color: var(--text);
        }
        .ko-pron-select-search__category option {
          background: var(--panel);
          color: var(--text);
        }
        .ko-pron-select-search__category:focus,
        .ko-pron-select-search__input:focus {
          outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
          border-color: var(--accent);
        }
        .ko-pron-select-search__input {
          flex: 1 1 12rem;
          min-width: 10rem;
        }
        .ko-pron-select-search__input::placeholder {
          color: var(--muted);
        }
        .ko-pron-select-search__clear {
          margin-top: 0.45rem;
          margin-right: 0.75rem;
          border: none;
          background: transparent;
          color: color-mix(in srgb, var(--accent) 85%, #fdba74);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
        }
        .ko-pron-select-search__meta {
          font-size: 0.8rem;
          color: var(--muted);
        }
        .ko-pron-select-batch-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.65rem 0.75rem;
          margin-bottom: 0.85rem;
        }
        .ko-pron-select-batch-clear {
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .ko-pron-select-batch-progress {
          flex: 1 1 12rem;
          min-width: 10rem;
        }
        .ko-pron-select-empty {
          color: var(--muted);
          padding: 1rem 0;
        }
        .ko-pron-select-table-wrap {
          overflow-x: auto;
          overflow-y: clip;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: var(--panel);
        }
        .ko-pron-select-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          color: var(--text);
        }
        .ko-pron-select-table th,
        .ko-pron-select-table td {
          padding: 0.55rem 0.65rem;
          border-bottom: 1px solid var(--border);
          text-align: left;
          vertical-align: middle;
          color: var(--text);
          background: transparent;
        }
        .ko-pron-select-table th {
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
          font-weight: 600;
          color: var(--muted);
          white-space: nowrap;
        }
        .ko-pron-select-table tbody tr:hover td {
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
        }
        .ko-pron-select-row--done td {
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: var(--muted);
        }
        .ko-pron-select-row--pending td {
          background: color-mix(in srgb, #f97316 12%, var(--panel));
        }
        .ko-pron-select-check-col {
          width: 2.25rem;
          text-align: center;
        }
        .ko-pron-select-check {
          width: 1.05rem;
          height: 1.05rem;
          accent-color: #f97316;
          cursor: pointer;
        }
        .ko-pron-select-check:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .ko-pron-select-check-done {
          color: var(--fall);
          font-weight: 700;
        }
        .ko-pron-select-letter-cell {
          white-space: nowrap;
          font-weight: 700;
          font-size: 1.25rem;
        }
        .ko-pron-select-glyph {
          vertical-align: middle;
          margin-right: 0.35rem;
        }
        .ko-pron-select-btn {
          border: none;
          border-radius: 0.5rem;
          padding: 0.45rem 0.9rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .ko-pron-select-btn--secondary {
          background: color-mix(in srgb, #f97316 55%, #0ea5e9);
        }
        .ko-pron-select-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
