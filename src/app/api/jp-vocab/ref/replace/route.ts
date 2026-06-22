import { getCloudflareEnv, jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { syncJpLessonTitleByRefKey } from "@/lib/jp-lesson-db";
import { getJpVocabRef, saveJpVocabRefFileMeta } from "@/lib/jp-vocab-db";
import { requireJpVocabAccess } from "@/lib/jp-vocab-auth";
import { putJpVocabRefFile } from "@/lib/jp-vocab-ref-server";
import { normalizeJpVocabRefKey } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabMediaType } from "@/lib/types";

const MAX_BYTES = 20 * 1024 * 1024;

const AUTH_MSG = {
  en: "Please log in to edit lesson plans.",
  zh: "请登录后再编辑教案。",
};

export async function POST(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, user, allowed } = await requireJpVocabAccess(request);
    if (!allowed || !user) {
      return jsonResponse({ ok: false, error: AUTH_MSG[locale] }, 401);
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

    const existing = await getJpVocabRef(env.DB, refKey);
    if (!existing) {
      return jsonResponse({ ok: false, error: "ref_not_found" }, 404);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ ok: false, error: "file_required" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse({ ok: false, error: "file_too_large" }, 413);
    }

    const rawType = String(form.get("media_type") || "").trim().toLowerCase();
    const mediaType: JpVocabMediaType =
      rawType === "pdf" || file.type === "application/pdf" ? "pdf" : "image";

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : existing.title;

    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) {
      return jsonResponse({ ok: false, error: "empty_file" }, 400);
    }

    const stored = await putJpVocabRefFile(env, refKey, mediaType, bytes);
    const ref = await saveJpVocabRefFileMeta(
      env.DB,
      refKey,
      title,
      mediaType,
      stored.r2_key
    );

    if (title !== existing.title) {
      await syncJpLessonTitleByRefKey(env.DB, refKey, title);
    }

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
