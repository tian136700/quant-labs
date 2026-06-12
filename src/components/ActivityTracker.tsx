"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { trackEvent } from "@/lib/analytics-client";

export function ActivityTracker() {
  const pathname = usePathname() ?? "/";
  const { locale, ready } = useI18n();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    trackEvent({
      url_path: pathname,
      event_type: "page_view",
      event_detail: "page_load",
      locale,
    });
  }, [pathname, locale, ready]);

  return null;
}
