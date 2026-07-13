import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabMeaningUpdates,
  scanJpVocabWordsMissingMeaning,
} from "@/lib/jp-vocab-fill-meaning";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillMeaningBody = {
  dry_run?: boolean;
  updates?: Array<{ word_id?: number; meaning?: string }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: FillMeaningBody = {};
    try {
      body = (await request.json()) as FillMeaningBody;
    } catch {
      /* empty body = scan mode */
    }

    const dryRun = Boolean(body.dry_run);
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        meaning: String(item.meaning ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) && item.word_id > 0 && item.meaning.length > 0
      );

    const result =
      updates.length > 0
        ? await applyJpVocabMeaningUpdates(env.DB, updates, { dryRun })
        : await scanJpVocabWordsMissingMeaning(env.DB);

    return jsonResponse({
      ok: true,
      mode: updates.length > 0 ? "apply" : "scan",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
