import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { deleteJpVocabWordsByIds } from "@/lib/jp-vocab-db";
import { requireAdmin } from "@/lib/admin-auth";

const ADMIN_MSG = {
  en: "Only the Admin account can delete words.",
  zh: "仅 Admin 账户可删除词条。",
};

const ERR = {
  en: {
    word_ids_empty: "Select at least one entry to delete",
    not_found: "No matching entries found",
  },
  zh: {
    word_ids_empty: "请至少选择一条要删除的词条",
    not_found: "未找到要删除的词条",
  },
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, isAdmin } = await requireAdmin(request);
    if (!isAdmin) {
      return jsonResponse({ ok: false, error: ADMIN_MSG[locale] }, 403);
    }

    const body = (await request.json()) as { word_ids?: unknown };
    const wordIds = Array.isArray(body.word_ids)
      ? body.word_ids.map((id) => Number(id))
      : [];

    const result = await deleteJpVocabWordsByIds(env.DB, wordIds);
    if (!result.ok) {
      const msg = ERR[locale][result.error as keyof (typeof ERR)["zh"]];
      const status = result.error === "not_found" ? 404 : 400;
      return jsonResponse({ ok: false, error: msg || result.error }, status);
    }

    return jsonResponse({
      ok: true,
      deleted: result.deleted,
      words: result.words,
      display_order: result.display_order,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
