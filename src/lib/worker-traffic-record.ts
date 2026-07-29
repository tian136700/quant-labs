import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getSessionUserFromRequest } from "@/lib/etr-auth-db";
import {
  beijingDateString,
  beijingHour,
} from "@/lib/jp-vocab-daily-check";
import { incrementWorkerDailyHit } from "@/lib/worker-traffic-db";
import {
  normalizeWorkerTrafficRoute,
  shouldCountWorkerTraffic,
  workerTrafficKind,
} from "@/lib/worker-traffic-path";

async function recordWorkerTrafficHitNow(request: Request): Promise<void> {
  const pathname = new URL(request.url).pathname;
  if (!shouldCountWorkerTraffic(pathname)) return;

  const env = await getCloudflareEnv();
  const username =
    (await getSessionUserFromRequest(env, request.headers.get("cookie")))
      ?.username ?? "";
  const now = new Date();

  await incrementWorkerDailyHit(env.DB, {
    statDate: beijingDateString(now),
    hour: beijingHour(now),
    routeKey: normalizeWorkerTrafficRoute(pathname),
    username,
    kind: workerTrafficKind(pathname),
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
