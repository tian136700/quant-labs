"use client";

import { useCallback, useState, type RefObject } from "react";
import {
  downloadAnnotateSession,
  saveAnnotateSession,
} from "@/components/lesson-annotate/lesson-annotate-save";
import { renderAnnotatedBlob } from "@/components/lesson-annotate/lesson-annotate-draw";
import type { Stroke } from "@/components/lesson-annotate/lesson-annotate-draw";
import type { useLessonAnnotatePdfPages } from "@/components/lesson-annotate/useLessonAnnotatePdfPages";
import type {
  EnLessonRecord,
  EnVocabRef,
  JpLessonRecord,
  JpVocabRef,
} from "@/lib/types";

type PdfPagesApi = ReturnType<typeof useLessonAnnotatePdfPages>;
type AnnotateSubject = "jp" | "en";

export function useLessonAnnotatePersist(opts: {
  pdf: PdfPagesApi;
  strokes: Stroke[];
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
    pdf,
    strokes,
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
    const img = imgRef.current;
    const meta = pdf.getStripMeta();
    if (!img?.naturalWidth || !meta?.pageHeights.length) {
      throw new Error("PDF 未就绪");
    }
    const annotated = await renderAnnotatedBlob(img, strokes);
    const objectUrl = URL.createObjectURL(annotated);
    try {
      const annotatedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("批注图加载失败"));
        el.src = objectUrl;
      });
      const { splitAnnotatedStripToPdfBlob } = await import(
        "@/components/lesson-annotate/lesson-annotate-pdf"
      );
      return splitAnnotatedStripToPdfBlob({
        annotatedStrip: annotatedImg,
        pageHeights: meta.pageHeights,
        stripWidth: meta.stripWidth || annotatedImg.naturalWidth,
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, [imgRef, pdf, strokes]);

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
        isPdf: pdf.isPdf,
        buildPdfBlob: pdf.isPdf ? buildPdfBlobFromSession : undefined,
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
    const confirmMsg = pdf.isPdf
      ? "将用当前长图批注按页裁回 PDF 并覆盖线上教案，其他新课不受影响。确定保存吗？"
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
        isPdf: pdf.isPdf,
        buildPdfBlob: pdf.isPdf ? buildPdfBlobFromSession : undefined,
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
