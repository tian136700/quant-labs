"use client";

import { useCallback, useRef, useState } from "react";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import {
  notifyEnVocabPronounceSent,
  parseEnVocabTeacherPronouncePayload,
} from "@/lib/en-vocab-pronounce-signal";

type Props = {
  wordId: number;
  wordText: string;
  disabled?: boolean;
  locale?: "zh" | "en";
};

/**
 * 老师抽查卡「发送读音」：PUT live 信号 → 学生端本机 TTS。
 * 不上传音频；写 D1 时展示橙色短进度条。
 */
export function EnVocabSendPronounceButton({
  wordId,
  wordText,
  disabled = false,
  locale = "zh",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSend = useCallback(async () => {
    if (disabled || busy || !wordId || !wordText.trim()) return;
    setBusy(true);
    setStatus(null);
    setProgressPercent(12);
    const startedAt = Date.now();
    clearTimer();
    timerRef.current = setInterval(() => {
      setProgressPercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 120);

    try {
      const res = await fetch("/api/en-vocab/teacher-quiz-live", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({
          action: "send_pronounce",
          word_id: wordId,
        }),
      });
      const parsed = await readApiJson<{
        ok: boolean;
        teacher_pronounce?: unknown;
        error?: string;
      }>(res);
      if (!parsed.ok || !parsed.data.ok) {
        throw new Error(
          (!parsed.ok ? parsed.error : parsed.data.error) || "发送失败"
        );
      }
      const signal =
        parseEnVocabTeacherPronouncePayload(parsed.data.teacher_pronounce) ?? {
          word_id: wordId,
          text: wordText.trim(),
          at: new Date().toISOString(),
        };
      notifyEnVocabPronounceSent(signal);
      clearTimer();
      await animateJpVocabSaveProgressTo100(startedAt, setProgressPercent);
      setStatus("已发送读音");
      window.setTimeout(() => setStatus(null), 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(msg || "发送失败");
    } finally {
      clearTimer();
      setProgressPercent(null);
      setBusy(false);
    }
  }, [busy, disabled, locale, wordId, wordText]);

  return (
    <div className="en-vocab-send-pronounce">
      <button
        type="button"
        className="btn-rsi-filter en-vocab-send-pronounce__btn"
        disabled={disabled || busy || !wordText.trim()}
        onClick={() => void handleSend()}
        title="把标准读音推到学生端「今日英语单词」（浏览器朗读）"
      >
        {busy ? "发送中…" : "发送读音"}
      </button>
      {busy && progressPercent != null ? (
        <JpVocabSaveProgressBar
          label="正在发送读音…"
          percent={jpVocabSaveProgressDisplayPercent(progressPercent)}
          fullWidth
          className="en-vocab-send-pronounce__progress"
        />
      ) : null}
      {status ? (
        <p className="en-vocab-send-pronounce__status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
