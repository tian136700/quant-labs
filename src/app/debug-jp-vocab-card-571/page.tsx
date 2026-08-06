"use client";

import { useEffect, useMemo, useState } from "react";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const WORD_ID = 571;

export default function Page() {
  const [open, setOpen] = useState(true);
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});
  const [word, setWord] = useState<JpVocabWord | null>(null);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/debug-jp-vocab-card?word_id=${WORD_ID}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          source?: string;
          word?: JpVocabWord | null;
          refs?: Record<string, JpVocabRef>;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setWord(data.word ?? null);
        setRefs(data.refs ?? {});
        setDataSource(data.source ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const wordsById = useMemo(
    () => new Map<number, JpVocabWord>(word ? [[WORD_ID, word]] : []),
    [word]
  );
  const session: JpVocabTeacherQuizSession = {
    mode: "random",
    wordIds: [WORD_ID],
    currentIndex: 0,
  };
  const displayOrder: JpVocabDailyDisplayOrder = {
    date: "2026-08-06",
    ids: [WORD_ID],
    round_checked_ids: [],
  };
  const dailySeqByWordId = useMemo(
    () => new Map<number, number>([[WORD_ID, 1]]),
    []
  );

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>本地预览：老师端抽查卡（ID 571）</h2>
      <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
        这个页面为本地免登录调试页，直接复用老师端抽查卡片组件，并优先读取本地真实词条数据；本地缺失时回退到线上真值。
      </p>
      {dataSource ? (
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
          当前数据来源：{dataSource === "local" ? "本地同步数据" : dataSource === "remote-fallback" ? "线上真值回退" : dataSource}
        </p>
      ) : null}
      {loading ? (
        <p style={{ marginTop: 12, color: "var(--muted)" }}>正在读取本地真实数据…</p>
      ) : null}
      {error ? (
        <p style={{ marginTop: 12, color: "#fca5a5" }}>
          读取失败：{error}
        </p>
      ) : null}
      {!loading && !error && !word ? (
        <p style={{ marginTop: 12, color: "#fca5a5" }}>
          本地数据里没有找到 `id=571`。
        </p>
      ) : null}
      {!open ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary"
          style={{ marginTop: 12 }}
          onClick={() => setOpen(true)}
        >
          重新打开卡片
        </button>
      ) : null}

      {word ? (
        <JpVocabTeacherQuizFlashcardModal
          open={open}
          session={session}
          wordsById={wordsById}
          refs={refs}
          locale="zh"
          displayOrder={displayOrder}
          sessionLevel={sessionLevel}
          reviewLockedByWordId={{}}
          savingWordId={null}
          dailySeqByWordId={dailySeqByWordId}
          canOperate={false}
          onClose={() => setOpen(false)}
          onComplete={() => setOpen(false)}
          onSelectLevel={(wordId, level) =>
            setSessionLevel((prev) => ({ ...prev, [wordId]: level }))
          }
          onNavigate={() => undefined}
          onOpenRef={() => undefined}
          onViewRemarks={() => undefined}
        />
      ) : null}
    </div>
  );
}

