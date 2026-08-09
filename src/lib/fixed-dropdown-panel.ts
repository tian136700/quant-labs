import type { CSSProperties } from "react";

/**
 * Fixed dropdown panel placement: open below the trigger when space allows,
 * otherwise flip above so the menu stays in the viewport.
 * Used by lesson download/copy menus in scrollable tables.
 */
export function fixedDropdownPanelStyle(
  anchor: DOMRect,
  panelHeight: number,
  options?: { gap?: number; zIndex?: number }
): CSSProperties {
  const gap = options?.gap ?? 4;
  const zIndex = options?.zIndex ?? 1000;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const spaceAbove = anchor.top;
  const openUp =
    spaceBelow < panelHeight + gap && spaceAbove >= panelHeight + gap
      ? true
      : spaceBelow < panelHeight + gap && spaceAbove > spaceBelow;

  return {
    position: "fixed",
    ...(openUp
      ? { bottom: window.innerHeight - anchor.top + gap, top: "auto" }
      : { top: anchor.bottom + gap, bottom: "auto" }),
    right: Math.max(8, window.innerWidth - anchor.right),
    left: "auto",
    zIndex,
  };
}
