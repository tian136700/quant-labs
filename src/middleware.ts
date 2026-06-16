import { NextResponse, type NextRequest } from "next/server";
import {
  LOCALE_HEADER,
  resolveServerLocale,
} from "@/lib/locale-detect";
import {
  isStoreReviewSubdomainHost,
  STORE_REVIEW_HOST,
  STORE_REVIEW_SITE_URL,
  storeReviewInternalPath,
  storeReviewPublicPath,
} from "@/lib/store-review-host";

function nextWithLocale(request: NextRequest): NextResponse {
  const locale = resolveServerLocale(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function handleStoreReviewSubdomain(request: NextRequest): NextResponse {
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

function storeReviewFoodBaseUrl(): string {
  if (STORE_REVIEW_SITE_URL) return STORE_REVIEW_SITE_URL;
  if (STORE_REVIEW_HOST) return `https://${STORE_REVIEW_HOST}`;
  return "";
}

/** finance 域名上的 /store-review 整理到 food 子域名短 URL */
function redirectStoreReviewToFoodSubdomain(
  request: NextRequest
): NextResponse | null {
  const foodBase = storeReviewFoodBaseUrl();
  if (!foodBase) return null;

  const publicPath = storeReviewPublicPath(request.nextUrl.pathname);
  if (!publicPath) return null;

  const url = new URL(foodBase);
  url.pathname = publicPath;
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");

  if (isStoreReviewSubdomainHost(host)) {
    return handleStoreReviewSubdomain(request);
  }

  const foodRedirect = redirectStoreReviewToFoodSubdomain(request);
  if (foodRedirect) return foodRedirect;

  return nextWithLocale(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
