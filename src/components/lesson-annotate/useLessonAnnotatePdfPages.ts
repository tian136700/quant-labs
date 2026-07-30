"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LessonAnnotateMediaType = "image" | "pdf";

export type AnnotatePdfStripMeta = {
  pageCount: number;
  /** 各页在长图中的像素高度（与 strip 同宽坐标系） */
  pageHeights: number[];
  stripWidth: number;
  stripHeight: number;
};

/**
 * PDF 教案：整份按页渲染后拼成一张可竖滑长图（非单页翻页）。
 * pdf 模块用 await import()，禁止静态 import lesson-annotate-pdf（Worker gzip）。
 */
export function useLessonAnnotatePdfPages(opts: {
  open: boolean;
  mediaType: LessonAnnotateMediaType;
  sourceUrl: string;
}) {
  const { open, mediaType, sourceUrl } = opts;
  const isPdf = mediaType === "pdf" && Boolean(sourceUrl);
  const metaRef = useRef<AnnotatePdfStripMeta | null>(null);

  const [pageDataUrl, setPageDataUrl] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    metaRef.current = null;
    setPageDataUrl("");
    setPageCount(0);
    setLoading(false);
    setLoadProgress({ done: 0, total: 0 });
    setError("");
  }, []);

  useEffect(() => {
    if (!open || !isPdf) {
      reset();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setPageDataUrl("");
    setLoadProgress({ done: 0, total: 0 });
    metaRef.current = null;

    void (async () => {
      try {
        const { openAnnotatePdfAsImageStrip } = await import(
          "@/components/lesson-annotate/lesson-annotate-pdf"
        );
        const strip = await openAnnotatePdfAsImageStrip(sourceUrl, {
          onProgress: (done, total) => {
            if (!cancelled) setLoadProgress({ done, total });
          },
        });
        if (cancelled) {
          strip.destroy();
          return;
        }
        metaRef.current = {
          pageCount: strip.pageCount,
          pageHeights: strip.pageHeights,
          stripWidth: strip.width,
          stripHeight: strip.height,
        };
        setPageCount(strip.pageCount);
        setPageDataUrl(strip.dataUrl);
        strip.destroy();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "PDF 加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isPdf, sourceUrl, reset]);

  const getStripMeta = useCallback(() => metaRef.current, []);

  return {
    isPdf,
    pageCount,
    pageDataUrl,
    loading,
    loadProgress,
    error,
    getStripMeta,
  };
}
