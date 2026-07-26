import { requireAdmin } from "@/lib/admin-auth";
import {
  findUserById,
  getCachedIpGeoMap,
  listUserLoginHistory,
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
 * 管理员查看某用户历次登录 IP（新→旧，最多 100 条）。
 * 仅附带已缓存的归属地；未缓存的由前端逐个调 /ip-geo（节流），勿在此批量打 ip9。
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
    const geoMap = await getCachedIpGeoMap(
      env.DB,
      rows.map((row) => row.login_ip ?? "").filter(Boolean)
    );

    return jsonResponse({
      ok: true,
      user: { id: user.id, username: user.username },
      history: rows.map((row) => {
        const key = ipKey(row.login_ip);
        const geo = key ? geoMap.get(key) : undefined;
        return {
          id: row.id,
          login_at: row.login_at,
          login_ip: row.login_ip,
          login_ip_display: formatIpForDisplay(row.login_ip),
          region_label: geo?.ok ? geo.region_label || null : null,
          area: geo?.ok ? geo.area : null,
          isp: geo?.ok ? geo.isp : null,
          /** 无缓存才需要前端逐个调 /ip-geo；失败缓存也算已处理 */
          geo_pending: Boolean(key) && !geo,
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
