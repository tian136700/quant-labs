"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { TeacherReviewAuth } from "./TeacherReviewAuth";

export function SiteAuthBar() {
  const {
    user,
    checking,
    logout,
    setUser,
    maintenance,
    authPanel,
    openAuthPanel,
    closeAuthPanel,
  } = useEtrAuth();
  const { locale, t } = useI18n();
  const auth = t("teacherReview").auth;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (maintenance) return null;

  const authOverlay =
    authPanel && !user ? (
      <div className="site-auth-overlay" onClick={closeAuthPanel}>
        <div
          className="site-auth-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={authPanel.mode === "register" ? auth.registerTab : auth.loginTab}
          onClick={(e) => e.stopPropagation()}
        >
          <TeacherReviewAuth
            variant="inline"
            initialMode={authPanel.mode}
            loginOnly={authPanel.loginOnly}
            title={authPanel.title}
            subtitle={authPanel.subtitle}
            onClose={closeAuthPanel}
            onAuthenticated={(next) => {
              setUser(next);
              closeAuthPanel();
            }}
          />
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="site-auth-bar" aria-label={locale === "zh" ? "账号" : "Account"}>
        {checking ? (
          <span className="site-auth-checking">{locale === "zh" ? "验证中…" : "Checking…"}</span>
        ) : user ? (
          <>
            <span className="site-auth-user">{user.username}</span>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void logout()}
            >
              {auth.logout}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
            onClick={() => openAuthPanel({ mode: "login" })}
          >
            {auth.loginTab}
          </button>
        )}
      </div>

      {mounted && authOverlay ? createPortal(authOverlay, document.body) : null}
    </>
  );
}
