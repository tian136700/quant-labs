import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import { runTeacherUserQuizCompleteDisable } from "@/lib/teacher-user-quiz-complete-disable";

type Body = {
  dry_run?: boolean;
};

/** 今日抽查完成后延时禁用老师账号（Mac 定时每 15 分钟调一次） */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      /* empty body = live mode */
    }

    const result = await runTeacherUserQuizCompleteDisable(env.DB, {
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
