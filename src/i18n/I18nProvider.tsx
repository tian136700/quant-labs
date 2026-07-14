"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  formatMsg,
  messages,
  type Locale,
  type Messages,
} from "./messages";
import {
  localeFromPathname,
  needsGeoLocale,
  persistLocale,
  resolveClientLocale,
  resolveHydrationLocale,
} from "@/lib/locale-detect";
import { clientZhForcedHost } from "@/lib/zh-forced-host";

type I18nContextValue = {
  locale: Locale;
  ready: boolean;
  setLocale: (locale: Locale) => void;
  t: <K extends keyof Messages>(section: K) => Messages[K];
  tf: (template: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

async function fetchIpLocale(): Promise<Locale | null> {
  try {
    const res = await fetch("/api/locale");
    const data = (await res.json()) as { locale?: string | null };
    if (data.locale === "zh" || data.locale === "en") return data.locale;
  } catch {
    /* ignore */
  }
  return null;
}

function saveIpLocale(next: Locale) {
  void fetch("/api/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: next }),
  }).catch(() => {
    /* ignore */
  });
}

export function I18nProvider({
  children,
  serverLocale = null,
}: {
  children: ReactNode;
  serverLocale?: Locale | null;
}) {
  const pathname = usePathname() ?? "/";
  const initialServerLocale = useRef(serverLocale).current;
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (clientZhForcedHost()) return "zh";
    const routeLocale = localeFromPathname(pathname);
    if (routeLocale) return routeLocale;
    return resolveHydrationLocale(initialServerLocale);
  });
  const [ready, setReady] = useState(() => {
    if (clientZhForcedHost() || localeFromPathname(pathname)) return true;
    return !needsGeoLocale(initialServerLocale);
  });

  useEffect(() => {
    if (clientZhForcedHost()) {
      setLocaleState("zh");
      persistLocale("zh");
      setReady(true);
      return;
    }

    const routeLocale = localeFromPathname(pathname);
    const resolved = routeLocale ?? resolveClientLocale(initialServerLocale);
    setLocaleState(resolved);
    persistLocale(resolved);

    if (routeLocale || !needsGeoLocale(initialServerLocale)) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const ipLocale = await fetchIpLocale();
      if (cancelled) return;
      const next = ipLocale ?? "en";
      setLocaleState(next);
      persistLocale(next);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialServerLocale, pathname]);

  useEffect(() => {
    if (clientZhForcedHost()) return;
    const routeLocale = localeFromPathname(pathname);
    if (!routeLocale) return;
    setLocaleState((prev) => {
      if (prev === routeLocale) return prev;
      persistLocale(routeLocale);
      return routeLocale;
    });
  }, [pathname]);

  const setLocale = useCallback((next: Locale) => {
    const locale = clientZhForcedHost() ? "zh" : next;
    setLocaleState(locale);
    persistLocale(locale);
    saveIpLocale(locale);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale, ready]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      ready,
      setLocale,
      t: (section) => messages[locale][section],
      tf: formatMsg,
    }),
    [locale, ready, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
