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
  const { user, isAdmin, setUser } = useEtrAuth();
  const { locale } = useI18n();

  // 禁止渲染鉴权等待文案：force-static 会把首屏写进 HTML。
  // iPad / 弱网若 JS 未及时 hydration，用户会一直看到转圈，像「进不去」。
  // 有缓存用户时也按角色直接落地，鉴权探测在后台刷新即可。
  if (isAdmin) return <ComparePage />;
  if (user) return <MaintenancePage />;

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
