/**
 * 日语新课 · 复制 AI 提示词后自动预约 7 分钟 Bark（客户端）。
 * 与页面顶部倒计时同步：复制成功即预约（覆盖旧预约）；不再弹 confirm。
 */

export const JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN = 7;

export type JpLessonAiPlanPromptBarkClientResult = {
  ok: boolean;
  scheduled?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  notify_fire_display?: string;
  notify_delay_min?: number;
};

export async function postJpLessonAiPlanPromptBark(opts: {
  scheduleBark: boolean;
  lessonId?: number | null;
  courseLabel?: string | null;
  delayMin?: number;
}): Promise<JpLessonAiPlanPromptBarkClientResult> {
  const delayMin = opts.delayMin ?? JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN;
  try {
    const res = await fetch("/api/jp-lesson/ai-plan-prompt-bark", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_bark: Boolean(opts.scheduleBark),
        delay_min: delayMin,
        lesson_id: opts.lessonId ?? null,
        course_label: (opts.courseLabel || "").trim() || null,
      }),
    });
    const data = (await res.json()) as JpLessonAiPlanPromptBarkClientResult;
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || `请求失败（${res.status}）`,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 复制成功后调用：立刻预约 delay 分钟后 Bark（覆盖旧预约）。
 * @returns 给 CopyToast 的文案（已预约 / 失败等）
 */
export async function afterJpLessonAiPlanPromptCopySuccess(opts: {
  lessonId?: number | null;
  courseLabel?: string | null;
}): Promise<string> {
  const delayMin = JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN;
  const res = await postJpLessonAiPlanPromptBark({
    scheduleBark: true,
    lessonId: opts.lessonId,
    courseLabel: opts.courseLabel,
    delayMin,
  });
  if (!res.ok) {
    return res.error || "预约 Bark 失败";
  }
  if (res.skipped) {
    return "Bark 未配置，已跳过通知";
  }
  if (res.scheduled) {
    const when = (res.notify_fire_display || "").trim();
    return when
      ? `已预约：约 ${delayMin} 分钟后 Bark（${when}）`
      : `已预约：约 ${delayMin} 分钟后 Bark`;
  }
  return "复制成功";
}
