"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SITE_URL } from "@/lib/site";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

const LEVEL_LABELS: Record<JpVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};

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

export function JpVocabPage() {
  const [words, setWords] = useState<JpVocabWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<JpVocabWord | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [status, setStatus] = useState("");

  const loadWords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/jp-vocab");
      const data = (await res.json()) as {
        ok: boolean;
        words?: JpVocabWord[];
        error?: string;
      };
      if (!data.ok || !data.words) {
        throw new Error(data.error || "加载失败");
      }
      setWords(data.words);
      setCurrent((prev) => {
        if (prev) {
          const updated = data.words!.find((w) => w.id === prev.id);
          return updated ?? pickRandomWord(data.words!);
        }
        return pickRandomWord(data.words!);
      });
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

  const nextWord = useCallback(
    (preferReview = false) => {
      const pool = preferReview && reviewCandidates.length ? reviewCandidates : words;
      setCurrent(pickRandomWord(pool, current?.id));
      setShowAnswer(false);
      setStatus("");
    },
    [words, reviewCandidates, current?.id]
  );

  const recordLevel = async (level: JpVocabLevel) => {
    if (!current || saving) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/jp-vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: current.id, level }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        word?: JpVocabWord;
        error?: string;
      };
      if (!data.ok || !data.word) {
        throw new Error(data.error || "保存失败");
      }
      setWords((prev) =>
        prev
          .map((w) => (w.id === data.word!.id ? data.word! : w))
          .sort((a, b) => {
            if (b.cnt_weak !== a.cnt_weak) return b.cnt_weak - a.cnt_weak;
            if (a.cnt_very !== b.cnt_very) return a.cnt_very - b.cnt_very;
            return a.word.localeCompare(b.word, "ja");
          })
      );
      setCurrent(data.word);
      setStatus(`已记录：${LEVEL_LABELS[level]}`);
      window.setTimeout(() => nextWord(true), 600);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-wrap" style={{ maxWidth: "960px", paddingTop: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>日语单词抽问</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
        老师抽问单词，学生回答后选择熟悉程度；不熟悉次数多的词优先复习。
      </p>

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      <section
        className="section etr-panel"
        style={{ marginBottom: "1.25rem" }}
        aria-label="抽问区"
      >
        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载单词…</p>
        ) : !current ? (
          <p style={{ color: "var(--muted)" }}>暂无单词，请通过 API 上传。</p>
        ) : (
          <>
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem 1rem",
                marginBottom: "1rem",
                borderRadius: "8px",
                background: "var(--panel)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(2rem, 6vw, 3rem)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  marginBottom: "0.5rem",
                }}
              >
                {current.word}
              </div>
              {showAnswer ? (
                <div style={{ color: "var(--muted)", fontSize: "1rem" }}>
                  {current.reading ? (
                    <div style={{ marginBottom: "0.25rem" }}>{current.reading}</div>
                  ) : null}
                  {current.meaning ? <div>{current.meaning}</div> : null}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-rsi-filter"
                  onClick={() => setShowAnswer(true)}
                  style={{ marginTop: "0.5rem" }}
                >
                  显示读音 / 释义
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--primary"
                disabled={saving}
                onClick={() => recordLevel("very")}
                style={{ borderColor: "var(--rise)" }}
              >
                非常熟悉
              </button>
              <button
                type="button"
                className="btn-rsi-filter"
                disabled={saving}
                onClick={() => recordLevel("normal")}
              >
                一般
              </button>
              <button
                type="button"
                className="btn-rsi-filter"
                disabled={saving}
                onClick={() => recordLevel("weak")}
                style={{ borderColor: "var(--fall)" }}
              >
                不熟悉
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem 0.75rem",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => nextWord(false)}
                disabled={saving || words.length < 2}
              >
                随机下一词
              </button>
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => nextWord(true)}
                disabled={saving || !reviewCandidates.length}
              >
                优先需复习 ({reviewCandidates.length})
              </button>
              {status ? (
                <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  {status}
                </span>
              ) : null}
            </div>
          </>
        )}
      </section>

      <section className="section etr-panel" aria-label="单词统计">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>单词统计</h2>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            共 {words.length} 词 · 需复习 {reviewCandidates.length} 词
          </span>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : !words.length ? (
          <p style={{ color: "var(--muted)" }}>暂无数据</p>
        ) : (
          <div className="etr-table-wrap" style={{ display: "block" }}>
            <table className="compare-table etr-table">
              <thead>
                <tr>
                  <th>单词</th>
                  <th>读音</th>
                  <th>释义</th>
                  <th>非常熟悉</th>
                  <th>一般</th>
                  <th>不熟悉</th>
                  <th>合计</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => {
                  const review = needsReview(w);
                  const isCurrent = current?.id === w.id;
                  return (
                    <tr
                      key={w.id}
                      onClick={() => {
                        setCurrent(w);
                        setShowAnswer(false);
                        setStatus("");
                      }}
                      style={{
                        cursor: "pointer",
                        background:
                          isCurrent
                            ? "rgba(61, 139, 253, 0.12)"
                            : undefined,
                      }}
                    >
                      <td>{w.word}</td>
                      <td style={{ color: "var(--muted)" }}>{w.reading || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{w.meaning || "—"}</td>
                      <td className="chg-up">{w.cnt_very}</td>
                      <td>{w.cnt_normal}</td>
                      <td className="chg-dn">{w.cnt_weak}</td>
                      <td>{totalReviews(w)}</td>
                      <td>
                        {review ? (
                          <span className="chg-dn" style={{ fontSize: "0.8125rem" }}>
                            需复习
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
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
    { "word": "こんにちは", "reading": "konnichiwa", "meaning": "你好" },
    { "word": "勉強", "reading": "benkyou", "meaning": "学习" }
  ]
}`}
        </pre>
        <p>
          <code>replace: true</code> 会清空现有单词后重新导入；默认跳过重复单词。
        </p>
      </details>
    </main>
  );
}
