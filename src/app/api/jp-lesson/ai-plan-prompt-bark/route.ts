import { requireAdmin } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  clampJpLessonAiPlanPromptBarkDelayMin,
  JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN,
  recordJpLessonAiPlanPromptCopied,
} from "@/lib/jp-lesson-ai-plan-prompt-bark";

const AUTH_MSG = {
  en: "Admin only.",
  zh: "仅管理员可预约教案提示词 Bark 提醒。",
};

/**
 * 复制「单词+提示词」后：记录时间；可选预约约 7 分钟后 Bark。
 * POST JSON: { schedule_bark?, delay_min?, lesson_id?, course_label? }
 */
export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, user, isAdmin } = await requireAdmin(request);
    if (!user || !isAdmin) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    const scheduleBark =
      body.schedule_bark === true ||
      body.schedule_bark === 1 ||
      body.schedule_bark === "1" ||
      body.schedule_bark === "true";

    const delayMin = clampJpLessonAiPlanPromptBarkDelayMin(
      body.delay_min ?? JP_LESSON_AI_PLAN_PROMPT_BARK_DEFAULT_DELAY_MIN
    );

    let lessonId: number | null = null;
    if (body.lesson_id != null && body.lesson_id !== "") {
      const n = Number(body.lesson_id);
      if (Number.isFinite(n) && n > 0) lessonId = Math.floor(n);
    }

    const courseLabel =
      typeof body.course_label === "string" ? body.course_label.trim() : "";

    const result = await recordJpLessonAiPlanPromptCopied(env.DB, {
      scheduleBark,
      delayMin,
      lessonId,
      courseLabel: courseLabel || null,
    });

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
