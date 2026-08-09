"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN } from "@/lib/jp-lesson-ai-plan-prompt-bark-client";

const DONE_HOLD_MS = 3_000;

function formatMmSs(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 复制 AI 提示词成功后：本地 7 分钟倒计时（与 Bark 延迟一致；不持久化）。
 */
export function useJpLessonAiPlanCopyCountdown(opts?: {
  delayMin?: number;
  /** 收起/关闭面板时清掉 */
  active?: boolean;
}) {
  const delayMin = opts?.delayMin ?? JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN;
  const active = opts?.active ?? true;
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [doneHold, setDoneHold] = useState(false);
  const tickRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (doneTimerRef.current != null) {
      window.clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    clearTimers();
    setEndsAt(null);
    setRemainingSec(0);
    setDoneHold(false);
  }, [clearTimers]);

  const startCountdown = useCallback(() => {
    clearTimers();
    setDoneHold(false);
    const nextEnds = Date.now() + delayMin * 60_000;
    setEndsAt(nextEnds);
    setRemainingSec(Math.max(0, Math.ceil((nextEnds - Date.now()) / 1000)));
  }, [clearTimers, delayMin]);

  useEffect(() => {
    if (!active) {
      clearCountdown();
    }
  }, [active, clearCountdown]);

  useEffect(() => {
    if (endsAt == null) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0) {
        if (tickRef.current != null) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setEndsAt(null);
        setDoneHold(true);
        doneTimerRef.current = window.setTimeout(() => {
          setDoneHold(false);
          doneTimerRef.current = null;
        }, DONE_HOLD_MS);
      }
    };

    tick();
    tickRef.current = window.setInterval(tick, 1000);
    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [endsAt]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const visible = endsAt != null || doneHold;
  const finished = doneHold && endsAt == null;
  const label = finished ? "到点了" : formatMmSs(remainingSec);

  return {
    remainingSec,
    visible,
    finished,
    label,
    startCountdown,
    clearCountdown,
  };
}
