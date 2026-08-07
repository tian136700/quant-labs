import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabPitchAccentUpdates,
  listJpVocabWordsMissingPitchAccent,
  markJpVocabPitchAccentNotFound,
  validateJpVocabPitchAccentForApply,
} from "@/lib/jp-vocab-fill-pitch-accent";
import { verifyUploadAuth } from "@/lib/jp-review";
import { enforceVocabFillRouteRateLimit } from "@/lib/worker-api-rate-limit";

type FillPitchAccentBody = {
  mode?: "list_missing" | "apply" | "mark_not_found";
  dry_run?: boolean;
  limit?: number;
  allow_overwrite?: boolean;
  updates?: Array<{
    word_id?: number;
    pitch_accent?: unknown;
    source?: string;
  }>;
  /** OJAD 查无：只标 OJAD_NONE，UI 只显示普通读音 */
  word_ids?: number[];
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
      "/api/jp-vocab/fill-pitch-accent"
    );
    if (limited) return limited;

    let body: FillPitchAccentBody = {};
    try {
      body = (await request.json()) as FillPitchAccentBody;
    } catch {
      /* empty → list_missing */
    }

    if (body.mode === "mark_not_found") {
      const ids = (Array.isArray(body.word_ids) ? body.word_ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) {
        return jsonResponse({ ok: false, error: "No word_ids" }, 400);
      }
      const result = await markJpVocabPitchAccentNotFound(env.DB, ids, {
        dryRun: Boolean(body.dry_run),
      });
      return jsonResponse({
        ok: true,
        mode: "mark_not_found",
        ...result,
        dry_run: Boolean(body.dry_run),
      });
    }

    const updatesRaw = Array.isArray(body.updates) ? body.updates : [];
    const updates = updatesRaw
      .map((item) => {
        const wordId = Number(item.word_id);
        if (!Number.isInteger(wordId) || wordId <= 0) return null;
        const check = validateJpVocabPitchAccentForApply(item.pitch_accent);
        if (!check.ok) return null;
        return {
          word_id: wordId,
          pitch_accent: check.data,
          source: item.source,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    const mode =
      updates.length > 0 ? "apply" : body.mode === "apply" ? "apply" : "list_missing";

    if (mode === "list_missing") {
      const missing = await listJpVocabWordsMissingPitchAccent(
        env.DB,
        typeof body.limit === "number" ? body.limit : undefined
      );
      return jsonResponse({
        ok: true,
        mode: "list_missing",
        missing,
        total_missing: missing.length,
        updated: 0,
        applied: [],
        skipped: [],
        dry_run: true,
      });
    }

    if (updates.length === 0) {
      return jsonResponse({ ok: false, error: "No valid updates" }, 400);
    }

    const result = await applyJpVocabPitchAccentUpdates(env.DB, updates, {
      dryRun: Boolean(body.dry_run),
      allowOverwrite: Boolean(body.allow_overwrite),
    });

    return jsonResponse({
      ok: true,
      mode: "apply",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
