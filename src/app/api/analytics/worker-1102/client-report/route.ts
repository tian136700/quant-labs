import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { clientIp } from "@/lib/locale-pref";
import type { Worker1102ClientEventKind } from "@/lib/worker-1102-client-shared";
import { recordWorker1102ClientEvent } from "@/lib/worker-1102-client-events";

const KIND_SET = new Set<Worker1102ClientEventKind>([
  "cf_1102_html",
  "api_5xx",
  "page_ok",
  "fetch_network",
  "shared_fail",
]);

/** 同 IP 简易节流（isolate 内存；防刷 D1） */
const ipBuckets = new Map<string, { at: number; n: number }>();
const IP_WINDOW_MS = 60_000;
const IP_MAX = 30;

function allowIp(ip: string): boolean {
  const now = Date.now();
  const key = ip || "unknown";
  const cur = ipBuckets.get(key);
  if (!cur || now - cur.at > IP_WINDOW_MS) {
    ipBuckets.set(key, { at: now, n: 1 });
    return true;
  }
  if (cur.n >= IP_MAX) return false;
  cur.n += 1;
  return true;
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const env = await getCloudflareEnv();
    const ip = clientIp(request) ?? "";
    if (!allowIp(ip)) {
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "上报过于频繁" : "Too many reports",
        },
        429
      );
    }

    const body = (await request.json()) as {
      event_kind?: string;
      page_path?: string;
      page_href?: string;
      failed_url?: string;
      http_status?: number;
      duration_ms?: number;
      cf_ray?: string;
      detail?: Record<string, unknown>;
    };

    const eventKind = (body.event_kind || "").trim() as Worker1102ClientEventKind;
    if (!KIND_SET.has(eventKind)) {
      return jsonResponse({ ok: false, error: "event_kind_invalid" }, 400);
    }
    const pagePath = (body.page_path || "").trim();
    if (!pagePath) {
      return jsonResponse({ ok: false, error: "page_path_required" }, 400);
    }

    const user = await getSessionUserFromRequest(
      env,
      request.headers.get("cookie")
    );

    await recordWorker1102ClientEvent(env.DB, {
      eventKind,
      pagePath,
      pageHref: body.page_href,
      failedUrl: body.failed_url,
      httpStatus: body.http_status,
      durationMs: body.duration_ms,
      cfRay: body.cf_ray,
      username: user?.username ?? "",
      ip,
      detail: {
        ...(body.detail && typeof body.detail === "object" ? body.detail : {}),
        page_href: body.page_href ?? null,
        ua: request.headers.get("user-agent")?.slice(0, 180) ?? null,
      },
    });

    return jsonResponse({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
