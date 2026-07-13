import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import {
  getJpVocabTeacherVisibleLimit,
  listJpVocabWordsChangedSince,
} from "@/lib/jp-vocab-db";
import { requireAdmin } from "@/lib/admin-auth";
import { requireJpVocabRead } from "@/lib/jp-vocab-auth";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";

const READ_AUTH_MSG = {
  en: "Please log in to view vocabulary.",
  zh: "请登录后查看单词。",
};

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const url = new URL(request.url);
  const since = url.searchParams.get("since")?.trim() ?? "";
  const includeLimit = url.searchParams.get("limit") !== "0";

  try {
    const { env, allowed } = await requireJpVocabRead(request);
    if (!allowed) {
      return jsonResponse({ ok: false, error: READ_AUTH_MSG[locale] }, 401);
    }

    const { isAdmin } = await requireAdmin(request);
    const [words, teacher_visible_limit] = await Promise.all([
      since ? listJpVocabWordsChangedSince(env.DB, since) : Promise.resolve([]),
      includeLimit
        ? getJpVocabTeacherVisibleLimit(env.DB)
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
