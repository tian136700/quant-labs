import { listVisitLogs } from "@/lib/analytics-db";
import { requireAdmin } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";

const ERROR_MSG: Record<"en" | "zh", string> = {
  en: "Admin login required.",
  zh: "需要管理员登录。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse(
        { ok: false, error: ERROR_MSG[locale], auth_required: true },
        401
      );
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "500", 10);
    const records = await listVisitLogs(env.DB, limit);
    return jsonResponse({ ok: true, records });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
