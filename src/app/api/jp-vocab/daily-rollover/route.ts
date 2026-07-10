import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { runJpVocabDailyRollover } from "@/lib/jp-vocab-daily-rollover";
import { verifyUploadAuth } from "@/lib/jp-review";

type DailyRolloverBody = {
  dry_run?: boolean;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: DailyRolloverBody = {};
    try {
      body = (await request.json()) as DailyRolloverBody;
    } catch {
      /* empty body = live mode */
    }

    const result = await runJpVocabDailyRollover(env.DB, {
      dryRun: Boolean(body.dry_run),
    });

    return jsonResponse({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
