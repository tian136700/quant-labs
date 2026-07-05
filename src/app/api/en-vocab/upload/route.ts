import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { uploadEnVocabWords } from "@/lib/en-vocab-db";
import type { EnVocabRefUploadInput, EnVocabUploadInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      replace?: boolean;
      words?: EnVocabUploadInput[];
      refs?: EnVocabRefUploadInput[];
    };

    const words = Array.isArray(body.words) ? body.words : [];
    const refs = Array.isArray(body.refs) ? body.refs : [];
    const result = await uploadEnVocabWords(
      env.DB,
      words,
      Boolean(body.replace),
      refs
    );

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      total: result.total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
