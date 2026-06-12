import { buildFaqJsonLd, buildWebAppJsonLd, type SeoLocale } from "@/lib/seo";

export function JsonLd({ locale = "en" }: { locale?: SeoLocale }) {
  const graphs = [buildWebAppJsonLd(locale), buildFaqJsonLd(locale)];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs) }}
    />
  );
}
