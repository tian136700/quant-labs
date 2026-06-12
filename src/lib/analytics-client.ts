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

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/track", blob)) return;
    }
  } catch {
    /* fall through */
  }

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}
