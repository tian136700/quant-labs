"use client";

import { useEffect, useState } from "react";

/** 约 2–3 张手机卡片高度后显示 */
const DEFAULT_THRESHOLD_PX = 520;

type Props = {
  thresholdPx?: number;
  className?: string;
};

export function MobileScrollToTopButton({
  thresholdPx = DEFAULT_THRESHOLD_PX,
  className = "",
}: Props) {
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setVisible(false);
      return;
    }
    const onScroll = () => {
      setVisible(window.scrollY > thresholdPx);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile, thresholdPx]);

  if (!isMobile || !visible) return null;

  return (
    <>
      <button
        type="button"
        className={`mobile-scroll-to-top ${className}`.trim()}
        aria-label="回到顶部"
        title="回到顶部"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
          <path
            d="M10 5.5 4.5 12h11L10 5.5Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <style jsx global>{`
        .mobile-scroll-to-top {
          position: fixed;
          left: max(0.75rem, env(safe-area-inset-left, 0px));
          bottom: calc(0.85rem + env(safe-area-inset-bottom, 0px));
          z-index: 90;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.75rem;
          height: 2.75rem;
          padding: 0;
          border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--panel) 92%, var(--accent) 8%);
          color: var(--accent);
          box-shadow:
            0 4px 18px rgba(0, 0, 0, 0.28),
            0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            opacity 0.18s ease,
            background 0.18s ease;
        }

        .mobile-scroll-to-top:active {
          transform: scale(0.94);
        }

        .mobile-scroll-to-top:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 2px;
        }

        @media (min-width: 768px) {
          .mobile-scroll-to-top {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
