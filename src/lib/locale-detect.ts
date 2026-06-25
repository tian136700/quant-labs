import type { NextRequest } from "next/server";
import { LS_LOCALE, type Locale } from "@/i18n/messages";
import { clientCountryCode, localeFromCountry } from "@/lib/geoip";

export const LOCALE_HEADER = "x-locale";

export function localeFromPathname(pathname: string): Locale | null {
  if (pathname === "/zh" || pathname.startsWith("/zh/")) return "zh";
  return null;
}

export function parseLocale(value: string | null | undefined): Locale | null {
  if (value === "zh" || value === "en") return value;
  return null;
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    return parseLocale(localStorage.getItem(LS_LOCALE));
  } catch {
    return null;
  }
}

export function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  try {
    for (const part of document.cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === LS_LOCALE) {
        return parseLocale(decodeURIComponent(rest.join("=")));
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readRouteLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  return localeFromPathname(window.location.pathname);
}

/** SSR / 首次 hydration：仅使用服务端已解析的语言，避免读 localStorage 导致不一致 */
export function resolveHydrationLocale(serverLocale?: Locale | null): Locale {
  return serverLocale ?? "en";
}

/** 优先级：Cookie > localStorage > 当前路径 > 服务端预判 > 默认英文 */
export function resolveClientLocale(serverLocale?: Locale | null): Locale {
  return (
    readCookieLocale() ??
    readStoredLocale() ??
    readRouteLocale() ??
    serverLocale ??
    "en"
  );
}

/** Cookie > URL 路径 > Cloudflare 国家码 > 英文 */
export function resolveServerLocale(request: NextRequest): Locale {
  return (
    parseLocale(request.cookies.get(LS_LOCALE)?.value) ??
    localeFromPathname(request.nextUrl.pathname) ??
    localeFromCountry(clientCountryCode(request))
  );
}

export function needsGeoLocale(serverLocale?: Locale | null): boolean {
  return serverLocale == null;
}

function sharedCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  const parts = host.split(".");
  if (parts.length >= 3) {
    return `.${parts.slice(-2).join(".")}`;
  }
  return undefined;
}

export function persistLocale(next: Locale) {
  try {
    localStorage.setItem(LS_LOCALE, next);
  } catch {
    /* ignore */
  }

  const domain = sharedCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : "";
  document.cookie = `${LS_LOCALE}=${next}; path=/${domainAttr}; max-age=31536000; SameSite=Lax`;

  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
}

export function localeDocumentLang(locale: Locale): "zh-CN" | "en" {
  return locale === "zh" ? "zh-CN" : "en";
}

function serverLocaleCookieDomainPart(): string {
  const explicit = process.env.ETR_COOKIE_DOMAIN?.trim();
  if (explicit) {
    const domain = explicit.startsWith(".") ? explicit : `.${explicit}`;
    return `; Domain=${domain}`;
  }
  return "";
}

/** 服务端 Set-Cookie：与 persistLocale 使用同一 key，供登录链接等场景预设语言 */
export function localeCookieHeader(locale: Locale): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${LS_LOCALE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${serverLocaleCookieDomainPart()}${secure}`;
}
