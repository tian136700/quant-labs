"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  openAnnotatePdfFromUrl,
  type AnnotatePdfDoc,
} from "@/components/lesson-annotate/lesson-annotate-pdf";
import type { Stroke } from "@/components/lesson-annotate/lesson-annotate-draw";

export type LessonAnnotateMediaType = "image" | "pdf";

/**
 * PDF 教案：按页加载 data URL，并把每页批注缓存在内存（翻页不丢，关窗才清）。
 */
export function useLessonAnnotatePdfPages(opts: {
  open: boolean;
  mediaType: LessonAnnotateMediaType;
  sourceUrl: string;
}) {
  const { open, mediaType, sourceUrl } = opts;
  const isPdf = mediaType === "pdf" && Boolean(sourceUrl);
  const docRef = useRef<AnnotatePdfDoc | null>(null);
  const strokesByPageRef = useRef<Map<number, Stroke[]>>(new Map());

  const [pageIndex, setPageIndex] = useState(0); // 0-based
  const [pageCount, setPageCount] = useState(0);
  const [pageDataUrl, setPageDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    docRef.current?.destroy();
    docRef.current = null;
    strokesByPageRef.current = new Map();
    setPageIndex(0);
    setPageCount(0);
    setPageDataUrl("");
    setLoading(false);
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
    strokesByPageRef.current = new Map();

    void (async () => {
      try {
        const doc = await openAnnotatePdfFromUrl(sourceUrl);
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current?.destroy();
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPageIndex(0);
        const url = await doc.getPageDataUrl(1);
        if (cancelled) return;
        setPageDataUrl(url);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "PDF 加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [open, isPdf, sourceUrl, reset]);

  const stashPageStrokes = useCallback((page: number, strokes: Stroke[]) => {
    strokesByPageRef.current.set(page, strokes);
  }, []);

  const strokesForPage = useCallback((page: number): Stroke[] => {
    return strokesByPageRef.current.get(page) ?? [];
  }, []);

  const goToPage = useCallback(
    async (nextIndex: number, currentStrokes: Stroke[]) => {
      const doc = docRef.current;
      if (!doc || pageCount < 1) return null;
      const clamped = Math.max(0, Math.min(pageCount - 1, nextIndex));
      stashPageStrokes(pageIndex, currentStrokes);
      setLoading(true);
      setError("");
      try {
        const url = await doc.getPageDataUrl(clamped + 1);
        setPageIndex(clamped);
        setPageDataUrl(url);
        return strokesForPage(clamped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "翻页失败");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [pageCount, pageIndex, stashPageStrokes, strokesForPage]
  );

  const getDoc = useCallback(() => docRef.current, []);

  const takeStrokesSnapshot = useCallback(
    (currentPage: number, currentStrokes: Stroke[]) => {
      stashPageStrokes(currentPage, currentStrokes);
      return new Map(strokesByPageRef.current);
    },
    [stashPageStrokes]
  );

  return {
    isPdf,
    pageIndex,
    pageCount,
    pageDataUrl,
    loading,
    error,
    stashPageStrokes,
    strokesForPage,
    goToPage,
    getDoc,
    takeStrokesSnapshot,
  };
}
