import type { Locale } from "@/i18n/messages";

/** 访问日志：已登录显示用户名，否则「未注册用户」 */
export function visitLogUsernameDisplay(
  username: string | null | undefined,
  locale: Locale
): string {
  const name = username?.trim();
  if (name) return name;
  return locale === "zh" ? "未注册用户" : "Unregistered";
}
