import {
  buildStoreReviewFaqJsonLd,
  buildStoreReviewWebAppJsonLd,
  type StoreReviewSeoPage,
} from "@/lib/store-review-seo";
import type { SeoLocale } from "@/lib/seo";

export function StoreReviewJsonLd({
  locale,
  page = "home",
}: {
  locale: SeoLocale;
  page?: StoreReviewSeoPage;
}) {
  const graphs = [
    buildStoreReviewWebAppJsonLd(locale, page),
    buildStoreReviewFaqJsonLd(locale, page),
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs) }}
    />
  );
}
