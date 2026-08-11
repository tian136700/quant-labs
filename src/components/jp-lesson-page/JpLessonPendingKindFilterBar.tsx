"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { fixedDropdownPanelStyle } from "@/lib/fixed-dropdown-panel";
import {
  buildJpLessonPendingKindFilter,
  jpLessonPendingCourseScope,
  jpLessonPendingKindBase,
  jpLessonPendingKindFilterVisibleCount,
  jpLessonPendingKindTabLabel,
  type JpLessonPendingCourseScope,
  type JpLessonPendingKindBase,
  type JpLessonPendingKindCounts,
  type JpLessonPendingKindFilter,
} from "@/lib/jp-lesson-pending-kind-filter";

type Props = {
  pendingKindFilter: JpLessonPendingKindFilter;
  setPendingKindFilter: (kind: JpLessonPendingKindFilter) => void;
  pendingKindCounts: JpLessonPendingKindCounts;
};

const COURSE_MENU_ITEMS: {
  scope: JpLessonPendingCourseScope;
  label: string;
}[] = [
  { scope: "all", label: "全部" },
  { scope: "with_course", label: "有教材" },
  { scope: "without_course", label: "无教材" },
];

const PANEL_HEIGHT = 168;

function KindDropdown({
  base,
  pendingKindFilter,
  setPendingKindFilter,
  pendingKindCounts,
  open,
  setOpenMenu,
}: {
  base: JpLessonPendingKindBase;
  pendingKindFilter: JpLessonPendingKindFilter;
  setPendingKindFilter: (kind: JpLessonPendingKindFilter) => void;
  pendingKindCounts: JpLessonPendingKindCounts;
  open: boolean;
  setOpenMenu: (menu: JpLessonPendingKindBase | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const activeBase = jpLessonPendingKindBase(pendingKindFilter) === base;
  const tabLabel = jpLessonPendingKindTabLabel(base, pendingKindFilter);
  const tabCount = activeBase
    ? jpLessonPendingKindFilterVisibleCount(pendingKindCounts, pendingKindFilter)
    : pendingKindCounts[base];
  const currentScope = activeBase
    ? jpLessonPendingCourseScope(pendingKindFilter)
    : null;

  const updatePanelStyle = useCallback(() => {
    if (!wrapRef.current) return;
    setPanelStyle(
      fixedDropdownPanelStyle(wrapRef.current.getBoundingClientRect(), PANEL_HEIGHT, {
        zIndex: 10000,
      })
    );
  }, []);

  const toggleOpen = useCallback(() => {
    if (open) {
      setOpenMenu(null);
      return;
    }
    // 从「全部」或另一类点进来时，先切到该类型「全部」，再开教材子菜单
    if (jpLessonPendingKindBase(pendingKindFilter) !== base) {
      setPendingKindFilter(base);
    }
    setOpenMenu(base);
  }, [base, open, pendingKindFilter, setOpenMenu, setPendingKindFilter]);

  useEffect(() => {
    if (!open) return;
    updatePanelStyle();

    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    const onScrollOrResize = () => {
      updatePanelStyle();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc);
    }, 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, setOpenMenu, updatePanelStyle]);

  const pick = (scope: JpLessonPendingCourseScope) => {
    setPendingKindFilter(buildJpLessonPendingKindFilter(base, scope));
    setOpenMenu(null);
  };

  return (
    <div
      className={`jp-lesson-pending-kind-dropdown${open ? " is-open" : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeBase}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`jp-lesson-pending-kind-tab jp-lesson-pending-kind-tab--${base}${
          activeBase ? " is-active" : ""
        }`}
        onClick={toggleOpen}
      >
        <span className="jp-lesson-pending-kind-tab-label">{tabLabel}</span>
        <span className="jp-lesson-pending-kind-tab-count">{tabCount}</span>
        <span className="jp-lesson-pending-kind-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="jp-lesson-pending-kind-menu"
          style={panelStyle}
          role="menu"
          aria-label={base === "word" ? "单词教材筛选" : "语法教材筛选"}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {COURSE_MENU_ITEMS.map(({ scope, label }) => {
            const filterValue = buildJpLessonPendingKindFilter(base, scope);
            const count = jpLessonPendingKindFilterVisibleCount(
              pendingKindCounts,
              filterValue
            );
            const selected = currentScope === scope;
            return (
              <button
                key={scope}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`jp-lesson-pending-kind-menu-item${
                  selected ? " is-selected" : ""
                }`}
                onClick={() => pick(scope)}
              >
                <span className="jp-lesson-pending-kind-menu-label">{label}</span>
                <span className="jp-lesson-pending-kind-menu-count">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function JpLessonPendingKindFilterBar({
  pendingKindFilter,
  setPendingKindFilter,
  pendingKindCounts,
}: Props) {
  const [openMenu, setOpenMenu] = useState<JpLessonPendingKindBase | null>(null);

  return (
    <div
      className="jp-lesson-pending-kind-filter"
      role="tablist"
      aria-label="未完成类型筛选"
    >
      <button
        type="button"
        role="tab"
        aria-selected={pendingKindFilter === "all"}
        className={`jp-lesson-pending-kind-tab jp-lesson-pending-kind-tab--all${
          pendingKindFilter === "all" ? " is-active" : ""
        }`}
        onClick={() => {
          setPendingKindFilter("all");
          setOpenMenu(null);
        }}
      >
        <span className="jp-lesson-pending-kind-tab-label">全部</span>
        <span className="jp-lesson-pending-kind-tab-count">
          {pendingKindCounts.all}
        </span>
      </button>
      <KindDropdown
        base="word"
        pendingKindFilter={pendingKindFilter}
        setPendingKindFilter={setPendingKindFilter}
        pendingKindCounts={pendingKindCounts}
        open={openMenu === "word"}
        setOpenMenu={setOpenMenu}
      />
      <KindDropdown
        base="grammar"
        pendingKindFilter={pendingKindFilter}
        setPendingKindFilter={setPendingKindFilter}
        pendingKindCounts={pendingKindCounts}
        open={openMenu === "grammar"}
        setOpenMenu={setOpenMenu}
      />
    </div>
  );
}
