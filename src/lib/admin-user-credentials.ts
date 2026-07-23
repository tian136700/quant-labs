import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { EN_SITE_URL } from "@/lib/en-site-host";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { KO_SITE_URL } from "@/lib/ko-site-host";
import { enVocabPath, jpVocabPath, koPronPath } from "@/lib/locale-path";

export const ADMIN_USER_CREDENTIALS_CACHE_KEY = "admin-user-credentials:v1";

/** 复制账号密码时附带的抽问入口（按角色选日语/英语/韩语入口） */
function vocabShareUrl(role?: string | null): {
  url: string;
  labelZh: string;
  labelEn: string;
} {
  if (role === "en_vocab") {
    return {
      url: `${EN_SITE_URL}${enVocabPath()}`,
      labelZh: "英语抽背",
      labelEn: "EN vocab",
    };
  }
  if (role === "ko_pron") {
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
  role?: string | null
): string {
  const { url, labelZh, labelEn } = vocabShareUrl(role);
  if (locale === "zh") {
    return `用户名：${username}\n密码：${password}\n${labelZh}：${url}`;
  }
  return `Username: ${username}\nPassword: ${password}\n${labelEn}: ${url}`;
}
