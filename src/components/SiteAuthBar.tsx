"use client";

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

  if (maintenance) return null;

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

      {authPanel && !user ? (
        <div className="site-auth-overlay">
          <div
            className="site-auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={authPanel.mode === "register" ? auth.registerTab : auth.loginTab}
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
      ) : null}
    </>
  );
}
