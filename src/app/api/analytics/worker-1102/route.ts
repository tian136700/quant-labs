import {
  getWorker1102DiagnosticSummary,
  purgeWorkerHeavySignalsOlderThan,
} from "@/lib/worker-1102-db";
import { purgeWorker1102ClientEventsOlderThan } from "@/lib/worker-1102-client-events";
import { requirePermission } from "@/lib/admin-auth";
import { jsonResponse, localeFromRequest } from "@/lib/cloudflare-env";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

const ERROR_MSG: Record<"en" | "zh", string> = {
  en: "Admin login required.",
  zh: "需要管理员登录。",
};

function parseStatDate(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return workerQuotaDateString();
}

export async function GET(request: Request) {
  const locale = localeFromRequest(request);

  try {
    const { env, allowed } = await requirePermission(request, "admin:dashboard");
    if (!allowed) {
      return jsonResponse(
        { ok: false, error: ERROR_MSG[locale], auth_required: true },
        401
      );
    }

    const url = new URL(request.url);
    const quotaStatDate = parseStatDate(url.searchParams.get("date"));

    // 先出诊断再清旧数据：purge 与重查询并行时易顶满 CPU → 看板自己 1102
    const summary = await getWorker1102DiagnosticSummary(env.DB, {
      quotaStatDate,
    });

    void Promise.all([
      purgeWorkerHeavySignalsOlderThan(env.DB),
      purgeWorker1102ClientEventsOlderThan(env.DB),
    ]).catch(() => {});

    return jsonResponse({ ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
