import {
  getWorkerTrafficDailySummary,
  getWorkerTrafficRouteIps,
  purgeWorkerDailyHitsOlderThan,
} from "@/lib/worker-traffic-db";
import { requirePermission } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";

const ERROR_MSG: Record<"en" | "zh", string> = {
  en: "Admin login required.",
  zh: "需要管理员登录。",
};

function parseStatDate(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return beijingDateString();
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requirePermission(request, "admin:dashboard");
    if (!allowed) {
      return jsonResponse(
        { ok: false, error: ERROR_MSG[locale], auth_required: true },
        401
      );
    }

    const url = new URL(request.url);
    const statDate = parseStatDate(url.searchParams.get("date"));
    const routeKey = (url.searchParams.get("route") || "").trim();

    if (routeKey) {
      const top_ips = await getWorkerTrafficRouteIps(env.DB, {
        statDate,
        routeKey,
      });
      return jsonResponse({
        ok: true,
        mode: "route_ips",
        stat_date: statDate,
        route_key: routeKey,
        top_ips,
      });
    }

    const [summary] = await Promise.all([
      getWorkerTrafficDailySummary(env.DB, statDate),
      purgeWorkerDailyHitsOlderThan(env.DB),
    ]);

    return jsonResponse({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
