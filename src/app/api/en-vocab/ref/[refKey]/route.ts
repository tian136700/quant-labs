import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { getEnVocabRef } from "@/lib/en-vocab-db";
import { isAdminSuperuser } from "@/lib/rbac";
import {
  getEnVocabRefR2Object,
  readLocalEnVocabRefFile,
} from "@/lib/en-vocab-ref-server";
import {
  isLocalEnVocabRefMarker,
  enVocabRefContentType,
} from "@/lib/en-vocab-ref-shared";

function refResponseHeaders(
  mediaType: "image" | "pdf",
  filename: string,
  asDownload: boolean,
  byteLength?: number
): Headers {
  const headers = new Headers({
    "Content-Type": enVocabRefContentType(mediaType),
    "X-Content-Type-Options": "nosniff",
  });

  if (asDownload) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    headers.set("Cache-Control", "private, no-transform, max-age=0");
    headers.set("Content-Encoding", "identity");
  } else {
    headers.set("Cache-Control", "public, max-age=3600, no-transform");
  }

  if (byteLength != null && byteLength > 0) {
    headers.set("Content-Length", String(byteLength));
  }

  return headers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ refKey: string }> }
) {
  try {
    const { refKey } = await context.params;
    const url = new URL(request.url);
    const asDownload = url.searchParams.get("download") === "1";
    const env = await getCloudflareEnv();
    const ref = await getEnVocabRef(env.DB, refKey);

    if (!ref) {
      return new Response("Not found", { status: 404 });
    }

    if (asDownload && ref.media_type === "image") {
      const user = await getSessionUserFromRequest(env, request.headers.get("cookie"));
      if (!isAdminSuperuser(user?.role)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const ext = ref.media_type === "pdf" ? "pdf" : "png";
    const filename = `${ref.ref_key}.${ext}`;

    if (isLocalEnVocabRefMarker(ref.r2_key)) {
      const bytes = await readLocalEnVocabRefFile(ref.ref_key, ref.media_type);
      if (!bytes) {
        return new Response("Reference file not uploaded yet", { status: 404 });
      }
      const headers = refResponseHeaders(
        ref.media_type,
        filename,
        asDownload,
        bytes.byteLength
      );
      return new Response(bytes, { headers });
    }

    const obj = await getEnVocabRefR2Object(env, ref.r2_key);
    if (!obj) {
      return new Response("Reference file not uploaded yet", { status: 404 });
    }

    const headers = refResponseHeaders(ref.media_type, filename, asDownload);
    const etag = obj.httpEtag || obj.etag;
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 500 });
  }
}
