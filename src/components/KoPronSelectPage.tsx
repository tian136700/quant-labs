"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
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
  type KoPronCategoryFilter,
} from "@/lib/ko-pron-search";
import type { KoPronCatalogLetter } from "@/lib/types";

export function KoPronSelectPage() {
  const { user, checking, canAccessKoPronAdminPage, setUser } = useEtrAuth();
  const [catalog, setCatalog] = useState<KoPronCatalogLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<KoPronCategoryFilter>("all");
  const [saveBusyId, setSaveBusyId] = useState<number | null>(null);
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

  useEffect(() => () => clearProgressTimer(), []);

  const searchActive = searchQuery.trim().length > 0;
  const filterActive = searchActive || categoryFilter !== "all";
  const displayLetters = useMemo(
    () => filterKoPronLettersBySearch(catalog, searchQuery, categoryFilter),
    [catalog, searchQuery, categoryFilter]
  );

  const selectedCount = catalog.filter((c) => c.selected_at).length;

  const selectLetter = async (item: KoPronCatalogLetter) => {
    if (item.selected_at || saveBusyId != null) return;
    setError("");
    setSaveBusyId(item.id);
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
        body: JSON.stringify({ action: "select", catalog_id: item.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        catalog?: KoPronCatalogLetter;
      };
      if (!res.ok || !data.ok || !data.catalog) {
        throw new Error(data.error || "勾选失败");
      }
      setCatalog((prev) =>
        prev.map((row) => (row.id === item.id ? data.catalog! : row))
      );
      await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearProgressTimer();
      setSaveBusyId(null);
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

  return (
    <div className="ko-pron-select-page">
      <div className="ko-pron-select-toolbar">
        <h1 className="ko-pron-select-title">韩语发音勾选</h1>
        <div className="ko-pron-select-stats">
          <span>共 {catalog.length} 条</span>
          <span>已勾选 {selectedCount} 条</span>
        </div>
      </div>

      <p className="ko-pron-select-hint">
        勾选表示学生已背过该字母，会立刻进入「韩语发音抽问」管理员端列表；同日勾选的字母次日才进入老师今日抽查池。勾选后不可取消。
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
                    <th>字母</th>
                    <th>读音</th>
                    <th>说明</th>
                    <th>分类</th>
                    <th>勾选状态</th>
                    <th>勾选时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLetters.map((item) => {
                    const selected = Boolean(item.selected_at);
                    const busy = saveBusyId === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={
                          selected ? "ko-pron-select-row--done" : undefined
                        }
                      >
                        <td className="ko-pron-select-letter-cell">
                          <span className="ko-pron-select-glyph">
                            {item.letter}
                          </span>
                          <KoPronSpeakButton
                            letter={item.letter}
                            reading={item.reading}
                            variant="compact"
                          />
                        </td>
                        <td>{item.reading}</td>
                        <td>{item.meaning}</td>
                        <td>{item.category}</td>
                        <td>{selected ? "已勾选" : "未勾选"}</td>
                        <td>
                          {item.selected_at
                            ? formatBeijingDateTime(item.selected_at)
                            : "—"}
                        </td>
                        <td>
                          {selected ? (
                            <span className="ko-pron-select-done-label">
                              已勾选
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="ko-pron-select-btn"
                              disabled={busy || saveBusyId != null}
                              onClick={() => {
                                void selectLetter(item);
                              }}
                            >
                              勾选
                            </button>
                          )}
                          {busy ? (
                            <JpVocabSaveProgressBar
                              label={
                                saveQueued ? "排队同步中…" : "正在勾选入库…"
                              }
                              percent={
                                savePercent != null
                                  ? savePercent
                                  : jpVocabSaveProgressDisplayPercent(null)
                              }
                            />
                          ) : null}
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
        .ko-pron-select-letter-cell {
          white-space: nowrap;
          font-weight: 700;
          font-size: 1.25rem;
        }
        .ko-pron-select-glyph {
          vertical-align: middle;
        }
        .ko-pron-select-btn {
          border: none;
          border-radius: 0.5rem;
          padding: 0.4rem 0.75rem;
          background: #f97316;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .ko-pron-select-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ko-pron-select-done-label {
          color: var(--fall);
          font-weight: 600;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
