import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import { requireEnVocabRead } from "@/lib/en-vocab-auth";
import {
  getEnVocabTeacherVisibleLimit,
  listEnVocabWordsChangedSince,
} from "@/lib/en-vocab-db";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";

const READ_AUTH_MSG = {
  en: "Please log in to view English vocabulary.",
  zh: "请登录后查看英语抽背。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";
  const includeLimit = new URL(request.url).searchParams.get("limit") !== "0";

  try {
    const { env, allowed } = await requireEnVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }
    const { isAdmin } = await requireAdmin(request);
    const [words, teacher_visible_limit] = await Promise.all([
      listEnVocabWordsChangedSince(env.DB, since),
      includeLimit
        ? getEnVocabTeacherVisibleLimit(env.DB)
        : Promise.resolve(null),
    ]);
    return jsonResponse(
      {
        ok: true,
        words: redactJpVocabWordsMnemonicForClient(words, isAdmin),
        ...(teacher_visible_limit ? { teacher_visible_limit } : {}),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
