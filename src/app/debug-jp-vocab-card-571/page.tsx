"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

const DEFAULT_WORD_ID = 571;

function DebugJpVocabCardInner() {
  const searchParams = useSearchParams();
  const wordIdRaw = Number(searchParams.get("word_id") || DEFAULT_WORD_ID);
  const wordId =
    Number.isInteger(wordIdRaw) && wordIdRaw > 0 ? wordIdRaw : DEFAULT_WORD_ID;

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
      setWord(null);
      try {
        const res = await fetch(`/api/debug-jp-vocab-card?word_id=${wordId}`, {
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
  }, [wordId]);

  const wordsById = useMemo(
    () => new Map<number, JpVocabWord>(word ? [[wordId, word]] : []),
    [word, wordId]
  );
  const session: JpVocabTeacherQuizSession = {
    mode: "random",
    wordIds: [wordId],
    currentIndex: 0,
  };
  const displayOrder: JpVocabDailyDisplayOrder = {
    date: new Date().toISOString().slice(0, 10),
    ids: [wordId],
    round_checked_ids: [],
  };
  const dailySeqByWordId = useMemo(
    () => new Map<number, number>([[wordId, 1]]),
    [wordId]
  );

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>
        本地预览：老师端抽查卡（ID {wordId}）
      </h2>
      <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
        免登录调试页；优先本地库，缺失则回退线上真值。可用
        <code> ?word_id=571 </code>
        换词。
      </p>
      {dataSource ? (
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
          当前数据来源：
          {dataSource === "local"
            ? "本地同步数据"
            : dataSource === "remote-fallback"
              ? "线上真值回退"
              : dataSource}
        </p>
      ) : null}
      {loading ? (
        <p style={{ marginTop: 12, color: "var(--muted)" }}>
          正在读取词条数据…
        </p>
      ) : null}
      {error ? (
        <p style={{ marginTop: 12, color: "#fca5a5" }}>读取失败：{error}</p>
      ) : null}
      {!loading && !error && !word ? (
        <p style={{ marginTop: 12, color: "#fca5a5" }}>
          本地与线上都没有找到 `id={wordId}`。
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
          onSelectLevel={(id, level) =>
            setSessionLevel((prev) => ({ ...prev, [id]: level }))
          }
          onNavigate={() => undefined}
          onOpenRef={() => undefined}
          onViewRemarks={() => undefined}
        />
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p style={{ color: "var(--muted)", padding: "1.5rem" }}>加载中…</p>
      }
    >
      <DebugJpVocabCardInner />
    </Suspense>
  );
}
