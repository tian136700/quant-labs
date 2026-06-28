"use client";

import { AdminAuthUserStatus } from "@/components/AdminAuthUserStatus";
import { teacherReviewNavPath } from "@/lib/locale-path";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  title: string;
  required: string;
  login: string;
  registered: boolean;
};

export function AdminAuthGate({ title, required, login, registered }: Props) {
  const { locale } = useI18n();

  return (
    <div className="admin-page admin-page--auth">
      <div className="page-hero etr-hero-center">
        <h1>{title}</h1>
        <AdminAuthUserStatus registered={registered} />
        <p className="sub">{required}</p>
        <div className="etr-form-actions etr-form-actions--center">
          <a
            className="btn-rsi-filter btn-rsi-filter--primary"
            href={teacherReviewNavPath(locale)}
          >
            {login}
          </a>
        </div>
      </div>
    </div>
  );
}
