import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { EN_SITE_URL } from "@/lib/en-site-host";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { KO_SITE_URL } from "@/lib/ko-site-host";
import { enVocabPath, jpVocabPath, koPronPath } from "@/lib/locale-path";
import { loginLinkSiteForTeacher } from "@/lib/login-link-slug";
import type { RbacTeacherModules } from "@/lib/rbac";

export const ADMIN_USER_CREDENTIALS_CACHE_KEY = "admin-user-credentials:v1";

/** 复制账号密码 / 带模板复制时附带的抽问入口（按老师身份选日语/英语/韩语入口） */
export function adminUserQuizShareUrl(
  role?: string | null,
  modules?: Partial<RbacTeacherModules> | null
): {
  url: string;
  labelZh: string;
  labelEn: string;
} {
  const site = loginLinkSiteForTeacher(role, modules);
  if (site === "en") {
    return {
      url: `${EN_SITE_URL}${enVocabPath()}`,
      labelZh: "英语抽背",
      labelEn: "EN vocab",
    };
  }
  if (site === "ko") {
    return {
      url: `${KO_SITE_URL}${koPronPath()}`,
      labelZh: "韩语发音",
      labelEn: "KO pronunciation",
    };
  }
  return {
    url: `${JP_SITE_URL}${jpVocabPath()}`,
    labelZh: "日语抽问",
    labelEn: "JP vocab",
  };
}

export function readAdminUserPassword(userId: number): string | null {
  const map =
    readClientCache<Record<string, string>>(ADMIN_USER_CREDENTIALS_CACHE_KEY) ??
    {};
  const password = map[String(userId)];
  return password?.trim() ? password : null;
}

export function rememberAdminUserPassword(
  userId: number,
  password: string
): void {
  const trimmed = password.trim();
  if (!trimmed) return;
  const map =
    readClientCache<Record<string, string>>(ADMIN_USER_CREDENTIALS_CACHE_KEY) ??
    {};
  writeClientCache(ADMIN_USER_CREDENTIALS_CACHE_KEY, {
    ...map,
    [String(userId)]: trimmed,
  });
}

export function forgetAdminUserPassword(userId: number): void {
  const map =
    readClientCache<Record<string, string>>(ADMIN_USER_CREDENTIALS_CACHE_KEY);
  if (!map) return;
  const next = { ...map };
  delete next[String(userId)];
  writeClientCache(ADMIN_USER_CREDENTIALS_CACHE_KEY, next);
}

export function formatAdminUserCredentials(
  username: string,
  password: string,
  locale: "en" | "zh",
  role?: string | null,
  modules?: Partial<RbacTeacherModules> | null
): string {
  const { url, labelZh, labelEn } = adminUserQuizShareUrl(role, modules);
  if (locale === "zh") {
    return `用户名：${username}\n密码：${password}\n${labelZh}：${url}`;
  }
  return `Username: ${username}\nPassword: ${password}\n${labelEn}: ${url}`;
}
