"use client";

import { useCallback, useEffect, useState } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { KoPronEditModal } from "@/components/KoPronEditModal";
import { KoPronLetterCopyButton } from "@/components/KoPronLetterCopyButton";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { JP_VOCAB_POLL_HIDDEN_MS, JP_VOCAB_POLL_MS } from "@/lib/jp-vocab-sync";
import type { KoPronLetter } from "@/lib/types";

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
  const [editingLetter, setEditingLetter] = useState<StudyLetter | null>(null);

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

  // live 仅用于是否有老师开卡；罗马音/发音/熟悉程度对学生一律隐藏
  void live;

  return (
    <div className="ko-pron-study-page">
      <h1>今日韩语发音</h1>
      <p className="ko-pron-study-hint">请看着字母读给老师听。</p>

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
          <div className="ko-pron-study-hero-actions">
            <KoPronLetterCopyButton letter={letter.letter} variant="hero" />
            <button
              type="button"
              className="ko-pron-study-edit-btn"
              onClick={() => setEditingLetter(letter)}
            >
              编辑
            </button>
          </div>
          {/* 学生端：不显示分类（易剧透教材分类）、罗马音、发音、熟悉程度 */}
          <p className="ko-pron-study-waiting">请先读出来，老师会听你的发音。</p>
        </div>
      ) : null}

      <KoPronEditModal
        open={Boolean(editingLetter)}
        letter={editingLetter}
        onClose={() => setEditingLetter(null)}
        onSaved={(updated: KoPronLetter) => {
          setLetter({
            id: updated.id,
            letter: updated.letter,
            reading: updated.reading,
            meaning: updated.meaning,
            category: updated.category,
          });
          setEditingLetter(null);
        }}
      />
    </div>
  );
}
