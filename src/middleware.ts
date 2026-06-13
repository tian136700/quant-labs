import { NextResponse, type NextRequest } from "next/server";
import {
  LOCALE_HEADER,
  resolveServerLocale,
} from "@/lib/locale-detect";
import {
  isStoreReviewSubdomainHost,
  storeReviewInternalPath,
  storeReviewPublicPath,
} from "@/lib/store-review-host";

function nextWithLocale(request: NextRequest): NextResponse {
  const locale = resolveServerLocale(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
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
    return NextResponse.redirect(url, 308);
  }

  const internalPath = storeReviewInternalPath(pathname);
  if (internalPath) {
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    const locale = resolveServerLocale(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
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
