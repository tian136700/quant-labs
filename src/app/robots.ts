import type { MetadataRoute } from "next";
import { storeReviewSiteUrl } from "@/lib/store-review-seo";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${storeReviewSiteUrl()}/sitemap.xml`],
  };
}
