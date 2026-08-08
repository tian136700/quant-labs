"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  JP_LESSON_AI_PLAN_DEFAULT_PROMPT,
  readStoredJpLessonAiPlanPrompt,
  writeStoredJpLessonAiPlanPrompt,
} from "@/lib/jp-lesson-ai-plan-prompt";

const AUTOSAVE_MS = 300;
const SAVED_HINT_MS = 1600;

/**
 * AI 教案「提示词模板」：打开时读本机；编辑后防抖自动写入 localStorage。
 * 生词表仍按当前课现拼，不存进模板。
 *
 * 重要：编辑内容弹窗里教案区默认收起（open=false）仍会挂载本 hook。
 * 禁止在「从未打开」时用初始默认文案 writeStored，否则会冲掉用户已改模板。
 */
export function useJpLessonAiPlanPromptTemplate(open: boolean) {
  const [prompt, setPrompt] = useState(JP_LESSON_AI_PLAN_DEFAULT_PROMPT);
  const [saveHint, setSaveHint] = useState<"idle" | "saved">("idle");
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  /** 本会话是否已打开过面板/弹窗（打开后才允许 flush / 防抖写） */
  const sessionOpenRef = useRef(false);
  const saveHintTimerRef = useRef<number | null>(null);

  const persist = useCallback((value: string) => {
    writeStoredJpLessonAiPlanPrompt(value);
    setSaveHint("saved");
    if (saveHintTimerRef.current != null) {
      window.clearTimeout(saveHintTimerRef.current);
    }
    saveHintTimerRef.current = window.setTimeout(() => {
      setSaveHint("idle");
      saveHintTimerRef.current = null;
    }, SAVED_HINT_MS);
  }, []);

  useEffect(() => {
    if (open) {
      setPrompt(readStoredJpLessonAiPlanPrompt());
      sessionOpenRef.current = true;
      return;
    }
    // 仅曾打开过再 flush；挂载时 open=false 绝不能用默认文案覆盖
    if (sessionOpenRef.current) {
      persist(promptRef.current);
      sessionOpenRef.current = false;
    }
  }, [open, persist]);

  useEffect(() => {
    if (!open || !sessionOpenRef.current) return;
    const timer = window.setTimeout(() => {
      persist(prompt);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [open, prompt, persist]);

  useEffect(() => {
    return () => {
      if (saveHintTimerRef.current != null) {
        window.clearTimeout(saveHintTimerRef.current);
      }
      if (sessionOpenRef.current) {
        writeStoredJpLessonAiPlanPrompt(promptRef.current);
      }
    };
  }, []);

  const flushPrompt = useCallback(() => {
    writeStoredJpLessonAiPlanPrompt(promptRef.current);
  }, []);

  return { prompt, setPrompt, flushPrompt, saveHint };
}
