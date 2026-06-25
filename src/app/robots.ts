import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { storeReviewSiteUrl } from "@/lib/store-review-seo";
import { isStoreReviewSubdomainHost } from "@/lib/store-review-host";
import { isTrendBlogSubdomainHost } from "@/lib/trend-blog-host";
import { trendBlogSiteUrl } from "@/lib/trend-blog-seo";
import { SITE_URL } from "@/lib/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  const rules = {
    userAgent: "*",
    allow: "/",
    disallow: [
      "/jp-review",
      "/api/jp-review/",
      "/jp-vocab",
      "/api/jp-vocab/",
      "/jp-lesson",
      "/api/jp-lesson/",
      "/tool-dot/admin",
      "/zh/tool-dot/admin",
    ],
  };

  if (isTrendBlogSubdomainHost(host)) {
    const blogBase = trendBlogSiteUrl();
    return {
      rules: { userAgent: "*", allow: "/" },
      sitemap: blogBase ? [`${blogBase}/sitemap.xml`] : [],
    };
  }

  if (isStoreReviewSubdomainHost(host)) {
    const foodBase = storeReviewSiteUrl();
    return {
      rules: { userAgent: "*", allow: "/" },
      sitemap: foodBase ? [`${foodBase}/sitemap.xml`] : [],
    };
  }

  const sitemaps = [`${SITE_URL}/sitemap.xml`, `${storeReviewSiteUrl()}/sitemap.xml`];
  const blogBase = trendBlogSiteUrl();
  if (blogBase) sitemaps.push(`${blogBase}/sitemap.xml`);

  return { rules, sitemap: sitemaps };
}
