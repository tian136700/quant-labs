import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { recordD1QuotaErrorIfMatch } from "@/lib/d1-quota-db";
import { isD1QuotaError } from "@/lib/d1-quota";
import { normalizeWorkerTrafficRoute } from "@/lib/worker-traffic-path";

async function recordNow(request: Request, err: unknown): Promise<void> {
  if (!isD1QuotaError(err)) return;
  const env = await getCloudflareEnv();
  const pathname = new URL(request.url).pathname;
  const routeKey = normalizeWorkerTrafficRoute(pathname);
  await recordD1QuotaErrorIfMatch(env.DB, { routeKey, err });
}

/**
 * API catch 块：识别 D1 日读/写行数顶满并聚合计数（waitUntil，不挡响应）。
 */
export function observeD1QuotaError(request: Request, err: unknown): void {
  if (!isD1QuotaError(err)) return;

  const run = () => recordNow(request, err).catch(() => {});

  void (async () => {
    try {
      const { ctx } = await getCloudflareContext({ async: true });
      if (ctx?.waitUntil) {
        ctx.waitUntil(run());
        return;
      }
    } catch {
      /* 本地 next dev */
    }
    run();
  })();
}
