import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyEnVocabExampleSentenceUpdates,
  scanEnVocabWordsMissingExampleSentences,
} from "@/lib/en-vocab-fill-example-sentences";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillExampleSentencesBody = {
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  limit?: number;
  kind?: "word" | "grammar";
  source?: string;
  updates?: Array<{
    word_id?: number;
    example_sentences?: string;
    source?: string;
    example_sentences_source?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: FillExampleSentencesBody = {};
    try {
      body = (await request.json()) as FillExampleSentencesBody;
    } catch {
      /* empty body = list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const batchSource =
      typeof body.source === "string" ? body.source.trim() : "";
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => {
        const per =
          (typeof item.source === "string" && item.source.trim()) ||
          (typeof item.example_sentences_source === "string" &&
            item.example_sentences_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          example_sentences: String(item.example_sentences ?? "").trim(),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.example_sentences.length > 0
      );

    const kind =
      body.kind === "word" || body.kind === "grammar" ? body.kind : undefined;
    const limit =
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyEnVocabExampleSentenceUpdates(env.DB, updates, {
        dryRun,
        validateFormat: true,
        defaultSource: batchSource || null,
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanEnVocabWordsMissingExampleSentences(env.DB, {
      limit,
      kind,
    });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...result,
    });
  } catch (err) {
    console.error("[en-vocab/fill-example-sentences]", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      500
    );
  }
}
