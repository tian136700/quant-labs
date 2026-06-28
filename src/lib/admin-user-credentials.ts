import { readClientCache, writeClientCache } from "@/lib/client-swr-cache";

export const ADMIN_USER_CREDENTIALS_CACHE_KEY = "admin-user-credentials:v1";

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
  if (locale === "zh") {
    return `用户名：${username}\n密码：${password}`;
  }
  return `Username: ${username}\nPassword: ${password}`;
}
