import { requireAdmin } from "@/lib/admin-auth";
import {
  enqueueLoginIpGeoLookup,
  getCachedIpGeo,
} from "@/lib/etr-auth-db";
import { ipKey } from "@/lib/client-ip";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  forbidden: {
    en: "Admin access required.",
    zh: "需要管理员账号。",
  },
  payload_invalid: {
    en: "Invalid IP.",
    zh: "IP 无效。",
  },
};

/**
 * GET /api/admin/users/ip-geo?ip=
 * **只读缓存**。未命中则入队给 30s 定时任务，本接口绝不打 ip9（防免费接口被挤爆）。
 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: ERR.forbidden[locale] }, 403);
    }

    const url = new URL(request.url);
    const rawIp = url.searchParams.get("ip") ?? "";
    const key = ipKey(rawIp);
    if (!key) {
      return jsonResponse(
        { ok: false, error: ERR.payload_invalid[locale] },
        400
      );
    }

    const geo = await getCachedIpGeo(env.DB, key);
    if (!geo?.ok) {
      await enqueueLoginIpGeoLookup(env.DB, key);
      return jsonResponse({
        ok: true,
        ip: key,
        geo: null,
        pending: true,
      });
    }

    return jsonResponse({
      ok: true,
      ip: key,
      pending: false,
      geo: {
        country: geo.country,
        country_code: geo.country_code,
        prov: geo.prov,
        city: geo.city,
        area: geo.area,
        isp: geo.isp,
        region_label: geo.region_label,
        ok: geo.ok,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
