import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { runTeacherUserPostClassDisable } from "@/lib/teacher-user-schedule-enable";

type PostClassDisableBody = {
  dry_run?: boolean;
};

export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: PostClassDisableBody = {};
    try {
      body = (await request.json()) as PostClassDisableBody;
    } catch {
      /* empty body = live mode */
    }

    const result = await runTeacherUserPostClassDisable(env.DB, {
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
