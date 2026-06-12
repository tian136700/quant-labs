import {
  buildTeacherReviewFaqJsonLd,
  buildTeacherReviewWebAppJsonLd,
} from "@/lib/etr-seo";
import type { SeoLocale } from "@/lib/seo";

export function TeacherReviewJsonLd({ locale }: { locale: SeoLocale }) {
  const graphs = [
    buildTeacherReviewWebAppJsonLd(locale),
    buildTeacherReviewFaqJsonLd(locale),
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs) }}
    />
  );
}
