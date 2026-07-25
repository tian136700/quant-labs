import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  applyJpVocabMeaningUpdates,
  clearAllJpVocabWordMeanings,
  scanJpVocabWordsMissingMeaning,
} from "@/lib/jp-vocab-fill-meaning";
import { verifyUploadAuth } from "@/lib/jp-review";

type FillMeaningBody = {
  /** list_missing=拉取缺释义（默认）；apply=提交 updates；clear_all=清空全部单词释义 */
  mode?: "list_missing" | "apply" | "clear_all";
  dry_run?: boolean;
  /** list_missing：最多返回几条（定时建议 1；禁止一次拉几百） */
  limit?: number;
  /** apply：整批默认来源（单条 updates[].source 优先） */
  source?: string;
  /** 允许覆盖已有 meaning（纠错 / 多读音重跑） */
  allow_overwrite?: boolean;
  updates?: Array<{
    word_id?: number;
    meaning?: string;
    source?: string;
    meaning_source?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: FillMeaningBody = {};
    try {
      body = (await request.json()) as FillMeaningBody;
    } catch {
      /* empty body = list_missing */
    }

    const dryRun = Boolean(body.dry_run);
    const batchSource =
      typeof body.source === "string" ? body.source.trim() : "";
    const updates = (Array.isArray(body.updates) ? body.updates : [])
      .map((item) => {
        const per =
          (typeof item.source === "string" && item.source.trim()) ||
          (typeof item.meaning_source === "string" && item.meaning_source.trim()) ||
          "";
        return {
          word_id: Number(item.word_id),
          meaning: String(item.meaning ?? "").trim(),
          source: per || null,
        };
      })
      .filter(
        (item) =>
          Number.isInteger(item.word_id) &&
          item.word_id > 0 &&
          item.meaning.length > 0
      );

    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : undefined;

    if (body.mode === "clear_all") {
      const result = await clearAllJpVocabWordMeanings(env.DB, { dryRun });
      return jsonResponse({
        ok: true,
        mode: "clear_all",
        ...result,
      });
    }

    if (updates.length > 0 || body.mode === "apply") {
      const result = await applyJpVocabMeaningUpdates(env.DB, updates, {
        dryRun,
        validateFormat: true,
        defaultSource: batchSource || null,
        allowOverwrite: Boolean(body.allow_overwrite),
      });
      return jsonResponse({
        ok: true,
        mode: "apply",
        ...result,
      });
    }

    const result = await scanJpVocabWordsMissingMeaning(env.DB, { limit });
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
