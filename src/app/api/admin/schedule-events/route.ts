import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { listScheduleCalDavEvents } from "@/lib/schedule-caldav-events";
import {
  normalizeScheduleCalDavYmd,
  resolveScheduleCalDavDateWindow,
} from "@/lib/schedule-caldav-events-load";

/** Mac CalDAV / Telegram 查表：导出统一日程事件（Bearer = JP_REVIEW_UPLOAD_TOKEN）
 *
 * Query（均可选）：
 * - from=YYYY-MM-DD  to=YYYY-MM-DD  北京日（含端点）；缺省约「今天前14天～后180天」
 * - lite=1  省略 description，给 Telegram 查表减体积防 1102
 */
export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const lite =
      url.searchParams.get("lite") === "1" ||
      url.searchParams.get("lite") === "true";

    const fromDate = normalizeScheduleCalDavYmd(fromRaw) ?? undefined;
    const toDate = normalizeScheduleCalDavYmd(toRaw) ?? undefined;
    if ((fromRaw && !fromDate) || (toRaw && !toDate)) {
      return jsonResponse(
        { ok: false, error: "from_to_invalid", detail: "use YYYY-MM-DD" },
        400
      );
    }

    const window = resolveScheduleCalDavDateWindow({ fromDate, toDate });
    const events = await listScheduleCalDavEvents(env.DB, {
      fromDate: window.fromDate,
      toDate: window.toDate,
      lite,
    });

    return jsonResponse({
      ok: true,
      timezone: "Asia/Shanghai",
      from: window.fromDate,
      to: window.toDate,
      lite,
      count: events.length,
      events,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
