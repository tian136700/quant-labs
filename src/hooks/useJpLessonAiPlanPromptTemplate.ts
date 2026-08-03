"use client";

import { useEffect, useRef, useState } from "react";
import {
  JP_LESSON_AI_PLAN_DEFAULT_PROMPT,
  readStoredJpLessonAiPlanPrompt,
  writeStoredJpLessonAiPlanPrompt,
} from "@/lib/jp-lesson-ai-plan-prompt";

const AUTOSAVE_MS = 300;

/**
 * AI 教案「提示词模板」：打开时读本机；编辑后防抖自动写入 localStorage。
 * 生词表仍按当前课现拼，不存进模板。
 */
export function useJpLessonAiPlanPromptTemplate(open: boolean) {
  const [prompt, setPrompt] = useState(JP_LESSON_AI_PLAN_DEFAULT_PROMPT);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => {
    if (!open) {
      writeStoredJpLessonAiPlanPrompt(promptRef.current);
      return;
    }
    setPrompt(readStoredJpLessonAiPlanPrompt());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      writeStoredJpLessonAiPlanPrompt(prompt);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [open, prompt]);

  useEffect(() => {
    return () => {
      writeStoredJpLessonAiPlanPrompt(promptRef.current);
    };
  }, []);

  const flushPrompt = () => {
    writeStoredJpLessonAiPlanPrompt(promptRef.current);
  };

  return { prompt, setPrompt, flushPrompt };
}
