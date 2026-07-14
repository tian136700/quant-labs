"use client";

import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  title: string;
  required: string;
  login: string;
  registered: boolean;
};

export function AdminAuthGate({ title, required, login, registered }: Props) {
  const { checking, user, setUser } = useEtrAuth();
  const { locale } = useI18n();

  // Unauthenticated: show login page directly instead of crashing or a dead end.
  if (!checking && !user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title={title}
        subtitle={
          locale === "zh"
            ? "请先登录后再访问此页面。"
            : "Please log in to continue."
        }
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  const switchAccount = async () => {
    try {
      await fetch("/api/english-teacher-review/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      /* ignore */
    }
    // Clearing user re-renders this gate into the full-page login form above.
    setUser(null);
  };

  return (
    <div className="admin-page admin-page--auth">
      <div className="page-hero etr-hero-center">
        <h1>{title}</h1>
        <AdminAuthUserStatus registered={registered} />
        <p className="sub">{required}</p>
        {!checking && user && !registered ? (
          <div className="etr-form-actions etr-form-actions--center">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => void switchAccount()}
            >
              {login}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
