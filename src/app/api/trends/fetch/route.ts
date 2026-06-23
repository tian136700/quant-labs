import { requireAdmin } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { ingestTrendFetch } from "@/lib/trend-db";
import { runTrendFetchPipeline } from "@/lib/trend-pipeline";

export const maxDuration = 60;

const ERROR_MSG: Record<"en" | "zh", Record<string, string>> = {
  en: {
    auth: "Admin login required.",
    fetchFailed: "Fetch failed. Check server logs or try again later.",
  },
  zh: {
    auth: "需要管理员登录。",
    fetchFailed: "抓取失败，请稍后重试或查看服务端日志。",
  },
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse(
        { ok: false, error: ERROR_MSG[locale].auth, auth_required: true },
        401
      );
    }

    const payload = await runTrendFetchPipeline();
    const result = await ingestTrendFetch(env.DB, payload);

    return jsonResponse({
      ok: true,
      run_id: result.run_id,
      item_count: result.item_count,
      selected_count: result.selected_count,
      github_count: payload.github_count,
      reddit_count: payload.reddit_count,
      combined_count: payload.combined_count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("trends/fetch:", message);
    return jsonResponse(
      { ok: false, error: ERROR_MSG[locale].fetchFailed, detail: message },
      500
    );
  }
}
