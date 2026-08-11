"use client";

import { usePageFontScale } from "@/contexts/PageFontScaleProvider";
import {
  PAGE_FONT_SCALE_IDS,
  PAGE_FONT_SCALE_LABEL,
} from "@/lib/page-font-scale";

type PageFontScaleControlProps = {
  /** 抽屉内全宽；桌面顶栏用 compact */
  fullWidth?: boolean;
};

/**
 * 顶栏 / 抽屉：页面字号 A− / 档位 / A+（「刷新」左侧）。
 */
export function PageFontScaleControl({
  fullWidth = false,
}: PageFontScaleControlProps) {
  const { scale, stepDown, stepUp } = usePageFontScale();
  const atMin = scale === PAGE_FONT_SCALE_IDS[0];
  const atMax = scale === PAGE_FONT_SCALE_IDS[PAGE_FONT_SCALE_IDS.length - 1];
  const label = PAGE_FONT_SCALE_LABEL[scale];

  return (
    <div
      className={[
        "iq-page-font-scale",
        fullWidth ? "iq-page-font-scale--block" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label="页面字号"
    >
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--compact iq-page-font-scale__btn"
        disabled={atMin}
        aria-label="缩小字号"
        title="缩小字号"
        onClick={stepDown}
      >
        A−
      </button>
      <span
        className="iq-page-font-scale__label"
        aria-live="polite"
        title={`当前字号：${label}`}
      >
        {label}
      </span>
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--compact iq-page-font-scale__btn"
        disabled={atMax}
        aria-label="放大字号"
        title="放大字号"
        onClick={stepUp}
      >
        A+
      </button>
    </div>
  );
}
