import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  JP_REVIEW_LATEST_KEY,
  hasJpReviewBucket,
  readJpReviewMeta,
  verifyDownloadAccess,
} from "@/lib/jp-review";

export async function GET(request: Request) {
  try {
    const env = await getCloudflareEnv();
    const url = new URL(request.url);
    const wantsMeta = url.searchParams.get("meta") === "1";

    if (!verifyDownloadAccess(request, env)) {
      return jsonResponse({ ok: false, error: "Forbidden" }, 403);
    }

    if (!hasJpReviewBucket(env)) {
      return jsonResponse({ ok: false, error: "Review PDF not configured" }, 503);
    }

    if (wantsMeta) {
      const meta = await readJpReviewMeta(env.JP_REVIEW);
      if (!meta) {
        return jsonResponse({ ok: false, error: "No review PDF yet" }, 404);
      }
      return jsonResponse({ ok: true, meta });
    }

    const obj = await env.JP_REVIEW.get(JP_REVIEW_LATEST_KEY);
    if (!obj) {
      return jsonResponse({ ok: false, error: "No review PDF yet" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set(
      "Content-Disposition",
      'attachment; filename="jp-review-latest.pdf"'
    );
    headers.set("Cache-Control", "public, max-age=300");

    const etag = obj.httpEtag || obj.etag;
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
