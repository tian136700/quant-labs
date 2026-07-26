import { requireAdmin } from "@/lib/admin-auth";
import { resolveIpGeoCached } from "@/lib/etr-auth-db";
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
 * 单次查一个 IP 的归属地（省/市/区县）。先读 D1 缓存，未命中再串行请求 ip9.com.cn。
 * 客户端必须逐个调用，禁止并行。
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

    const geo = await resolveIpGeoCached(env.DB, key);
    if (!geo) {
      return jsonResponse({
        ok: true,
        ip: key,
        geo: null,
      });
    }

    return jsonResponse({
      ok: true,
      ip: key,
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
