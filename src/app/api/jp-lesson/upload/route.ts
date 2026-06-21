import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { createJpLesson } from "@/lib/jp-lesson-db";
import { saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { JpLessonKind, JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let kind: JpLessonKind = "word";
    let content = "";
    let title: string | null = null;
    let refKey = "";
    let fileBytes: ArrayBuffer | null = null;
    let mediaType: JpVocabMediaType = "image";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      kind = form.get("kind") === "grammar" ? "grammar" : "word";
      content = String(form.get("content") || "").trim();
      const titleRaw = form.get("title");
      title =
        typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;
      refKey = normalizeJpVocabRefKey(String(form.get("ref_key") || ""));

      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) {
          return jsonResponse({ ok: false, error: "File too large (max 20MB)" }, 413);
        }
        fileBytes = await file.arrayBuffer();
        const rawType = String(form.get("media_type") || "").trim().toLowerCase();
        mediaType =
          rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";
      }
    } else {
      const body = (await request.json()) as {
        kind?: JpLessonKind;
        content?: string;
        title?: string | null;
        ref_key?: string | null;
      };
      kind = body.kind === "grammar" ? "grammar" : "word";
      content = String(body.content || "").trim();
      title = (body.title || "").trim() || null;
      refKey = normalizeJpVocabRefKey(String(body.ref_key || ""));
    }

    if (!content) {
      return jsonResponse({ ok: false, error: "content_required" }, 400);
    }

    if (fileBytes?.byteLength && refKey) {
      const stored = await putJpVocabRefFile(env, refKey, mediaType, fileBytes);
      await saveJpVocabRefFileMeta(
        env.DB,
        refKey,
        title,
        mediaType,
        stored.r2_key
      );
    }

    const result = await createJpLesson(env.DB, {
      kind,
      content,
      title,
      ref_key: refKey || null,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400);
    }

    return jsonResponse({
      ok: true,
      lesson: result.lesson,
      ref_view_path: refKey ? `/api/jp-vocab/ref/${refKey}` : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
