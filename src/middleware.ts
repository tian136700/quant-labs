import { NextResponse, type NextRequest } from "next/server";
import {
  isStoreReviewSubdomainHost,
  storeReviewInternalPath,
  storeReviewPublicPath,
} from "@/lib/store-review-host";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!isStoreReviewSubdomainHost(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
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
    return NextResponse.rewrite(url);
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
