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
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("limit") || "50", 10);
    const result = await listVisitLogs(env.DB, page, pageSize);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
