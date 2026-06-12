import { trackVisit } from "@/lib/analytics-db";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { clientCountryCode } from "@/lib/geoip";
import { clientIp } from "@/lib/locale-pref";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!ip) {
    return jsonResponse({ ok: false, error: "Client IP unavailable" }, 400);
  }

  let body: {
    url_path?: string;
    event_type?: string;
    event_detail?: string;
    locale?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const urlPath = (body.url_path || "/").trim();
  const eventType = (body.event_type || "page_view").trim();
  const eventDetail = (body.event_detail || "").trim() || null;
  const locale =
    body.locale === "zh" || body.locale === "en" ? body.locale : null;

  try {
    const env = await getCloudflareEnv();
    await trackVisit(env.DB, {
      ip,
      country_code: clientCountryCode(request),
      url_path: urlPath,
      event_type: eventType,
      event_detail: eventDetail,
      locale,
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
