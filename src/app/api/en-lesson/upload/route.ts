import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  createEnLessonWithOptionalFile,
  parseEnLessonCreateFormData,
} from "@/lib/en-lesson-create-with-file";
import { normalizeEnVocabRefKey } from "@/lib/en-vocab-ref-shared";
import { verifyUploadAuth } from "@/lib/jp-review";
import type { EnLessonKind } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    let createInput;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const parsed = await parseEnLessonCreateFormData(form);
      if (!parsed.ok) {
        return jsonResponse({ ok: false, error: parsed.error }, parsed.status);
      }
      createInput = parsed.input;
    } else {
      const body = (await request.json()) as {
        kind?: EnLessonKind;
        content?: string;
        meanings?: string | null;
        title?: string | null;
        remarks?: string | null;
        category?: string | null;
        ref_key?: string | null;
      };
      createInput = {
        kind: (body.kind === "grammar" ? "grammar" : "word") as EnLessonKind,
        content: String(body.content || "").trim(),
        meanings: (body.meanings || "").trim() || null,
        title: (body.title || "").trim() || null,
        remarks: (body.remarks || "").trim() || null,
        category: (body.category || "").trim() || null,
        ref_key: normalizeEnVocabRefKey(String(body.ref_key || "")) || null,
        fileBytes: null as ArrayBuffer | null,
        mediaType: "image" as const,
      };
    }

    const result = await createEnLessonWithOptionalFile(env, createInput);
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.status);
    }

    return jsonResponse({
      ok: true,
      lesson: result.lesson,
      ref_key: result.ref_key,
      ref_view_path: result.ref_view_path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
