"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { readApiJson } from "@/lib/api-json";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import type { JpVocabWord } from "@/lib/types";

type FillResponse = {
  ok: boolean;
  error?: string;
  word_id?: number;
  word?: string;
  usage?: string | null;
  example_sentences?: string | null;
  usage_source?: string | null;
  example_sentences_source?: string | null;
  source?: string | null;
};

type Props = {
  word: JpVocabWord;
  /** 仅管理员角色可见并可用 */
  enabled: boolean;
  onPatched: (next: JpVocabWord) => void;
};

/**
 * 管理员：点按钮调线上 tokken 重写本词用法+例句（覆盖写回）。
 * 语法词条请用定时 fill-usage，此处不展示。
 */
export function JpVocabFlashcardManualFillExamples({
  word,
  enabled,
  onPatched,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    setError(null);
    setBusy(false);
    setPercent(null);
    clearTimer();
  }, [word.id, clearTimer]);

  if (!enabled || word.kind === "grammar") return null;

  const onClick = () => {
    if (busy) return;
    if (
      !window.confirm(
        "将调用线上模型重写本词的「用法 + 例句」，并覆盖现有内容。确定继续？"
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    const startedAt = Date.now();
    setPercent(jpVocabSaveProgressPercent(0));
    clearTimer();
    timerRef.current = setInterval(() => {
      setPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);

    void (async () => {
      try {
        const res = await fetch("/api/jp-vocab/manual-fill-examples", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word_id: word.id }),
        });
        const parsed = await readApiJson<FillResponse>(res);
        if (!parsed.ok) {
          throw new Error(parsed.error || `补全失败（HTTP ${parsed.status}）`);
        }
        const data = parsed.data;
        if (!res.ok || data.ok !== true) {
          throw new Error(
            data.error ? String(data.error) : `补全失败（HTTP ${res.status}）`
          );
        }
        clearTimer();
        await animateJpVocabSaveProgressTo100(startedAt, setPercent);
        onPatched({
          ...word,
          usage: data.usage ?? null,
          usage_source: data.usage_source ?? null,
          example_sentences: data.example_sentences ?? null,
          example_sentences_source: data.example_sentences_source ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        clearTimer();
        setBusy(false);
        setPercent(null);
      }
    })();
  };

  return (
    <div className="jp-vocab-flashcard-manual-fill">
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-teacher-quiz__action-btn"
        disabled={busy}
        title="调用线上大模型重写用法与例句（仅管理员）"
        onClick={onClick}
      >
        {busy ? "补全中…" : "手动补全例句"}
      </button>
      {busy ? (
        <JpVocabSaveProgressBar
          label="正在调用线上模型补全例句…"
          percent={jpVocabSaveProgressDisplayPercent(percent)}
          fullWidth
        />
      ) : null}
      {error ? (
        <p className="jp-vocab-flashcard-manual-fill__error" role="alert">
          {error}
        </p>
      ) : null}
      <style jsx>{`
        .jp-vocab-flashcard-manual-fill {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          gap: 0.45rem;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 100%;
        }
        .jp-vocab-flashcard-manual-fill :global(.jp-vocab-share-progress),
        .jp-vocab-flashcard-manual-fill__error {
          flex: 1 1 100%;
        }
        .jp-vocab-flashcard-manual-fill__error {
          margin: 0;
          color: #e85d6f;
          font-size: 0.92rem;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
