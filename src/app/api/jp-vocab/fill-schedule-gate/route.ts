import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  evaluateJpVocabFillScheduleGate,
  JP_VOCAB_FILL_QUIZ_COOLDOWN_MS,
} from "@/lib/jp-vocab-fill-schedule-gate";
import { verifyUploadAuth } from "@/lib/jp-review";

type GateBody = {
  /** 冷却分钟数；默认 60（最后一词抽查后再等 1 小时） */
  cooldown_minutes?: number;
};

/**
 * Mac 例句/释义补全门禁（轻量）：
 * POST + Bearer = JP_REVIEW_UPLOAD_TOKEN
 * 按「今日最后一次抽查勾选 + 1h」决定是否跳过，替代旧的 08–24 固定静默。
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
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
