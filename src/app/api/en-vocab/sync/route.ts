import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { requireAdmin } from "@/lib/admin-auth";
import { listEnVocabWordsChangedSince } from "@/lib/en-vocab-db";
import { redactJpVocabWordsMnemonicForClient } from "@/lib/jp-vocab-mnemonic";

export async function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since")?.trim() ?? "";

  try {
    const env = await getCloudflareEnv();
    const { isAdmin } = await requireAdmin(request);
    const words = await listEnVocabWordsChangedSince(env.DB, since);
    return jsonResponse(
      {
        ok: true,
        words: redactJpVocabWordsMnemonicForClient(words, isAdmin),
      },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
