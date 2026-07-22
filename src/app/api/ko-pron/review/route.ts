import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireKoPronAdmin } from "@/lib/ko-pron-auth";
import {
  clearKoPronReviewDone,
  getKoPronReviewProgress,
  listKoPronReviewCatalog,
  recordKoPronReviewDone,
} from "@/lib/ko-pron-db";

const AUTH_MSG = {
  en: "Admin access required.",
  zh: "仅管理员可访问韩语发音复习。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireKoPronAdmin(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }
    const [catalog, progress] = await Promise.all([
      listKoPronReviewCatalog(env.DB),
      getKoPronReviewProgress(env.DB),
    ]);
    return jsonResponse({
      ok: true,
      catalog,
      reviewed_catalog_ids: progress.reviewed_catalog_ids,
      reviewed_count: progress.count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireKoPronAdmin(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }

    const body = (await request.json()) as {
      action?: string;
      catalog_id?: number;
    };

    if (body.action === "clear") {
      const progress = await clearKoPronReviewDone(env.DB);
      return jsonResponse({
        ok: true,
        reviewed_catalog_ids: progress.reviewed_catalog_ids,
        reviewed_count: progress.count,
      });
    }

    if (body.action === "review_next") {
      const catalogId = Number(body.catalog_id);
      if (!Number.isFinite(catalogId) || catalogId < 1) {
        return jsonResponse(
          {
            ok: false,
            error: locale === "zh" ? "参数无效。" : "Invalid parameters.",
          },
          400
        );
      }
      const progress = await recordKoPronReviewDone(env.DB, catalogId);
      return jsonResponse({
        ok: true,
        reviewed_catalog_ids: progress.reviewed_catalog_ids,
        reviewed_count: progress.count,
      });
    }

    return jsonResponse(
      {
        ok: false,
        error: locale === "zh" ? "未知操作。" : "Unknown action.",
      },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
