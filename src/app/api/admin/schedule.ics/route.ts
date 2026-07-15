import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuthOrQueryToken } from "@/lib/jp-review";
import {
  buildScheduleIcs,
  listScheduleCalDavEvents,
} from "@/lib/schedule-caldav-events";

/**
 * iPhone / Mac「日历」订阅用 ICS。
 * Auth: Bearer 或 `?token=`（系统订阅日历只能带 query）。
 */
export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuthOrQueryToken(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const events = await listScheduleCalDavEvents(env.DB);
    const body = buildScheduleIcs(events);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": 'inline; filename="info-quests-schedule.ics"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
