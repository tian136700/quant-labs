import type { Locale } from "@/i18n/messages";

type TrackPayload = {
  url_path?: string;
  event_type?: "page_view" | "action";
  event_detail?: string;
  locale?: Locale;
};

export function trackEvent(payload: TrackPayload) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    url_path: payload.url_path ?? window.location.pathname,
    event_type: payload.event_type ?? "action",
    event_detail: payload.event_detail ?? "",
    locale: payload.locale,
  });

  // 必须带 Cookie 才能记录登录用户名；sendBeacon 在部分浏览器不携带 Cookie，故优先 fetch
  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body,
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}
