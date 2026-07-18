import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import {
  parseLeadMinutes,
  runScheduleClassBarkRemind,
} from "@/lib/schedule-class-bark-remind";

/**
 * 上课提醒（Bark）：开课前 10/5/1 分钟持续铃响。
 * Bearer = JP_REVIEW_UPLOAD_TOKEN；Cron / 手动试跑共用。
 */
async function handle(request: Request): Promise<Response> {
  try {
    const env = await getCloudflareEnv();
    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    let dryRun = url.searchParams.get("dry_run") === "1";
    let forceUid = url.searchParams.get("force_uid")?.trim() || null;
    let forceLeadRaw = url.searchParams.get("force_lead");
    let leadRaw = url.searchParams.get("leads");

    if (request.method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (body.dry_run === true || body.dry_run === 1 || body.dry_run === "1") {
            dryRun = true;
          }
          if (typeof body.force_uid === "string" && body.force_uid.trim()) {
            forceUid = body.force_uid.trim();
          }
          if (body.force_lead != null) {
            forceLeadRaw = String(body.force_lead);
          }
          if (typeof body.leads === "string") {
            leadRaw = body.leads;
          }
        } catch {
          /* ignore empty body */
        }
      }
    }

    const forceLead = forceLeadRaw
      ? Number.parseInt(forceLeadRaw, 10)
      : NaN;

    const result = await runScheduleClassBarkRemind(env, {
      dryRun,
      forceUid,
      forceLead: Number.isFinite(forceLead) && forceLead > 0 ? forceLead : null,
      leadMinutes: leadRaw ? parseLeadMinutes(leadRaw) : undefined,
    });

    return jsonResponse({
      ...result,
      timezone: "Asia/Shanghai",
      display_timezone: "Asia/Bangkok",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message, notified: 0 }, 500);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
