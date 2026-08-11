"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyPageFontScale,
  PAGE_FONT_SCALE_DEFAULT,
  readPageFontScale,
  stepPageFontScale,
  writePageFontScale,
  type PageFontScaleId,
} from "@/lib/page-font-scale";

type PageFontScaleContextValue = {
  scale: PageFontScaleId;
  setScale: (scale: PageFontScaleId) => void;
  stepDown: () => void;
  stepUp: () => void;
};

const PageFontScaleContext = createContext<PageFontScaleContextValue | null>(
  null
);

export function usePageFontScale(): PageFontScaleContextValue {
  const ctx = useContext(PageFontScaleContext);
  if (!ctx) {
    throw new Error("usePageFontScale must be used within PageFontScaleProvider");
  }
  return ctx;
}

export function PageFontScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<PageFontScaleId>(PAGE_FONT_SCALE_DEFAULT);

  useEffect(() => {
    const stored = readPageFontScale();
    setScaleState(stored);
    applyPageFontScale(stored);
  }, []);

  const setScale = useCallback((next: PageFontScaleId) => {
    setScaleState(next);
    writePageFontScale(next);
    applyPageFontScale(next);
  }, []);

  const stepDown = useCallback(() => {
    setScaleState((prev) => {
      const next = stepPageFontScale(prev, -1);
      writePageFontScale(next);
      applyPageFontScale(next);
      return next;
    });
  }, []);

  const stepUp = useCallback(() => {
    setScaleState((prev) => {
      const next = stepPageFontScale(prev, 1);
      writePageFontScale(next);
      applyPageFontScale(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ scale, setScale, stepDown, stepUp }),
    [scale, setScale, stepDown, stepUp]
  );

  return (
    <PageFontScaleContext.Provider value={value}>
      {children}
    </PageFontScaleContext.Provider>
  );
}
