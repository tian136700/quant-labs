import { vocabFillRouteErrorResponse } from "@/lib/vocab-fill-route-error";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  evaluateJpVocabFillScheduleGate,
  JP_VOCAB_FILL_QUIZ_COOLDOWN_MS,
} from "@/lib/jp-vocab-fill-schedule-gate";
import { verifyUploadAuth } from "@/lib/jp-review";

type GateBody = {
  /** 冷却分钟数；默认 30（最后一词抽查后再等半小时） */
  cooldown_minutes?: number;
};

/**
 * Mac 日/英语词表补全门禁（轻量）：
 * POST + Bearer = JP_REVIEW_UPLOAD_TOKEN
 * 开始抽查（live）立刻静默；抽查中持续静默；
 * 最后一词勾选后再等默认 30 分钟才允许跑（日语或英语任一抽查都挡全部 fill）。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();

    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: GateBody = {};
    try {
      body = (await request.json()) as GateBody;
    } catch {
      /* empty ok */
    }

    let cooldownMs = JP_VOCAB_FILL_QUIZ_COOLDOWN_MS;
    if (
      typeof body.cooldown_minutes === "number" &&
      Number.isFinite(body.cooldown_minutes) &&
      body.cooldown_minutes > 0
    ) {
      cooldownMs = Math.floor(body.cooldown_minutes) * 60 * 1000;
    }

    const gate = await evaluateJpVocabFillScheduleGate(env.DB, new Date(), cooldownMs);
    return jsonResponse({ ok: true, ...gate });
  } catch (err) {
    return vocabFillRouteErrorResponse(request, err);
  }
}
