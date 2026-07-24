import type { Locale } from "./types";
import { enMessages } from "./en";
import { zhMessages } from "./zh";

export type { Locale, Messages } from "./types";
export { LS_LOCALE } from "./types";
export { enMessages, zhMessages };

export const messages: Record<Locale, import("./types").Messages> = {
  en: enMessages,
  zh: zhMessages,
};

export function formatMsg(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`
  );
}

export function strategyLabel(
  locale: Locale,
  key: string,
  fallbackName: string
): string {
  if (key === "dca") return messages[locale].strategies.dca;
  const m = key.match(/^rsi_lt_(\d+)$/);
  if (m) {
    return formatMsg(messages[locale].strategies.rsiLt, { thr: m[1] });
  }
  return fallbackName;
}
