import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { expandActiveJpLessonManualRecurring } from "@/lib/jp-lesson-manual-schedule-recurring-db";

/**
 * 长期固定手动日程续期：把每条 active 规则补齐「今天起约 12 周」缺的实例。
 * Bearer = JP_REVIEW_UPLOAD_TOKEN；Worker 日 Cron / 手动试跑共用。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();
    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    try {
      await request.json();
    } catch {
      /* empty body ok */
    }

    const result = await expandActiveJpLessonManualRecurring(env.DB);
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
