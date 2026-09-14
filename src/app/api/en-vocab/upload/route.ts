import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { uploadEnVocabWords } from "@/lib/en-vocab-db";
import {
  partitionEnVocabUploadWordsAgainstProbes,
  sanitizeEnVocabLocalUploadInputs,
} from "@/lib/en-vocab-local-upload";
import { EN_VOCAB_UPLOAD_SOURCE_API } from "@/lib/en-vocab-upload-source";
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

    const partitioned = partitionEnVocabUploadWordsAgainstProbes(
      sanitizeEnVocabLocalUploadInputs(
        Array.isArray(body.words) ? body.words : []
      )
    );
    const words = partitioned.accepted.map((w) => ({
      ...w,
      upload_source: w.upload_source || EN_VOCAB_UPLOAD_SOURCE_API,
    }));
    const refs = Array.isArray(body.refs) ? body.refs : [];
    if (!words.length) {
      return jsonResponse({
        ok: true,
        added: 0,
        skipped: 0,
        total: 0,
        rejected_probe_words: partitioned.rejected_probe_words,
        upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
        upload_source_label: "通过API接口上传",
      });
    }
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
      rejected_probe_words: partitioned.rejected_probe_words,
      upload_source: EN_VOCAB_UPLOAD_SOURCE_API,
      upload_source_label: "通过API接口上传",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
