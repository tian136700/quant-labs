"use client";

import { Suspense } from "react";
import { ComparePage } from "@/components/ComparePage";
import { MaintenancePage } from "@/components/MaintenancePage";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";

function CompareLogin({
  locale,
  onAuthenticated,
}: {
  locale: string;
  onAuthenticated: (next: Parameters<ReturnType<typeof useEtrAuth>["setUser"]>[0]) => void;
}) {
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
      onAuthenticated={onAuthenticated}
    />
  );
}

function ComparePageGateInner() {
  const { user, checking, isAdmin, setUser } = useEtrAuth();
  const { locale } = useI18n();

  // 无本地用户时不要卡在「验证中」：force-static 首页会把 Checking 固化进 HTML，
  // iPad / 弱网若 JS 慢或鉴权挂起，就会一直转圈。访客直接出登录页。
  if (checking && !user) {
    return (
      <CompareLogin
        locale={locale}
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

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
    <CompareLogin
      locale={locale}
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
