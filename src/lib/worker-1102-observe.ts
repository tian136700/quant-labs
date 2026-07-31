import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCloudflareEnv, jsonResponse } from "@/lib/cloudflare-env";
import {
  incrementWorkerHeavySignal,
  type WorkerHeavySignalKind,
} from "@/lib/worker-1102-db";
import { normalizeWorkerTrafficRoute } from "@/lib/worker-traffic-path";
import { workerQuotaDateString } from "@/lib/worker-traffic-rate";

/** 慢请求：≥2s（免费 Worker 单请求 CPU 很紧，2s 墙钟已值得盯） */
export const WORKER_1102_SLOW_MS = 2_000;
/** 大响应：≥80KB JSON/正文 */
export const WORKER_1102_LARGE_BYTES = 80_000;

function classifySignals(opts: {
  status: number;
  durationMs: number;
  bodyBytes: number;
}): WorkerHeavySignalKind[] {
  const out: WorkerHeavySignalKind[] = [];
  if (opts.status >= 500) out.push("http5xx");
  if (opts.durationMs >= WORKER_1102_SLOW_MS) out.push("slow");
  if (opts.bodyBytes >= WORKER_1102_LARGE_BYTES) out.push("large");
  return out;
}

async function recordNow(
  request: Request,
  opts: { status: number; startedAtMs: number; bodyBytes?: number }
): Promise<void> {
  const durationMs = Math.max(0, Date.now() - opts.startedAtMs);
  const bodyBytes = Math.max(0, Math.floor(opts.bodyBytes ?? 0));
  const signals = classifySignals({
    status: opts.status,
    durationMs,
    bodyBytes,
  });
  if (!signals.length) return;

  const env = await getCloudflareEnv();
  const pathname = new URL(request.url).pathname;
  const routeKey = normalizeWorkerTrafficRoute(pathname);
  const statDate = workerQuotaDateString();

  for (const signal of signals) {
    await incrementWorkerHeavySignal(env.DB, {
      statDate,
      routeKey,
      signal,
      durationMs,
      bodyBytes,
    });
  }
}

/**
 * 热路径 API 收尾：仅当慢 / 大 / 5xx 时聚合计数（waitUntil，不挡响应）。
 * 真正的 CF Error 1102 杀进程时记不到；本信号用于事后对照「哪些接口在顶」。
 */
export function observeWorker1102ApiResponse(
  request: Request,
  opts: { status: number; startedAtMs: number; bodyBytes?: number }
): void {
  const run = () => recordNow(request, opts).catch(() => {});

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

/** 估算 JSON 响应字节（UTF-8）；过大时用于 large 信号 */
export function estimateJsonBodyBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return 0;
  }
}

/** 构造 JSON 响应并顺便观察 1102 重信号 */
export function jsonResponseObserving1102(
  request: Request,
  startedAtMs: number,
  body: unknown,
  status = 200,
  headers?: HeadersInit
): Response {
  observeWorker1102ApiResponse(request, {
    status,
    startedAtMs,
    bodyBytes: estimateJsonBodyBytes(body),
  });
  return jsonResponse(body as Record<string, unknown>, status, headers);
}
