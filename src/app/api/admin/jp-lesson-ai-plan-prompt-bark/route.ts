import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { fireDueJpLessonAiPlanPromptBark } from "@/lib/jp-lesson-ai-plan-prompt-bark";

/**
 * 日语教案提示词 Bark：Cron 每分钟扫到期预约并推送。
 * Bearer = JP_REVIEW_UPLOAD_TOKEN（与上课 Bark Cron 同鉴权）。
 */
async function handle(request: Request): Promise<Response> {
  try {
    const env = await getCloudflareEnv();
    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const result = await fireDueJpLessonAiPlanPromptBark(env);
    return jsonResponse({
      ...result,
      timezone: "Asia/Shanghai",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { ok: false, error: message, notified: 0 },
      500
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
