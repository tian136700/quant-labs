import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { createEnLesson, updateEnLessonRefKey } from "@/lib/en-lesson-db";
import { normalizeEnVocabCategory } from "@/lib/en-vocab-category";
import { saveEnVocabRefFileMeta } from "@/lib/en-vocab-db";
import { putEnVocabRefFile } from "@/lib/en-vocab-ref-server";
import { enLessonRefKey, normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { EnLessonKind, EnVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let kind: EnLessonKind = "word";
    let content = "";
    let title: string | null = null;
    let categoryRaw: string | null = null;
    let refKey = "";
    let fileBytes: ArrayBuffer | null = null;
    let mediaType: EnVocabMediaType = "image";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      kind = form.get("kind") === "grammar" ? "grammar" : "word";
      content = String(form.get("content") || "").trim();
      const titleRaw = form.get("title");
      title =
        typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;
      const catRaw = form.get("category");
      categoryRaw =
        typeof catRaw === "string" && catRaw.trim() ? catRaw.trim() : null;
      refKey = normalizeEnVocabRefKey(String(form.get("ref_key") || ""));

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
        kind?: EnLessonKind;
        content?: string;
        title?: string | null;
        category?: string | null;
        ref_key?: string | null;
      };
      kind = body.kind === "grammar" ? "grammar" : "word";
      content = String(body.content || "").trim();
      title = (body.title || "").trim() || null;
      categoryRaw = (body.category || "").trim() || null;
      refKey = normalizeEnVocabRefKey(String(body.ref_key || ""));
    }

    if (!content) {
      return jsonResponse({ ok: false, error: "content_required" }, 400);
    }

    const category = normalizeEnVocabCategory(categoryRaw);
    const hasFile = Boolean(fileBytes?.byteLength);

    const result = await createEnLesson(env.DB, {
      kind,
      content,
      title,
      category,
      ref_key: hasFile ? null : refKey || null,
    });

    if (!result.ok) {
      const status = result.error === "content_duplicate" ? 409 : 400;
      return jsonResponse({ ok: false, error: result.error }, status);
    }

    let lesson = result.lesson;
    let assignedRefKey: string | null = lesson.ref_key;

    if (hasFile && fileBytes) {
      assignedRefKey = enLessonRefKey(lesson.id);
      const stored = await putEnVocabRefFile(
        env,
        assignedRefKey,
        mediaType,
        fileBytes
      );
      await saveEnVocabRefFileMeta(
        env.DB,
        assignedRefKey,
        title,
        mediaType,
        stored.r2_key
      );
      const updated = await updateEnLessonRefKey(env.DB, lesson.id, assignedRefKey);
      if (updated) lesson = updated;
    }

    return jsonResponse({
      ok: true,
      lesson,
      ref_key: assignedRefKey,
      ref_view_path: assignedRefKey
        ? `/api/en-vocab/ref/${assignedRefKey}`
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
