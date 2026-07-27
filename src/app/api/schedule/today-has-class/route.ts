import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { beijingDateHasAnyScheduleClass } from "@/lib/schedule-today-has-class";

/** 已登录即可：今日（北京）日程是否有课 —— 供客户端夜间轮询降频判断 */
export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const user = await getSessionUserFromRequest(
      env,
      request.headers.get("cookie")
    );
    if (!user) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const date = beijingDateString();
    const has_class = await beijingDateHasAnyScheduleClass(env.DB, date);
    return jsonResponse(
      { ok: true, date, has_class },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
