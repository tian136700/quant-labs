"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { useI18n } from "@/i18n/I18nProvider";
import { toolDotToolPath } from "@/lib/locale-path";
import { TOOL_DOT_DEFINITIONS } from "@/tool-dot/tools";

export function ToolDotHomePage() {
  const { locale, t } = useI18n();
  const td = t("toolDot");

  useEffect(() => {
    document.title = td.meta.title;
  }, [locale, td.meta.title]);

  return (
    <div className="page-wrap tool-dot-wrap">
      <header className="page-header tool-dot-header">
        <div className="tool-dot-brand">
          <span className="tool-dot-logo" aria-hidden>
            🛠
          </span>
          <div>
            <h1 className="tool-dot-title">{td.page.title}</h1>
            <p className="tool-dot-subtitle">{td.page.subtitle}</p>
          </div>
        </div>
        <div className="page-header-tools">
          <LangSwitch />
        </div>
      </header>

      <section className="tool-dot-notice" aria-label={td.page.codeHint}>
        <p>{td.page.codeHint}</p>
      </section>

      <section className="tool-dot-grid" aria-label={td.page.toolsHeading}>
        <h2 className="tool-dot-section-title">{td.page.toolsHeading}</h2>
        <ul className="tool-dot-card-list">
          {TOOL_DOT_DEFINITIONS.map((tool) => {
            const info = td.tools[tool.id];
            return (
              <li key={tool.id}>
                <Link href={toolDotToolPath(locale, tool.id)} className="tool-dot-card">
                  <span className="tool-dot-card-icon" aria-hidden>
                    {tool.icon}
                  </span>
                  <span className="tool-dot-card-title">{info.title}</span>
                  <span className="tool-dot-card-desc">{info.desc}</span>
                  <span className="tool-dot-card-cta">{td.page.openTool}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="tool-dot-footer">
        <p>{td.page.footerNote}</p>
      </footer>
    </div>
  );
}
