"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatMsg,
  LS_LOCALE,
  messages,
  type Locale,
  type Messages,
} from "./messages";
import { localeHref } from "@/lib/locale-path";

type I18nContextValue = {
  locale: Locale;
  ready: boolean;
  setLocale: (locale: Locale) => void;
  t: <K extends keyof Messages>(section: K) => Messages[K];
  tf: (template: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readRouteLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path === "/zh" || path.startsWith("/zh/")) return "zh";
  return null;
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LS_LOCALE);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function persistLocale(next: Locale) {
  try {
    localStorage.setItem(LS_LOCALE, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
}

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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const ipLocale = await fetchIpLocale();
      if (cancelled) return;

      const next =
        readStoredLocale() ?? readRouteLocale() ?? ipLocale ?? "en";
      setLocaleState(next);
      persistLocale(next);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
    saveIpLocale(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

    const target = localeHref(locale);
    const current = window.location.pathname + window.location.search;
    if (target !== current) {
      window.history.replaceState(null, "", target);
    }
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
