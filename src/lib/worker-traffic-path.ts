/** Cloudflare Workers 免费档日请求上限（多子域共用） */
export const WORKER_DAILY_REQUEST_LIMIT = 100_000;

export type WorkerTrafficKind = "api" | "page";

const STATIC_SKIP = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * 今日单词等 force-static 壳页：浏览已由 visit_logs 记；
 * 进页时再 waitUntil 写 worker_*_hits 会与 OpenNext 冷启动抢同一 isolate CPU，易整页 Error 1102。
 * （API shared 列表仍计数。）
 */
export const PAGE_HTML_TRAFFIC_SKIP_PATHS = [
  "/jp-vocab/study",
  "/en-vocab/study",
  "/ko-pron/study",
] as const;

const PAGE_HTML_TRAFFIC_SKIP = new Set<string>(PAGE_HTML_TRAFFIC_SKIP_PATHS);

const PREFIX_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/jp-vocab\/ref\/[^/]+$/, "/jp-vocab/ref/[refKey]"],
  [/^\/en-vocab\/ref\/[^/]+$/, "/en-vocab/ref/[refKey]"],
  [/^\/api\/jp-vocab\/ref\/[^/]+$/, "/api/jp-vocab/ref/[refKey]"],
  [/^\/api\/en-vocab\/ref\/[^/]+$/, "/api/en-vocab/ref/[refKey]"],
  [/^\/sign-in\/[^/]+\/[^/]+$/, "/sign-in/[username]/[slug]"],
  [/^\/sign-in\/[^/]+$/, "/sign-in/[slug]"],
  [/^\/zh\/sign-in\/[^/]+\/[^/]+$/, "/zh/sign-in/[username]/[slug]"],
  [/^\/zh\/sign-in\/[^/]+$/, "/zh/sign-in/[slug]"],
];

function normalizeSegment(segment: string): string {
  if (!segment) return segment;
  if (/^\d+$/.test(segment)) return "[id]";
  if (/^[a-f0-9-]{16,}$/i.test(segment)) return "[id]";
  if (segment.length > 32) return "[id]";
  return segment;
}

/** 归一化路径，便于按接口/页面聚合统计 */
export function normalizeWorkerTrafficRoute(pathname: string): string {
  const raw = (pathname || "/").split("?")[0] || "/";
  for (const [pattern, replacement] of PREFIX_REPLACEMENTS) {
    if (pattern.test(raw)) return replacement;
  }

  const parts = raw.split("/").map((segment) => normalizeSegment(segment));
  const joined = parts.join("/") || "/";
  return joined.length > 256 ? joined.slice(0, 256) : joined;
}

export function workerTrafficKind(pathname: string): WorkerTrafficKind {
  return pathname.startsWith("/api/") ? "api" : "page";
}

export function shouldCountWorkerTraffic(pathname: string): boolean {
  if (!pathname) return false;
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (STATIC_SKIP.has(path) || STATIC_SKIP.has(pathname)) return false;
  if (PAGE_HTML_TRAFFIC_SKIP.has(path)) return false;
  if (pathname.startsWith("/_next/") || path.startsWith("/_next/")) return false;
  // 页面浏览已由 visit_logs + ActivityTracker 记录，避免重复噪声
  if (path === "/api/analytics/track") return false;
  return true;
}
