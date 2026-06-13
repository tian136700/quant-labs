import { NextResponse, type NextRequest } from "next/server";
import { LS_LOCALE } from "@/i18n/messages";
import {
  LOCALE_HEADER,
  localeFromPathname,
  parseLocale,
} from "@/lib/locale-detect";
import {
  isStoreReviewSubdomainHost,
  storeReviewInternalPath,
  storeReviewPublicPath,
} from "@/lib/store-review-host";

function serverLocale(request: NextRequest) {
  return (
    parseLocale(request.cookies.get(LS_LOCALE)?.value) ??
    localeFromPathname(request.nextUrl.pathname)
  );
}

function nextWithLocale(request: NextRequest): NextResponse {
  const locale = serverLocale(request);
  const requestHeaders = new Headers(request.headers);
  if (locale) {
    requestHeaders.set(LOCALE_HEADER, locale);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!isStoreReviewSubdomainHost(host)) {
    return nextWithLocale(request);
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return nextWithLocale(request);
  }

  const publicPath = storeReviewPublicPath(pathname);
  if (publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = publicPath;
    const locale = serverLocale(request);
    const requestHeaders = new Headers(request.headers);
    if (locale) {
      requestHeaders.set(LOCALE_HEADER, locale);
    }
    return NextResponse.redirect(url, 308);
  }

  const internalPath = storeReviewInternalPath(pathname);
  if (internalPath) {
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    const locale = serverLocale(request);
    const requestHeaders = new Headers(request.headers);
    if (locale) {
      requestHeaders.set(LOCALE_HEADER, locale);
    }
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
