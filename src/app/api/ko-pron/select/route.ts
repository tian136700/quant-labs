import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireKoPronAdmin } from "@/lib/ko-pron-auth";
import {
  listKoPronCatalog,
  selectKoPronCatalogIntoQuiz,
} from "@/lib/ko-pron-db";

const AUTH_MSG = {
  en: "Admin access required.",
  zh: "仅管理员可访问韩语发音勾选。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  try {
    const { env, allowed } = await requireKoPronAdmin(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
    }
    const catalog = await listKoPronCatalog(env.DB);
    return jsonResponse({ ok: true, catalog });
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

    if (body.action !== "select") {
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "未知操作。" : "Unknown action.",
        },
        400
      );
    }

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

    try {
      const result = await selectKoPronCatalogIntoQuiz(env.DB, catalogId);
      return jsonResponse({ ok: true, ...result });
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      if (code === "catalog_not_found") {
        return jsonResponse(
          {
            ok: false,
            error: locale === "zh" ? "字母不存在。" : "Letter not found.",
          },
          404
        );
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
