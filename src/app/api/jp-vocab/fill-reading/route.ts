import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabReadingUpdates,
  autoFillJpVocabReadings,
  listJpVocabWordsMissingReading,
} from "@/lib/jp-vocab-fill-reading";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillReadingBody = {
  /** list_missing=仅 SQL 列举；auto=Worker 内规则补全（有上限）；apply=提交 updates */
  mode?: "list_missing" | "auto" | "apply";
  dry_run?: boolean;
  use_jisho?: boolean;
  jisho_delay_ms?: number;
  limit?: number;
  /** 允许覆盖已有 reading（多读音纠错） */
  allow_overwrite?: boolean;
  updates?: Array<{ word_id?: number; reading?: string }>;
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
      "/api/jp-vocab/fill-reading"
    );
    if (limited) return limited;

    let body: FillReadingBody = {};
    try {
      body = (await request.json()) as FillReadingBody;
    } catch {
      /* empty body → list_missing（禁止默认跑全量 autoFill，以免 1102） */
    }

    const dryRun = Boolean(body.dry_run);
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => ({
        word_id: Number(item.word_id),
        reading: String(item.reading ?? "").trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.word_id) && item.word_id > 0 && item.reading.length > 0
      );

    const mode =
      updates.length > 0
        ? "apply"
        : body.mode === "auto"
          ? "auto"
          : "list_missing";

    if (mode === "list_missing") {
      const missing = await listJpVocabWordsMissingReading(env.DB);
      return jsonResponse({
        ok: true,
        mode: "list_missing",
        missing,
        updated: 0,
        applied: [],
        skipped: [],
        skipped_long: [],
        jisho_errors: 0,
        dry_run: true,
      });
    }

    if (mode === "apply") {
      const result = await applyJpVocabReadingUpdates(env.DB, updates, {
        dryRun,
        allowOverwrite: Boolean(body.allow_overwrite),
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await autoFillJpVocabReadings(env.DB, {
      dryRun,
      // 须显式 true 才开；默认关，避免 Worker 内打 Jisho
      useJisho: body.use_jisho === true,
      jishoDelayMs:
        typeof body.jisho_delay_ms === "number" && body.jisho_delay_ms >= 0
          ? body.jisho_delay_ms
          : 350,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });

    return jsonResponse({
      ok: true,
      mode: "auto",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
