/**
 * 日语新课 · 复制 AI 提示词后可选 7 分钟 Bark（客户端）。
 * 对齐 STT：复制成功 → confirm → POST 预约/取消旧预约。
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
 * 复制成功后调用：先记一次（取消旧预约），再问是否 7 分钟 Bark。
 * @returns 给 CopyToast 的文案（复制成功 / 已预约 / 失败等）
 */
export async function afterJpLessonAiPlanPromptCopySuccess(opts: {
  lessonId?: number | null;
  courseLabel?: string | null;
}): Promise<string> {
  const delayMin = JP_LESSON_AI_PLAN_PROMPT_BARK_DELAY_MIN;
  // 与 STT 一致：先记复制并清旧预约（须 await，避免与后续预约竞态）
  await postJpLessonAiPlanPromptBark({
    scheduleBark: false,
    lessonId: opts.lessonId,
    courseLabel: opts.courseLabel,
    delayMin,
  });

  const want = window.confirm(
    `是否从本次复制起，${delayMin} 分钟后 Bark 通知你？\n` +
      "（若刚才已预约过，会改成以这一次为准重新计时；到点时图片教案可能已做好）"
  );
  if (!want) {
    return "复制成功";
  }

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
