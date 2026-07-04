"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LangSwitch } from "@/components/LangSwitch";
import { SiteAuthBar } from "@/components/SiteAuthBar";
import { useSiteNavItems } from "@/hooks/useSiteNavItems";
import { useI18n } from "@/i18n/I18nProvider";

type MobileNavDrawerProps = {
  id: string;
  open: boolean;
  onClose: () => void;
};

export function MobileNavDrawer({ id, open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname() ?? "/";
  const items = useSiteNavItems();
  const { t } = useI18n();
  const nav = t("nav");

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        className={`mobile-nav-backdrop${open ? " is-open" : ""}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        aria-label={nav.ariaLabel}
        onClick={onClose}
      />
      <aside
        id={id}
        className={`mobile-nav-drawer${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label={nav.ariaLabel}
      >
        <div className="mobile-nav-drawer-head">
          <span className="mobile-nav-drawer-title">{nav.ariaLabel}</span>
          <button
            type="button"
            className="mobile-nav-close"
            aria-label="Close menu"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mobile-nav-drawer-tools">
          <SiteAuthBar />
          <LangSwitch />
        </div>

        <nav className="mobile-nav-drawer-nav" aria-label={nav.ariaLabel}>
          <ul className="mobile-nav-drawer-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`mobile-nav-drawer-link${item.active ? " is-active" : ""}`}
                  aria-current={item.active ? "page" : undefined}
                  onClick={onClose}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
