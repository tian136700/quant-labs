"use client";

import { useCallback, useState, type RefObject } from "react";
import {
  downloadAnnotateSession,
  saveAnnotateSession,
} from "@/components/lesson-annotate/lesson-annotate-save";
import type { Stroke } from "@/components/lesson-annotate/lesson-annotate-draw";
import type { AnnotatePdfPage } from "@/components/lesson-annotate/useLessonAnnotatePdfPages";
import type {
  EnLessonRecord,
  EnVocabRef,
  JpLessonRecord,
  JpVocabRef,
} from "@/lib/types";

type AnnotateSubject = "jp" | "en";

export function useLessonAnnotatePersist(opts: {
  isPdf: boolean;
  pdfPages: AnnotatePdfPage[];
  /** 当前编辑页（图片模式恒为 0） */
  activePageIndex: number;
  strokes: Stroke[];
  strokesByPageRef: RefObject<Map<number, Stroke[]>>;
  imgRef: RefObject<HTMLImageElement | null>;
  refKey: string;
  lessonId: number;
  subject: AnnotateSubject;
  locale: "en" | "zh";
  canSave: boolean;
  onNeedAuth?: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
}) {
  const {
    isPdf,
    pdfPages,
    activePageIndex,
    strokes,
    strokesByPageRef,
    imgRef,
    refKey,
    lessonId,
    subject,
    locale,
    canSave,
    onNeedAuth,
    onSaved,
  } = opts;

  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const buildPdfBlobFromSession = useCallback(async () => {
    if (!pdfPages.length) throw new Error("PDF 未就绪");
    const map = new Map(strokesByPageRef.current ?? []);
    map.set(activePageIndex, strokes);
    const { composeAnnotatedPdfBlob } = await import(
      "@/components/lesson-annotate/lesson-annotate-pdf"
    );
    return composeAnnotatedPdfBlob({
      getPageDataUrl: async (pageNumber1Based) => {
        const page = pdfPages[pageNumber1Based - 1];
        if (!page) throw new Error("页码无效");
        return page.dataUrl;
      },
      pageCount: pdfPages.length,
      strokesByPage: map,
    });
  }, [activePageIndex, pdfPages, strokes, strokesByPageRef]);

  const downloadAnnotated = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || downloading || saving) return;
    setDownloading(true);
    try {
      await downloadAnnotateSession({
        img,
        strokes,
        refKey,
        lessonId,
        subject,
        locale,
        isPdf,
        buildPdfBlob: isPdf ? buildPdfBlobFromSession : undefined,
      });
    } catch {
      window.alert("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };

  const saveAsLatestRef = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || downloading || saving) return;
    if (!canSave) {
      onNeedAuth?.();
      return;
    }
    const confirmMsg = isPdf
      ? "将把各页批注写回 PDF 并覆盖线上教案，其他新课不受影响。确定保存吗？"
      : "将用当前批注覆盖线上教案图片，其他新课不受影响。确定保存吗？";
    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    setSaveStatus("");
    try {
      await saveAnnotateSession({
        img,
        strokes,
        refKey,
        lessonId,
        subject,
        locale,
        isPdf,
        buildPdfBlob: isPdf ? buildPdfBlobFromSession : undefined,
        onNeedAuth,
        onSaved,
      });
      setSaveStatus("已保存为最新教案");
      window.setTimeout(() => setSaveStatus(""), 2500);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return {
    downloading,
    saving,
    saveStatus,
    downloadAnnotated,
    saveAsLatestRef,
  };
}
