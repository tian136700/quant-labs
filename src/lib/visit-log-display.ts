import type { Locale } from "@/i18n/messages";
import { formatIpForDisplay } from "@/lib/client-ip";

/** 访问日志 IP 展示（规范 IPv6 压缩、等宽） */
export function visitLogIpDisplay(ip: string | null | undefined): string {
  return formatIpForDisplay(ip);
}

/** 访问日志：已登录显示用户名，否则「未注册用户」 */
export function visitLogUsernameDisplay(
  username: string | null | undefined,
  locale: Locale
): string {
  const name = username?.trim();
  if (name) return name;
  return locale === "zh" ? "未注册用户" : "Unregistered";
}
