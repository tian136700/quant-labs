import {
  formatAdminUserCredentials,
  adminUserQuizShareUrl,
} from "@/lib/admin-user-credentials";
import type { RbacTeacherModules } from "@/lib/rbac";

export type AdminCopyTemplateVars = {
  username?: string | null;
  password?: string | null;
  quizUrl?: string | null;
  loginUrl?: string | null;
};

/** 替换模板占位符：`{username}` / `{password}` / `{quiz_url}` / `{login_url}` */
export function applyAdminCopyTemplateVars(
  body: string,
  vars: AdminCopyTemplateVars
): string {
  let text = body;
  const username = (vars.username ?? "").trim();
  const password = (vars.password ?? "").trim();
  const quizUrl = (vars.quizUrl ?? "").trim();
  const loginUrl = (vars.loginUrl ?? "").trim();

  if (username && text.includes("{username}")) {
    text = text.replace(/\{username\}/g, username);
  }
  if (password && text.includes("{password}")) {
    text = text.replace(/\{password\}/g, password);
  }
  if (quizUrl && text.includes("{quiz_url}")) {
    text = text.replace(/\{quiz_url\}/g, quizUrl);
  }
  if (loginUrl && text.includes("{login_url}")) {
    text = text.replace(/\{login_url\}/g, loginUrl);
  }
  return text;
}

/**
 * 将模板正文与登录链接合并；可含 `{login_url}` / `{username}`，无占位则链接追加在末尾。
 * （「复制链接」路径仍用此函数。）
 */
export function renderLoginLinkTemplate(
  body: string,
  loginUrl: string,
  username?: string | null
): string {
  const trimmed = body.trim();
  if (!trimmed) return loginUrl;
  const text = applyAdminCopyTemplateVars(trimmed, { loginUrl, username });
  if (trimmed.includes("{login_url}")) {
    return text;
  }
  return `${text}\n\n${loginUrl}`;
}

/**
 * 「带模板复制」：模板正文 + 用户名 / 密码 / 抽查入口。
 * 正文可写 `{username}` / `{password}` / `{quiz_url}`；若未写密码与抽查链接占位，则在末尾追加标准凭证块。
 */
export function renderAdminTemplateCredentialsCopy(options: {
  body: string;
  username: string;
  password: string;
  locale: "zh" | "en";
  role?: string | null;
  teacherModules?: Partial<RbacTeacherModules> | null;
}): string {
  const { body, username, password, locale, role, teacherModules } = options;
  const quiz = adminUserQuizShareUrl(role, teacherModules);
  const trimmed = body.trim();
  const credentials = formatAdminUserCredentials(
    username,
    password,
    locale,
    role,
    teacherModules
  );
  if (!trimmed) return credentials;

  const rendered = applyAdminCopyTemplateVars(trimmed, {
    username,
    password,
    quizUrl: quiz.url,
  }).trim();

  const inlinedPassword = trimmed.includes("{password}");
  const inlinedQuiz = trimmed.includes("{quiz_url}");
  if (inlinedPassword && inlinedQuiz) {
    return rendered;
  }
  return `${rendered}\n\n${credentials}`;
}
