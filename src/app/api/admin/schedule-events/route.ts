import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { listScheduleCalDavEvents } from "@/lib/schedule-caldav-events";

/** Mac CalDAV 同步用：导出统一日程事件（Bearer = JP_REVIEW_UPLOAD_TOKEN） */
export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const events = await listScheduleCalDavEvents(env.DB);
    return jsonResponse({
      ok: true,
      timezone: "Asia/Shanghai",
      count: events.length,
      events,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
