"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";

const LINK_ERR: Record<string, { zh: string; en: string }> = {
  link_invalid: {
    zh: "登录链接无效，请联系管理员重新生成。",
    en: "This login link is invalid. Please ask an admin for a new one.",
  },
  link_used: {
    zh: "该登录链接已失效，请联系管理员。",
    en: "This login link is no longer valid. Please contact an admin.",
  },
  link_expired: {
    zh: "该登录链接已失效，请联系管理员。",
    en: "This login link is no longer valid. Please contact an admin.",
  },
  maintenance: {
    zh: "该账号已停用，暂无法登录。",
    en: "This account has been disabled and cannot sign in.",
  },
};

export function MaintenancePage() {
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const loginLinkError = searchParams.get("login_link");
  const linkMsg = loginLinkError ? LINK_ERR[loginLinkError] : null;

  return (
    <div className="maintenance-page">
      <div className="maintenance-card">
        <h1>
          {linkMsg
            ? locale === "zh"
              ? "无法登录"
              : "Sign-in unavailable"
            : locale === "zh"
              ? "你所访问的功能正在维护中"
              : "This feature is under maintenance"}
        </h1>
        <p>
          {linkMsg
            ? locale === "zh"
              ? linkMsg.zh
              : linkMsg.en
            : locale === "zh"
              ? "请稍后再试。"
              : "Please try again later."}
        </p>
      </div>
      <style jsx>{`
        .maintenance-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
        }
        .maintenance-card {
          max-width: 28rem;
          text-align: center;
          padding: 2rem 1.5rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
        }
        .maintenance-card h1 {
          margin: 0 0 0.75rem;
          font-size: 1.5rem;
        }
        .maintenance-card p {
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
