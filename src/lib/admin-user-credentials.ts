import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { jpVocabPath } from "@/lib/locale-path";

export const ADMIN_USER_CREDENTIALS_CACHE_KEY = "admin-user-credentials:v1";

/** 复制账号密码时附带的日语抽问入口（日语子域名） */
function jpVocabShareUrl(): string {
  return `${JP_SITE_URL}${jpVocabPath()}`;
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
  locale: "en" | "zh"
): string {
  const url = jpVocabShareUrl();
  if (locale === "zh") {
    return `用户名：${username}\n密码：${password}\n日语抽问：${url}`;
  }
  return `Username: ${username}\nPassword: ${password}\nJP vocab: ${url}`;
}
