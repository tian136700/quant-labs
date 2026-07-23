import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getEnVocabTeacherVisibleLimit,
  listEnVocabWordsChangedSince,
} from "@/lib/en-vocab-db";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";

export async function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";
  const includeLimit = new URL(request.url).searchParams.get("limit") !== "0";

  try {
    const env = await getCloudflareEnv();
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
