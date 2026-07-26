import { requireAdmin } from "@/lib/admin-auth";
import {
  enqueueLoginIpGeoLookup,
  findUserById,
  getCachedIpGeoMap,
  listUserLoginHistory,
  copyIpGeoOntoLoginHistory,
} from "@/lib/etr-auth-db";
import { formatIpForDisplay, ipKey } from "@/lib/client-ip";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";

const ERR: Record<string, Record<"en" | "zh", string>> = {
  forbidden: {
    en: "Admin access required.",
    zh: "需要管理员账号。",
  },
  user_not_found: {
    en: "User not found.",
    zh: "用户不存在。",
  },
  payload_invalid: {
    en: "Invalid request payload.",
    zh: "请求数据无效。",
  },
};

/**
 * GET /api/admin/users/login-history?user_id=
 * 只读：优先用登录行上已抄好的归属地；否则读缓存。
 * 不调 ip9；缺归属地由 30s 定时队列补，弹窗可软刷新。
 */
export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse(
        { ok: false, error: ERR.forbidden[locale] },
        403
      );
    }

    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("user_id"));
    if (!Number.isInteger(userId) || userId <= 0) {
      return jsonResponse(
        { ok: false, error: ERR.payload_invalid[locale] },
        400
      );
    }

    const user = await findUserById(env.DB, userId);
    if (!user) {
      return jsonResponse(
        { ok: false, error: ERR.user_not_found[locale] },
        404
      );
    }

    const rows = await listUserLoginHistory(env.DB, userId, 100);
    const needCache = rows
      .filter((row) => row.login_ip && !(row.geo_region_label || "").trim())
      .map((row) => row.login_ip as string);
    const geoMap = await getCachedIpGeoMap(env.DB, needCache);

    const toEnqueue = new Set<string>();
    for (const row of rows) {
      const key = ipKey(row.login_ip);
      if (!key) continue;
      if ((row.geo_region_label || "").trim()) continue;
      const geo = geoMap.get(key);
      if (geo?.ok) {
        await copyIpGeoOntoLoginHistory(env.DB, key, geo);
        row.geo_region_label = geo.region_label || null;
        row.geo_area = geo.area;
        row.geo_isp = geo.isp;
      } else if (!geo) {
        toEnqueue.add(key);
      }
    }
    for (const ip of toEnqueue) {
      await enqueueLoginIpGeoLookup(env.DB, ip);
    }

    return jsonResponse({
      ok: true,
      user: { id: user.id, username: user.username },
      history: rows.map((row) => {
        const key = ipKey(row.login_ip);
        const label = (row.geo_region_label || "").trim();
        return {
          id: row.id,
          login_at: row.login_at,
          login_ip: row.login_ip,
          login_ip_display: formatIpForDisplay(row.login_ip),
          region_label: label || null,
          area: row.geo_area ?? null,
          isp: row.geo_isp ?? null,
          geo_pending: Boolean(key) && !label,
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
