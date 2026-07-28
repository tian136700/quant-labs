import type { NextRequest } from "next/server";
import { shouldCountWorkerTraffic } from "@/lib/worker-traffic-path";

/** middleware 入口：动态加载记录逻辑，避免 Edge 打包 server-only */
export function maybeRecordWorkerTraffic(request: NextRequest): void {
  const pathname = request.nextUrl.pathname;
  if (!shouldCountWorkerTraffic(pathname)) return;
  void import("@/lib/worker-traffic-record").then(({ recordWorkerTrafficHit }) =>
    recordWorkerTrafficHit(request)
  );
}
