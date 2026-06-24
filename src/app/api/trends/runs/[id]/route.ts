import { requirePermission } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { getTrendFetchRun, getTrendItem } from "@/lib/trend-db";

const ERROR_MSG: Record<"en" | "zh", string> = {
  en: "Admin login required.",
  zh: "需要管理员登录。",
};

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requirePermission(request, "admin:trends");
    if (!allowed) {
      return jsonResponse(
        { ok: false, error: ERROR_MSG[locale], auth_required: true },
        401
      );
    }

    const { id } = await context.params;
    const runId = parseInt(id, 10);
    if (!runId) {
      return jsonResponse({ ok: false, error: "Invalid run id" }, 400);
    }

    const url = new URL(request.url);
    const itemIdParam = url.searchParams.get("item_id");
    if (itemIdParam) {
      const itemId = parseInt(itemIdParam, 10);
      if (!itemId) {
        return jsonResponse({ ok: false, error: "Invalid item id" }, 400);
      }
      const item = await getTrendItem(env.DB, itemId);
      if (!item || item.run_id !== runId) {
        return jsonResponse({ ok: false, error: "Item not found" }, 404);
      }
      return jsonResponse({ ok: true, item });
    }

    const run = await getTrendFetchRun(env.DB, runId);
    if (!run) {
      return jsonResponse({ ok: false, error: "Run not found" }, 404);
    }

    return jsonResponse({ ok: true, run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
