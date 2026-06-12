"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function SeoContent() {
  const { t } = useI18n();
  const seo = t("seo");

  return (
    <footer className="page-footer">
      <section className="seo-section" aria-labelledby="seo-heading">
        <h2 id="seo-heading">{seo.heading}</h2>
        <p className="seo-intro">{seo.intro}</p>
        <dl className="seo-faq">
          {seo.faq.map((item) => (
            <div key={item.q} className="seo-faq-item">
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </footer>
  );
}
