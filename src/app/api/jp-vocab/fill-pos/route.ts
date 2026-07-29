import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabPosUpdates,
  scanJpVocabWordsMissingPos,
} from "@/lib/jp-vocab-fill-pos";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillPosBody = {
  /** list_missing=拉取缺词性（默认）；apply=提交 updates */
  mode?: "list_missing" | "apply";
  dry_run?: boolean;
  /** list_missing：最多返回几条（定时建议 1） */
  limit?: number;
  updates?: Array<{
    word_id?: number;
    pos?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const limited = await enforceVocabFillRouteRateLimit(
      env.DB,
      request,
      "/api/jp-vocab/fill-pos"
    );
    if (limited) return limited;

    let body: FillPosBody = {};
    try {
      body = (await request.json()) as FillPosBody;
    } catch {
      /* empty body = list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        pos: String(item.pos ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) && item.word_id > 0 && item.pos.length > 0
      );

    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyJpVocabPosUpdates(env.DB, updates, {
        dryRun,
        validateFormat: true,
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanJpVocabWordsMissingPos(env.DB, { limit });
    return jsonResponse({
      ok: true,
      mode: "list_missing",
      ...(limit != null ? { limit } : {}),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
