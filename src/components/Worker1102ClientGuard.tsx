"use client";

/**
 * 浏览器侧 1102 现场采集：
 * - 拦截 fetch：软导航 / API 若返回 Cloudflare Error 1102 HTML，上报路径与参数
 * - 今日单词等页成功挂载时上报 page_ok
 * 整页硬导航被 CF 直接顶掉时本页 JS 跑不到；其它已打开标签页的 fetch/软导航仍可抓住。
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  parseCf1102FromText,
  type Worker1102ClientEventKind,
} from "@/lib/worker-1102-client-shared";

const REPORT_URL = "/api/analytics/worker-1102/client-report";
const THROTTLE_MS = 8_000;

let fetchPatched = false;
const lastSent = new Map<string, number>();

function shouldThrottle(key: string): boolean {
  const now = Date.now();
  const prev = lastSent.get(key) ?? 0;
  if (now - prev < THROTTLE_MS) return true;
  lastSent.set(key, now);
  return false;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  try {
    return input.url;
  } catch {
    return "";
  }
}

function postReport(payload: {
  event_kind: Worker1102ClientEventKind;
  page_path: string;
  page_href?: string;
  failed_url?: string;
  http_status?: number;
  duration_ms?: number;
  cf_ray?: string;
  detail?: Record<string, unknown>;
}): void {
  const key = `${payload.event_kind}|${payload.failed_url || payload.page_path}`;
  if (shouldThrottle(key)) return;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(REPORT_URL, blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(REPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => {});
}

function patchFetchOnce(): void {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now();
    const url = requestUrl(input);
    try {
      const res = await orig(input, init);
      const status = res.status;
      const interesting =
        status >= 500 ||
        status === 429 ||
        /\/(api\/)?(jp-vocab|en-vocab|ko-pron)/.test(url);

      if (interesting) {
        const ct = res.headers.get("content-type") || "";
        const peekHtml =
          status >= 500 || /text\/html/i.test(ct) || /text\/plain/i.test(ct);
        if (peekHtml) {
          try {
            const text = await res.clone().text();
            const parsed = parseCf1102FromText(text);
            const pagePath = window.location.pathname;
            if (parsed.is1102) {
              postReport({
                event_kind: "cf_1102_html",
                page_path: pagePath,
                page_href: window.location.href,
                failed_url: url,
                http_status: status,
                duration_ms: Date.now() - started,
                cf_ray:
                  parsed.cfRay ||
                  res.headers.get("cf-ray") ||
                  res.headers.get("CF-Ray") ||
                  "",
                detail: {
                  content_type: ct,
                  body_snip: parsed.snip,
                  online: navigator.onLine,
                  visibility: document.visibilityState,
                  lang: document.documentElement.lang,
                  viewport: `${window.innerWidth}x${window.innerHeight}`,
                },
              });
            } else if (status >= 500) {
              postReport({
                event_kind: "api_5xx",
                page_path: pagePath,
                page_href: window.location.href,
                failed_url: url,
                http_status: status,
                duration_ms: Date.now() - started,
                cf_ray: res.headers.get("cf-ray") || "",
                detail: {
                  content_type: ct,
                  body_snip: text.replace(/\s+/g, " ").trim().slice(0, 200),
                  online: navigator.onLine,
                },
              });
            }
          } catch {
            /* ignore inspect errors */
          }
        } else if (status >= 500) {
          postReport({
            event_kind: "api_5xx",
            page_path: window.location.pathname,
            page_href: window.location.href,
            failed_url: url,
            http_status: status,
            duration_ms: Date.now() - started,
            cf_ray: res.headers.get("cf-ray") || "",
            detail: { content_type: ct },
          });
        }
      }
      return res;
    } catch (err) {
      const pagePath =
        typeof window !== "undefined" ? window.location.pathname : "/";
      postReport({
        event_kind: "fetch_network",
        page_path: pagePath,
        page_href: typeof window !== "undefined" ? window.location.href : "",
        failed_url: url,
        duration_ms: Date.now() - started,
        detail: {
          message: err instanceof Error ? err.message : String(err),
          online: typeof navigator !== "undefined" ? navigator.onLine : null,
        },
      });
      throw err;
    }
  };
}

function isStudyPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return (
    p === "/jp-vocab/study" ||
    p === "/en-vocab/study" ||
    p === "/ko-pron/study" ||
    p === "/zh/jp-vocab/study" ||
    p === "/zh/en-vocab/study"
  );
}

export function Worker1102ClientGuard() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    patchFetchOnce();
  }, []);

  useEffect(() => {
    if (!isStudyPath(pathname)) return;
    const started =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const t = window.setTimeout(() => {
      const nav = performance.getEntriesByType?.(
        "navigation"
      )?.[0] as PerformanceNavigationTiming | undefined;
      postReport({
        event_kind: "page_ok",
        page_path: pathname,
        page_href: window.location.href,
        duration_ms: Math.round(
          nav?.duration ||
            (typeof performance !== "undefined"
              ? performance.now() - started
              : 0)
        ),
        detail: {
          transfer_size: nav?.transferSize ?? null,
          dom_content_loaded: nav?.domContentLoadedEventEnd ?? null,
          online: navigator.onLine,
          visibility: document.visibilityState,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          referrer: document.referrer.slice(0, 200),
        },
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}

/** 今日单词 shared 拉取最终失败时由页面显式调用 */
export function reportWorker1102SharedFail(opts: {
  failedUrl: string;
  status?: number;
  durationMs?: number;
  error?: string;
}): void {
  if (typeof window === "undefined") return;
  postReport({
    event_kind: "shared_fail",
    page_path: window.location.pathname,
    page_href: window.location.href,
    failed_url: opts.failedUrl,
    http_status: opts.status,
    duration_ms: opts.durationMs,
    detail: { error: opts.error ?? null },
  });
}
