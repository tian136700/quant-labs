import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import { clientIp } from "@/lib/locale-pref";
import { beijingHour } from "@/lib/jp-vocab-daily-check";
import { incrementWorkerDailyHit } from "@/lib/worker-traffic-db";
import {
  normalizeWorkerTrafficRoute,
  shouldCountWorkerTraffic,
  workerTrafficKind,
} from "@/lib/worker-traffic-path";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

async function recordWorkerTrafficHitNow(request: Request): Promise<void> {
  const pathname = new URL(request.url).pathname;
  if (!shouldCountWorkerTraffic(pathname)) return;

  const env = await getCloudflareEnv();
  const username =
    (await getSessionUserFromRequest(env, request.headers.get("cookie")))
      ?.username ?? "";
  const now = new Date();

  await incrementWorkerDailyHit(env.DB, {
    // CF 日配额 = 北京 08:00→次日 08:00；勿用日历日 0 点
    statDate: workerQuotaDateString(now),
    hour: beijingHour(now),
    routeKey: normalizeWorkerTrafficRoute(pathname),
    username,
    kind: workerTrafficKind(pathname),
    ip: clientIp(request),
  });
}

/** 中间件 / API 入口：异步计数，不阻塞响应 */
export function recordWorkerTrafficHit(request: Request): void {
  const pathname = new URL(request.url).pathname;
  if (!shouldCountWorkerTraffic(pathname)) return;

  const run = () => recordWorkerTrafficHitNow(request).catch(() => {});

  void (async () => {
    try {
      const { ctx } = await getCloudflareContext({ async: true });
      if (ctx?.waitUntil) {
        ctx.waitUntil(run());
        return;
      }
    } catch {
      /* 本地 next dev 无 Cloudflare 上下文 */
    }
    run();
  })();
}
