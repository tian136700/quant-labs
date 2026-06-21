import type { MetadataRoute } from "next";
import { storeReviewSiteUrl } from "@/lib/store-review-seo";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/jp-review",
        "/api/jp-review/",
        "/jp-vocab",
        "/api/jp-vocab/",
        "/jp-lesson",
        "/api/jp-lesson/",
      ],
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${storeReviewSiteUrl()}/sitemap.xml`],
  };
}
