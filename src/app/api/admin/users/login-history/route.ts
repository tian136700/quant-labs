import { requireAdmin } from "@/lib/admin-auth";
import { findUserById, listUserLoginHistory } from "@/lib/etr-auth-db";
import { formatIpForDisplay } from "@/lib/client-ip";
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
    return jsonResponse({
      ok: true,
      user: { id: user.id, username: user.username },
      history: rows.map((row) => ({
        id: row.id,
        login_at: row.login_at,
        login_ip: row.login_ip,
        login_ip_display: formatIpForDisplay(row.login_ip),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
