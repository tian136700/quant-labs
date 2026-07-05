"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { jpVocabRefViewerPath } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabLevel, JpVocabRef, JpVocabSharedItem } from "@/lib/types";

const LEVELS: { key: JpVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

const POLL_MS = 3000;
const POLL_HIDDEN_MS = 10000;

export function JpVocabStudyPage() {
  const { locale } = useI18n();
  const { user, checking, openAuthPanel } = useEtrAuth();
  const [items, setItems] = useState<JpVocabSharedItem[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [shareDate, setShareDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollInFlightRef = useRef(false);

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 今日背单词",
      subtitle: "登录后可查看老师共享的单词。",
    });
  }, [openAuthPanel]);

  const loadShared = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch("/api/jp-vocab/shared", {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok: boolean;
        items?: JpVocabSharedItem[];
        refs?: Record<string, JpVocabRef>;
        share_date?: string;
        error?: string;
      };
      if (res.status === 401) {
        setItems([]);
        setRefs({});
        setShareDate(beijingDateString());
        setError("");
        return;
      }
      if (!data.ok || !data.items) {
        throw new Error(data.error || "加载失败");
      }
      setItems(data.items);
      setRefs(data.refs ?? {});
      setShareDate(data.share_date ?? beijingDateString());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      pollInFlightRef.current = false;
    }
  }, [locale]);

  useEffect(() => {
    void loadShared();
  }, [loadShared]);

  useEffect(() => {
    if (!user) return;
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
  }, [user, loadShared]);

  const loggedIn = Boolean(user);

  return (
    <main
      className="page-wrap jp-vocab-page jp-vocab-study-page"
      style={{ maxWidth: "min(980px, 96vw)", paddingTop: "1.5rem" }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>今日背单词</h1>
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        老师在抽问时共享的单词会出现在这里，方便课后复习。每日北京时间 0 点自动清空。
      </p>

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
          </button>{" "}
          后查看今日共享单词。
        </p>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
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

        {loading && loggedIn ? (
          <p className="empty">加载中…</p>
        ) : !loggedIn ? null : items.length === 0 ? (
          <p className="empty">今日暂无共享单词。</p>
        ) : (
          <div className="jp-vocab-table-wrap">
            <table className="jp-vocab-table">
              <thead>
                <tr>
                  <th className="jp-vocab-seq-col">序号</th>
                  <th className="jp-vocab-kind-col">类型</th>
                  <th className="jp-vocab-word-col">单词 / 语法</th>
                  <th className="jp-vocab-reading-col">读音</th>
                  <th className="jp-vocab-meaning-col">释义</th>
                  <th className="jp-vocab-pos-col">词性</th>
                  <th className="jp-vocab-level-col">熟悉程度</th>
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

                  return (
                    <tr key={item.id}>
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
                              <a
                                href={jpVocabRefViewerPath(w.ref_key, ref?.updated_at)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="jp-vocab-word-link"
                                title={ref?.title ? `教案：${ref.title}` : "查看教案"}
                              >
                                {w.word}
                              </a>
                              <span className="jp-vocab-ref-hint">（点击可进入教案）</span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <style jsx global>{`
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
      `}</style>
    </main>
  );
}
