"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function TeacherReviewSeoContent() {
  const { t } = useI18n();
  const seo = t("teacherReview").seo;

  return (
    <footer className="page-footer">
      <section className="seo-section" aria-labelledby="etr-seo-heading">
        <h2 id="etr-seo-heading">{seo.heading}</h2>
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
