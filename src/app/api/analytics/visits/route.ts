import {
  listDistinctVisitUsernames,
  listVisitLogs,
  VISIT_LOG_USERNAME_UNREGISTERED,
} from "@/lib/analytics-db";
import { requirePermission } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { listEtrUsers } from "@/lib/etr-auth-db";

const ERROR_MSG: Record<"en" | "zh", string> = {
  en: "Admin login required.",
  zh: "需要管理员登录。",
};

function mergeUsernameOptions(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const name of list) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
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
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("limit") || "50", 10);
    const sortParam = url.searchParams.get("sort");
    const orderParam = url.searchParams.get("order");
    const usernameParam = url.searchParams.get("username")?.trim();
    const usernameFilter =
      usernameParam === VISIT_LOG_USERNAME_UNREGISTERED || usernameParam
        ? usernameParam
        : null;
    const sort = sortParam === "ip_visit_count" ? "ip_visit_count" : "created_at";
    const order = orderParam === "asc" ? "asc" : "desc";

    const [result, visitUsernames, etrUsers] = await Promise.all([
      listVisitLogs(env.DB, page, pageSize, sort, order, usernameFilter),
      listDistinctVisitUsernames(env.DB),
      listEtrUsers(env.DB),
    ]);

    return jsonResponse({
      ok: true,
      ...result,
      usernames: mergeUsernameOptions(
        visitUsernames,
        etrUsers.map((user) => user.username)
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
