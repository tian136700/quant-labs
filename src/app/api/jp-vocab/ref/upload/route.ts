import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { ok: false, error: "Use multipart/form-data with ref_key and file" },
        400
      );
    }

    const form = await request.formData();
    const refKey = normalizeJpVocabRefKey(String(form.get("ref_key") || ""));
    if (!refKey) {
      return jsonResponse({ ok: false, error: "ref_key_required" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ ok: false, error: "Missing file field" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ ok: false, error: "File too large (max 20MB)" }, 413);
    }

    const rawType = String(form.get("media_type") || "").trim().toLowerCase();
    const mediaType: JpVocabMediaType =
      rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse({ ok: false, error: "Empty file" }, 400);
    }

    const stored = await putJpVocabRefFile(env, refKey, mediaType, bytes);
    const ref = await saveJpVocabRefFileMeta(
      env.DB,
      refKey,
      title,
      mediaType,
      stored.r2_key
    );

    return jsonResponse({
      ok: true,
      ref,
      storage: stored.storage,
      view_path: `/api/jp-vocab/ref/${refKey}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
