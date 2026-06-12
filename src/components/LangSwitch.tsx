"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/messages";
import { localeHref } from "@/lib/locale-path";

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  const lang = t("lang");

  const pick = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    window.history.replaceState(null, "", localeHref(next));
  };

  return (
    <div className="lang-switch" role="group" aria-label={lang.switchTo}>
      <button
        type="button"
        className={`lang-switch-btn${locale === "en" ? " is-active" : ""}`}
        aria-pressed={locale === "en"}
        onClick={() => pick("en")}
      >
        {lang.en}
      </button>
      <span className="lang-switch-sep" aria-hidden>
        |
      </span>
      <button
        type="button"
        className={`lang-switch-btn${locale === "zh" ? " is-active" : ""}`}
        aria-pressed={locale === "zh"}
        onClick={() => pick("zh")}
      >
        {lang.zh}
      </button>
    </div>
  );
}
