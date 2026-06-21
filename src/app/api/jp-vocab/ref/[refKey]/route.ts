import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getJpVocabRef } from "@/lib/jp-vocab-db";
import {
  getJpVocabRefR2Object,
  readLocalJpVocabRefFile,
} from "@/lib/jp-vocab-ref-server";
import {
  isLocalJpVocabRefMarker,
  jpVocabRefContentType,
} from "@/lib/jp-vocab-ref-shared";

export async function GET(
  _request: Request,
  context: { params: Promise<{ refKey: string }> }
) {
  try {
    const { refKey } = await context.params;
    const env = await getCloudflareEnv();
    const ref = await getJpVocabRef(env.DB, refKey);

    if (!ref) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers({
      "Content-Type": jpVocabRefContentType(ref.media_type),
      "Cache-Control": "public, max-age=3600",
    });

    if (isLocalJpVocabRefMarker(ref.r2_key)) {
      const bytes = await readLocalJpVocabRefFile(ref.ref_key, ref.media_type);
      if (!bytes) {
        return new Response("Reference file not uploaded yet", { status: 404 });
      }
      return new Response(bytes, { headers });
    }

    const obj = await getJpVocabRefR2Object(env, ref.r2_key);
    if (!obj) {
      return new Response("Reference file not uploaded yet", { status: 404 });
    }

    const etag = obj.httpEtag || obj.etag;
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 500 });
  }
}
