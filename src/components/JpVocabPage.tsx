"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { SITE_URL } from "@/lib/site";
import { sortJpVocabWords } from "@/lib/jp-vocab-db";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

function totalReviews(word: JpVocabWord): number {
  return word.cnt_very + word.cnt_normal + word.cnt_weak;
}

function needsReview(word: JpVocabWord): boolean {
  const total = totalReviews(word);
  if (total === 0) return true;
  return word.cnt_weak >= word.cnt_very;
}

function pickRandomWord(words: JpVocabWord[], excludeId?: number): JpVocabWord | null {
  if (!words.length) return null;
  const pool =
    excludeId != null && words.length > 1
      ? words.filter((w) => w.id !== excludeId)
      : words;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function bumpWordLevel(word: JpVocabWord, level: JpVocabLevel): JpVocabWord {
  return {
    ...word,
    cnt_very: level === "very" ? word.cnt_very + 1 : word.cnt_very,
    cnt_normal: level === "normal" ? word.cnt_normal + 1 : word.cnt_normal,
    cnt_weak: level === "weak" ? word.cnt_weak + 1 : word.cnt_weak,
  };
}

function decrementWordLevel(word: JpVocabWord, level: JpVocabLevel): JpVocabWord {
  return {
    ...word,
    cnt_very: level === "very" ? Math.max(0, word.cnt_very - 1) : word.cnt_very,
    cnt_normal:
      level === "normal" ? Math.max(0, word.cnt_normal - 1) : word.cnt_normal,
    cnt_weak: level === "weak" ? Math.max(0, word.cnt_weak - 1) : word.cnt_weak,
  };
}

type SaveJob = { wordId: number; level: JpVocabLevel };

export function JpVocabPage() {
  const { user, checking, canAccessJpVocab, setUser, logout } = useEtrAuth();
  const canOperate = canAccessJpVocab;
  const [showAuth, setShowAuth] = useState(false);
  const [words, setWords] = useState<JpVocabWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  /** 本轮复习：每词当前勾选（仅前端，重置后清空） */
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});
  const saveQueueRef = useRef<SaveJob[]>([]);
  const drainingRef = useRef(false);

  const loadWords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/jp-vocab", { credentials: "include" });
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        error?: string;
      };
      if (!data.ok || !data.words) {
        throw new Error(data.error || "加载失败");
      }
      setWords(sortJpVocabWords(data.words));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  const reviewCandidates = useMemo(
    () => words.filter((w) => needsReview(w)),
    [words]
  );

  const unmarkedCount = useMemo(
    () => words.filter((w) => !sessionLevel[w.id]).length,
    [words, sessionLevel]
  );

  const applyWordUpdate = useCallback((updated: JpVocabWord) => {
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  const drainSaveQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;

    try {
      while (saveQueueRef.current.length > 0) {
        const job = saveQueueRef.current[0];
        try {
          const res = await fetch("/api/jp-vocab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ word_id: job.wordId, level: job.level }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            error?: string;
          };
          if (!data.ok || !data.word) {
            throw new Error(data.error || "保存失败");
          }
          applyWordUpdate(data.word);
          saveQueueRef.current.shift();
        } catch (err) {
          saveQueueRef.current.shift();
          setWords((prev) =>
            prev.map((w) =>
              w.id === job.wordId ? decrementWordLevel(w, job.level) : w
            )
          );
          setSessionLevel((prev) => {
            if (prev[job.wordId] !== job.level) return prev;
            const next = { ...prev };
            delete next[job.wordId];
            return next;
          });
          setStatus(err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      drainingRef.current = false;
      if (saveQueueRef.current.length > 0) {
        void drainSaveQueue();
      }
    }
  }, [applyWordUpdate]);

  const recordLevel = useCallback(
    (wordId: number, level: JpVocabLevel) => {
      if (!canOperate) {
        setStatus("请登录后再勾选熟悉程度。");
        setShowAuth(true);
        return;
      }

      setSessionLevel((prev) => ({ ...prev, [wordId]: level }));
      setHighlightId(wordId);
      setStatus("");
      setWords((prev) =>
        prev.map((w) => (w.id === wordId ? bumpWordLevel(w, level) : w))
      );

      saveQueueRef.current.push({ wordId, level });
      void drainSaveQueue();
    },
    [canOperate, drainSaveQueue]
  );

  const waitForSaveQueueIdle = async () => {
    while (drainingRef.current || saveQueueRef.current.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };

  const resetAll = async () => {
    if (!canOperate) {
      setStatus("请登录后再重置。");
      setShowAuth(true);
      return;
    }
    if (resetting) return;
    const ok = window.confirm(
      "确定全部重置？将清空所有单词的熟悉程度勾选与统计次数，开始新一轮复习。"
    );
    if (!ok) return;

    await waitForSaveQueueIdle();
    saveQueueRef.current = [];

    setResetting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "reset" }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        error?: string;
      };
      if (!data.ok || !data.words) {
        throw new Error(data.error || "重置失败");
      }
      setWords(sortJpVocabWords(data.words));
      setSessionLevel({});
      setHighlightId(null);
      setStatus("已全部重置，可以开始新一轮复习。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
    }
  };

  const pickNext = () => {
    const next = pickRandomWord(words, highlightId ?? undefined);
    if (next) {
      setHighlightId(next.id);
      document
        .getElementById(`jp-vocab-row-${next.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <main className="page-wrap" style={{ maxWidth: "1100px", paddingTop: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "0.35rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>日语单词抽问</h1>
        {canOperate && user ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              {user.username} · {user.expires_hint}
            </span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void logout()}
            >
              退出登录
            </button>
          </div>
        ) : user ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{user.username}</span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void logout()}
            >
              退出登录
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              onClick={() => setShowAuth(true)}
            >
              换账号登录
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
            onClick={() => setShowAuth((v) => !v)}
            disabled={checking}
          >
            {checking ? "验证中…" : "登录后操作"}
          </button>
        )}
      </div>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        扫一眼单词表，学生回答后直接在右侧勾选熟悉程度；不熟悉次数多的词会标为需复习。
      </p>

      {!canOperate ? (
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
          {user?.role === "user"
            ? "当前为浏览模式。您已登录的账号无权修改数据，请使用 LiLaoshi 或管理员账号。"
            : "当前为浏览模式，可查看单词表；勾选熟悉程度与全部重置需登录。"}
        </p>
      ) : null}

      {showAuth && !canOperate ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <TeacherReviewAuth
            loginOnly
            variant="inline"
            title="登录 · 日语单词"
            subtitle="使用 LiLaoshi（李老师）或管理员账号登录后可操作。"
            onClose={() => setShowAuth(false)}
            onAuthenticated={(next) => {
              setUser(next);
              setShowAuth(false);
              setStatus("");
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      <section className="section etr-panel" aria-label="单词表">
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
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>单词表</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              共 {words.length} 词 · 需复习 {reviewCandidates.length} 词
              {canOperate ? <> · 本轮未勾选 {unmarkedCount}</> : null}
            </span>
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={() => pickNext()}
              disabled={loading || words.length < 2}
            >
              随机高亮
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--danger"
              onClick={() => void resetAll()}
              disabled={loading || resetting || !words.length || !canOperate}
              title={canOperate ? undefined : "登录后可重置"}
            >
              {resetting ? "重置中…" : "全部重置"}
            </button>
          </div>
        </div>

        {status ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {status}
          </p>
        ) : null}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : !words.length ? (
          <p style={{ color: "var(--muted)" }}>暂无单词，请通过 API 上传。</p>
        ) : (
          <div className="etr-table-wrap" style={{ display: "block" }}>
            <table className="compare-table etr-table jp-vocab-table">
              <thead>
                <tr>
                  <th rowSpan={2}>单词</th>
                  <th rowSpan={2}>释义</th>
                  <th rowSpan={2} className="jp-vocab-level-col">
                    熟悉程度
                  </th>
                  <th colSpan={4} className="jp-vocab-stats-group">
                    复习次数统计
                  </th>
                  <th rowSpan={2}>状态</th>
                </tr>
                <tr>
                  <th>非常熟悉</th>
                  <th>一般</th>
                  <th>不熟悉</th>
                  <th>合计</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => {
                  const review = needsReview(w);
                  const isHighlight = highlightId === w.id;
                  const selected = sessionLevel[w.id];

                  return (
                    <tr
                      key={w.id}
                      id={`jp-vocab-row-${w.id}`}
                      style={{
                        background: isHighlight
                          ? "rgba(61, 139, 253, 0.12)"
                          : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 500 }}>{w.word}</td>
                      <td style={{ color: "var(--muted)" }}>{w.meaning || "—"}</td>
                      <td className="jp-vocab-level-col">
                        <div
                          className="jp-vocab-levels"
                          role="group"
                          aria-label={`${w.word} 熟悉程度`}
                        >
                          {LEVELS.map((lv) => {
                            const checked = selected === lv.key;
                            return (
                              <button
                                key={lv.key}
                                type="button"
                                className={`jp-vocab-level-opt${
                                  checked ? " is-checked" : ""
                                }${!canOperate ? " jp-vocab-level-opt--readonly" : ""}${
                                  lv.key === "very" ? " jp-vocab-level-opt--very" : ""
                                }${
                                  lv.key === "weak" ? " jp-vocab-level-opt--weak" : ""
                                }`}
                                disabled={!canOperate}
                                title={canOperate ? undefined : "登录后可勾选"}
                                aria-pressed={checked}
                                onClick={() => recordLevel(w.id, lv.key)}
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
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="chg-dn">{w.cnt_very}</td>
                      <td>{w.cnt_normal}</td>
                      <td className="chg-up">{w.cnt_weak}</td>
                      <td>{totalReviews(w)}</td>
                      <td>
                        {!selected ? (
                          <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                            未勾选
                          </span>
                        ) : review ? (
                          <span className="chg-up" style={{ fontSize: "0.8125rem" }}>
                            需复习
                          </span>
                        ) : (
                          <span className="chg-dn" style={{ fontSize: "0.8125rem" }}>
                            良好
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
          API 上传说明
        </summary>
        <p style={{ marginTop: "0.5rem" }}>
          固定链接：<code>{SITE_URL}/jp-vocab</code>
        </p>
        <p>
          上传接口：<code>POST /api/jp-vocab/upload</code>，Header{" "}
          <code>Authorization: Bearer &lt;JP_REVIEW_UPLOAD_TOKEN&gt;</code>
          （与日语 PDF 上传共用）
        </p>
        <pre
          style={{
            overflow: "auto",
            padding: "0.75rem",
            background: "var(--panel)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
{`{
  "replace": false,
  "words": [
    { "word": "こんにちは", "meaning": "你好" },
    { "word": "勉強", "reading": "べんきょう", "meaning": "学习" }
  ]
}`}
        </pre>
        <p>
          <code>replace: true</code> 会清空现有单词后重新导入；默认跳过重复单词。
        </p>
      </details>

      <style jsx>{`
        .jp-vocab-levels {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem 0.5rem;
          min-width: 12rem;
        }
        .jp-vocab-level-opt {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          cursor: pointer;
          white-space: nowrap;
          padding: 0.2rem 0.4rem;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          font: inherit;
          line-height: 1.3;
        }
        .jp-vocab-check-box {
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
        .jp-vocab-level-opt.is-checked .jp-vocab-check-box {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 18%, var(--bg));
        }
        .jp-vocab-level-opt--very.is-checked {
          color: var(--fall);
        }
        .jp-vocab-level-opt--very.is-checked .jp-vocab-check-box {
          border-color: var(--fall);
          background: color-mix(in srgb, var(--fall) 18%, var(--bg));
          color: var(--fall);
        }
        .jp-vocab-level-opt--weak.is-checked {
          color: var(--rise);
        }
        .jp-vocab-level-opt--weak.is-checked .jp-vocab-check-box {
          border-color: var(--rise);
          background: color-mix(in srgb, var(--rise) 18%, var(--bg));
          color: var(--rise);
        }
        .jp-vocab-level-opt.is-checked {
          background: rgba(61, 139, 253, 0.08);
        }
        .jp-vocab-level-opt:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.04);
        }
        .jp-vocab-level-opt:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-vocab-level-opt--readonly:disabled {
          opacity: 0.72;
        }
        :global(.jp-vocab-table th),
        :global(.jp-vocab-table td) {
          white-space: normal;
          vertical-align: middle;
        }
        :global(.jp-vocab-table .jp-vocab-level-col) {
          text-align: center;
        }
        :global(.jp-vocab-table .jp-vocab-stats-group) {
          text-align: center;
        }
      `}</style>
    </main>
  );
}
