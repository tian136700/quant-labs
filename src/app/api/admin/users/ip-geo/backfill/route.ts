import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import { verifyUploadAuth } from "@/lib/jp-review";
import {
  getLoginIpGeoBackfillStatus,
  requeueLoginIpGeoBackfill,
  stepLoginIpGeoBackfill,
} from "@/lib/etr-auth-db";

type BackfillBody = {
  /** status | step | requeue */
  mode?: string;
  dry_run?: boolean;
};

/**
 * POST /api/admin/users/ip-geo/backfill
 * Mac 定时任务：每次只处理 1 个尚未成功缓存的唯一登录 IP（约 30s 调一次）。
 * 鉴权：Bearer JP_REVIEW_UPLOAD_TOKEN（与教案上传共用）。
 */
export async function POST(request: Request) {
  try {
    const env = await getCloudflareEnv();
    if (!verifyUploadAuth(request, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let body: BackfillBody = {};
    try {
      body = (await request.json()) as BackfillBody;
    } catch {
      /* empty */
    }

    const mode = (body.mode || "step").trim().toLowerCase();
    const dryRun = Boolean(body.dry_run);

    if (mode === "status") {
      const status = await getLoginIpGeoBackfillStatus(env.DB);
      return jsonResponse({ ok: true, mode: "status", ...status });
    }

    if (mode === "requeue") {
      if (dryRun) {
        const status = await getLoginIpGeoBackfillStatus(env.DB);
        return jsonResponse({
          ok: true,
          mode: "requeue",
          dry_run: true,
          would_clear: status.done_count + status.failed_recent_count,
          ...status,
        });
      }
      const result = await requeueLoginIpGeoBackfill(env.DB);
      return jsonResponse({
        ok: true,
        mode: "requeue",
        dry_run: false,
        cleared: result.cleared,
        ...result.status,
      });
    }

    if (mode === "step") {
      if (dryRun) {
        const status = await getLoginIpGeoBackfillStatus(env.DB);
        return jsonResponse({
          ok: true,
          mode: "step",
          dry_run: true,
          idle: status.pending_count === 0,
          next_ip: status.pending_ips[0] ?? null,
          ...status,
        });
      }
      const result = await stepLoginIpGeoBackfill(env.DB);
      return jsonResponse({
        ok: true,
        mode: "step",
        dry_run: false,
        idle: result.idle,
        ip: result.ip,
        region_label: result.geo?.ok ? result.geo.region_label : null,
        area: result.geo?.ok ? result.geo.area : null,
        isp: result.geo?.ok ? result.geo.isp : null,
        geo_ok: result.geo?.ok ?? false,
        history_rows_updated: result.history_rows_updated,
        ...result.status,
      });
    }

    return jsonResponse(
      { ok: false, error: "mode must be status | step | requeue" },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
