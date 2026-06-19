import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  hasJpReviewBucket,
  putJpReviewPdf,
  verifyUploadAuth,
} from "@/lib/jp-review";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    if (!hasJpReviewBucket(env)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "R2 bucket JP_REVIEW is not bound. Enable R2 and deploy with wrangler.toml binding.",
        },
        503
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let pdfBytes: ArrayBuffer;
    let sourceFiles: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonResponse({ ok: false, error: "Missing PDF file field" }, 400);
      }
      if (file.size > MAX_BYTES) {
        return jsonResponse({ ok: false, error: "PDF too large (max 50MB)" }, 413);
      }
      pdfBytes = await file.arrayBuffer();
      const rawSources = form.get("source_files");
      if (typeof rawSources === "string" && rawSources.trim()) {
        try {
          const parsed = JSON.parse(rawSources) as unknown;
          if (Array.isArray(parsed)) {
            sourceFiles = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          sourceFiles = rawSources.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
    } else {
      pdfBytes = await request.arrayBuffer();
      if (pdfBytes.byteLength > MAX_BYTES) {
        return jsonResponse({ ok: false, error: "PDF too large (max 50MB)" }, 413);
      }
      const rawSources = request.headers.get("x-jp-review-sources");
      if (rawSources) {
        try {
          const parsed = JSON.parse(rawSources) as unknown;
          if (Array.isArray(parsed)) {
            sourceFiles = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (!pdfBytes.byteLength) {
      return jsonResponse({ ok: false, error: "Empty PDF" }, 400);
    }

    const updatedAt = new Date().toISOString();
    const { removed_objects } = await putJpReviewPdf(env.JP_REVIEW, pdfBytes, {
      updated_at: updatedAt,
      page_count: sourceFiles.length || 1,
      source_files: sourceFiles,
      pdf_bytes: pdfBytes.byteLength,
    });

    return jsonResponse({
      ok: true,
      updated_at: updatedAt,
      bytes: pdfBytes.byteLength,
      pages: sourceFiles.length || 1,
      removed_objects,
      download_path: "/api/jp-review/latest",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
