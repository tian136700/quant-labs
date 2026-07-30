"use client";

import { useCallback, useEffect, useState } from "react";

export type LessonAnnotateMediaType = "image" | "pdf";

export type AnnotatePdfPage = {
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * PDF 教案：每一页转成独立图片，竖向堆叠下滑（禁止拼成一张超长图，避免 canvas 上限 / 无法翻页浏览）。
 * pdf 模块 await import()，禁止静态 import lesson-annotate-pdf（Worker gzip）。
 */
export function useLessonAnnotatePdfPages(opts: {
  open: boolean;
  mediaType: LessonAnnotateMediaType;
  sourceUrl: string;
}) {
  const { open, mediaType, sourceUrl } = opts;
  const isPdf = mediaType === "pdf" && Boolean(sourceUrl);

  const [pages, setPages] = useState<AnnotatePdfPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setPages([]);
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
    setPages([]);
    setLoadProgress({ done: 0, total: 0 });

    void (async () => {
      try {
        const { openAnnotatePdfAsPages } = await import(
          "@/components/lesson-annotate/lesson-annotate-pdf"
        );
        const loaded = await openAnnotatePdfAsPages(sourceUrl, {
          onProgress: (done, total) => {
            if (!cancelled) setLoadProgress({ done, total });
          },
        });
        if (cancelled) return;
        setPages(loaded);
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

  return {
    isPdf,
    pages,
    pageCount: pages.length,
    loading,
    loadProgress,
    error,
  };
}
