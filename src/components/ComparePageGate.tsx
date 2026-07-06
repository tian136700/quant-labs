"use client";

import { Suspense } from "react";
import { ComparePage } from "@/components/ComparePage";
import { MaintenancePage } from "@/components/MaintenancePage";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";

function ComparePageGateInner() {
  const { user, checking, isAdmin, setUser } = useEtrAuth();
  const { locale } = useI18n();

  if (checking) {
    return (
      <div className="maintenance-page">
        <p>{locale === "zh" ? "验证中…" : "Checking…"}</p>
      </div>
    );
  }

  if (isAdmin) return <ComparePage />;

  if (user) {
    return <MaintenancePage />;
  }

  return (
    <TeacherReviewAuth
      variant="page"
      loginOnly
      title={locale === "zh" ? "登录" : "Sign in"}
      subtitle={
        locale === "zh"
          ? "请登录后继续访问。策略对比功能暂时仅对管理员开放。"
          : "Please sign in to continue. Strategy compare is temporarily available to admins only."
      }
      onAuthenticated={(next) => setUser(next)}
    />
  );
}

export function ComparePageGate() {
  if (!COMPARE_ADMIN_ONLY) return <ComparePage />;

  return (
    <Suspense fallback={null}>
      <ComparePageGateInner />
    </Suspense>
  );
}
