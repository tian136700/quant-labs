"use client";

import type { ReactNode } from "react";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import type { EtrAuthUser } from "@/contexts/EtrAuthProvider";
import { jpVocabStudyPath } from "@/lib/locale-path";

const PAGE_WRAP_STYLE = {
  maxWidth: "min(1480px, 96vw)",
  paddingTop: "1.5rem",
} as const;

export type JpVocabPageGatesProps = {
  checking: boolean;
  user: EtrAuthUser | null;
  setUser: (user: EtrAuthUser | null) => void;
  isAdminMode: boolean;
  isTeacherMode: boolean;
  canAccessJpVocabAdminPage: boolean;
  canAccessJpVocabTeacherPage: boolean;
  canAccessJpVocabStudy: boolean;
};

/** Early returns: checking / login / no permission. null = continue to page. */
export function JpVocabPageGates({
  checking,
  user,
  setUser,
  isAdminMode,
  isTeacherMode,
  canAccessJpVocabAdminPage,
  canAccessJpVocabTeacherPage,
  canAccessJpVocabStudy,
}: JpVocabPageGatesProps): ReactNode {
  if (checking) {
    return (
      <main className="page-wrap jp-vocab-page" style={PAGE_WRAP_STYLE}>
        <p style={{ color: "var(--muted)" }}>验证中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <TeacherReviewAuth
        variant="page"
        loginOnly
        title="登录 · 日语单词"
        subtitle="请登录后继续访问日语抽问。"
        onAuthenticated={(next) => setUser(next)}
      />
    );
  }

  const pageAccessDenied =
    (isAdminMode && !canAccessJpVocabAdminPage) ||
    (isTeacherMode && !canAccessJpVocabTeacherPage);

  if (pageAccessDenied) {
    return (
      <main className="page-wrap jp-vocab-page" style={PAGE_WRAP_STYLE}>
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.35rem" }}>
          {isAdminMode ? "日语抽问-管理员端" : "日语抽问-老师端"}
        </h1>
        <p role="alert" style={{ color: "var(--rise)", marginBottom: "0.75rem" }}>
          当前账号无权访问此页面，请联系管理员在「角色权限管理」中开通对应权限。
        </p>
        {canAccessJpVocabStudy ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            你可前往{" "}
            <a href={jpVocabStudyPath()} style={{ color: "var(--accent)" }}>
              今日日语单词
            </a>
            。
          </p>
        ) : null}
      </main>
    );
  }

  return null;
}
