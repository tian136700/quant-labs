"use client";

import { useCallback, useEffect, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { JP_VOCAB_POLL_HIDDEN_MS, JP_VOCAB_POLL_MS } from "@/lib/jp-vocab-sync";

type StudyLetter = {
  id: number;
  letter: string;
  reading: string | null;
  meaning: string | null;
  category: string | null;
};

type LiveState = {
  letter_id: number | null;
  reading_revealed: boolean;
  updated_at: string | null;
};

export function KoPronStudyPage() {
  const { user, checking, canAccessKoPronStudy, setUser } = useEtrAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState<LiveState | null>(null);
  const [letter, setLetter] = useState<StudyLetter | null>(null);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/ko-pron/live", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        live?: LiveState;
        letter?: StudyLetter | null;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "加载失败");
      }
      setLive(data.live ?? null);
      setLetter(data.letter ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checking || !user || !canAccessKoPronStudy) return;
    void loadLive();
  }, [checking, user, canAccessKoPronStudy, loadLive]);

  useEffect(() => {
    if (checking || !user || !canAccessKoPronStudy) return;
    const id = window.setInterval(
      () => {
        void loadLive();
      },
      document.hidden ? JP_VOCAB_POLL_HIDDEN_MS : JP_VOCAB_POLL_MS
    );
    return () => window.clearInterval(id);
  }, [checking, user, canAccessKoPronStudy, loadLive]);

  if (checking) {
    return <p className="ko-pron-study-status">正在检查登录状态…</p>;
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title="登录 · 今日韩语发音"
        subtitle="请登录后查看老师正在抽查的字母。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  if (!canAccessKoPronStudy) {
    return (
      <div className="ko-pron-study-page">
        <h1>今日韩语发音</h1>
        <p className="ko-pron-study-error">当前账号无权访问学生端。</p>
      </div>
    );
  }

  const revealed = Boolean(live?.reading_revealed && letter?.reading);

  return (
    <div className="ko-pron-study-page">
      <h1>今日韩语发音</h1>
      <p className="ko-pron-study-hint">
        请看着字母读给老师听。罗马音提示会在老师勾选熟悉程度后出现。
      </p>

      {error ? <p className="ko-pron-study-error">{error}</p> : null}
      {loading ? <p className="ko-pron-study-status">加载中…</p> : null}

      {!loading && !letter ? (
        <div className="ko-pron-study-empty">
          老师尚未开始抽查。请稍候，老师打开卡片后这里会自动出现字母。
        </div>
      ) : null}

      {letter ? (
        <div className="ko-pron-study-card" aria-live="polite">
          <div className="ko-pron-study-letter">{letter.letter}</div>
          {letter.category ? (
            <p className="ko-pron-study-category">{letter.category}</p>
          ) : null}
          {revealed ? (
            <div className="ko-pron-study-reading">
              <p className="ko-pron-study-reading-label">罗马音 / 读法</p>
              <p className="ko-pron-study-reading-value">{letter.reading}</p>
              {letter.meaning ? (
                <p className="ko-pron-study-meaning">{letter.meaning}</p>
              ) : null}
            </div>
          ) : (
            <p className="ko-pron-study-waiting">
              请先读出来；老师确认后会显示读音提示。
            </p>
          )}
        </div>
      ) : null}

      <style jsx>{`
        .ko-pron-study-page {
          max-width: 36rem;
          margin: 0 auto;
          padding: 1.25rem 1rem 2.5rem;
        }
        h1 {
          margin: 0 0 0.5rem;
          font-size: 1.4rem;
        }
        .ko-pron-study-hint {
          color: #64748b;
          margin: 0 0 1.25rem;
          line-height: 1.5;
        }
        .ko-pron-study-error {
          color: #b91c1c;
        }
        .ko-pron-study-status {
          color: #64748b;
        }
        .ko-pron-study-empty {
          border: 1px dashed #cbd5e1;
          border-radius: 0.85rem;
          padding: 1.5rem 1rem;
          text-align: center;
          color: #64748b;
          background: #f8fafc;
        }
        .ko-pron-study-card {
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          padding: 1.5rem 1.25rem;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
          text-align: center;
        }
        .ko-pron-study-letter {
          font-size: 4rem;
          font-weight: 700;
          line-height: 1.1;
          margin-bottom: 0.5rem;
        }
        .ko-pron-study-category {
          color: #64748b;
          margin: 0 0 1rem;
        }
        .ko-pron-study-waiting {
          color: #94a3b8;
          margin: 1rem 0 0;
        }
        .ko-pron-study-reading-label {
          font-size: 0.8rem;
          color: #64748b;
          margin: 0.75rem 0 0.25rem;
        }
        .ko-pron-study-reading-value {
          font-size: 1.35rem;
          font-weight: 600;
          margin: 0;
        }
        .ko-pron-study-meaning {
          color: #475569;
          margin: 0.4rem 0 0;
        }
      `}</style>
    </div>
  );
}
