/**
 * 全站页面字号（改 html 根字号，rem 布局整体缩放）。
 * 偏好存 localStorage；勿进 APP_DEPLOY_CLIENT_CACHE_PREFIXES（部署「刷新」应保留字号）。
 */

export const PAGE_FONT_SCALE_STORAGE_KEY = "iq-page-font-scale";

export const PAGE_FONT_SCALE_IDS = ["sm", "md", "lg", "xl"] as const;

export type PageFontScaleId = (typeof PAGE_FONT_SCALE_IDS)[number];

export const PAGE_FONT_SCALE_DEFAULT: PageFontScaleId = "md";

/** 相对浏览器默认 16px 的百分比 */
export const PAGE_FONT_SCALE_PERCENT: Record<PageFontScaleId, string> = {
  sm: "87.5%",
  md: "100%",
  lg: "112.5%",
  xl: "125%",
};

export const PAGE_FONT_SCALE_LABEL: Record<PageFontScaleId, string> = {
  sm: "小",
  md: "标准",
  lg: "大",
  xl: "特大",
};

export function isPageFontScaleId(value: unknown): value is PageFontScaleId {
  return (
    typeof value === "string" &&
    (PAGE_FONT_SCALE_IDS as readonly string[]).includes(value)
  );
}

export function readPageFontScale(): PageFontScaleId {
  if (typeof window === "undefined") return PAGE_FONT_SCALE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PAGE_FONT_SCALE_STORAGE_KEY);
    if (isPageFontScaleId(raw)) return raw;
  } catch {
    /* private mode / blocked */
  }
  return PAGE_FONT_SCALE_DEFAULT;
}

export function writePageFontScale(scale: PageFontScaleId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAGE_FONT_SCALE_STORAGE_KEY, scale);
  } catch {
    /* ignore */
  }
}

export function applyPageFontScale(scale: PageFontScaleId): void {
  if (typeof document === "undefined") return;
  const percent = PAGE_FONT_SCALE_PERCENT[scale];
  if (scale === PAGE_FONT_SCALE_DEFAULT) {
    document.documentElement.style.removeProperty("font-size");
  } else {
    document.documentElement.style.fontSize = percent;
  }
}

export function stepPageFontScale(
  current: PageFontScaleId,
  delta: -1 | 1
): PageFontScaleId {
  const idx = PAGE_FONT_SCALE_IDS.indexOf(current);
  const next = Math.max(0, Math.min(PAGE_FONT_SCALE_IDS.length - 1, idx + delta));
  return PAGE_FONT_SCALE_IDS[next]!;
}
