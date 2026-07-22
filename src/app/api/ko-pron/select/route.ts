import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireKoPronAdmin } from "@/lib/ko-pron-auth";
import {
  listKoPronCatalog,
  selectKoPronCatalogBatchIntoQuiz,
  selectKoPronCatalogIntoQuiz,
} from "@/lib/ko-pron-db";

const AUTH_MSG = {
  en: "Admin access required.",
  zh: "仅管理员可访问韩语发音勾选。",
};

function parseCatalogIds(body: {
  catalog_id?: number;
  catalog_ids?: unknown;
}): number[] {
  if (Array.isArray(body.catalog_ids)) {
    return body.catalog_ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id >= 1);
  }
  const single = Number(body.catalog_id);
  if (Number.isFinite(single) && single >= 1) return [single];
  return [];
}

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
      catalog_ids?: unknown;
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

    const catalogIds = parseCatalogIds(body);
    if (!catalogIds.length) {
      return jsonResponse(
        {
          ok: false,
          error: locale === "zh" ? "请至少勾选一条。" : "Invalid parameters.",
        },
        400
      );
    }

    // 单条仍走原路径（兼容）；多条用 batch，避免循环 D1
    if (catalogIds.length === 1) {
      try {
        const result = await selectKoPronCatalogIntoQuiz(env.DB, catalogIds[0]);
        return jsonResponse({
          ok: true,
          catalog: [result.catalog],
          selected_count: result.already_selected ? 0 : 1,
          skipped_already: result.already_selected ? 1 : 0,
        });
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
    }

    const result = await selectKoPronCatalogBatchIntoQuiz(env.DB, catalogIds);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
