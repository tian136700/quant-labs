"use client";

import { useCallback, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import {
  downloadAnnotateSession,
  saveAnnotateSession,
} from "@/components/lesson-annotate/lesson-annotate-save";
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
  setStrokes: Dispatch<SetStateAction<Stroke[]>>;
  setSelectedTextIndex: (v: number | null) => void;
  setPreviewLine: (v: null) => void;
  setPreviewRect: (v: null) => void;
  setTextDraft: (v: null) => void;
  setImgReady: (v: boolean) => void;
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
    setStrokes,
    setSelectedTextIndex,
    setPreviewLine,
    setPreviewRect,
    setTextDraft,
    setImgReady,
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
    const doc = pdf.getDoc();
    if (!doc) throw new Error("PDF 未就绪");
    const strokesByPage = pdf.takeStrokesSnapshot(pdf.pageIndex, strokes);
    const { composeAnnotatedPdfBlob } = await import(
      "@/components/lesson-annotate/lesson-annotate-pdf"
    );
    return composeAnnotatedPdfBlob({
      getPageDataUrl: (n) => doc.getPageDataUrl(n),
      pageCount: pdf.pageCount,
      strokesByPage,
    });
  }, [pdf, strokes]);

  const changePdfPage = async (nextIndex: number) => {
    const restored = await pdf.goToPage(nextIndex, strokes);
    if (restored == null) return;
    setSelectedTextIndex(null);
    setPreviewLine(null);
    setPreviewRect(null);
    setTextDraft(null);
    setStrokes(restored);
    setImgReady(false);
  };

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
      ? "将用当前各页批注重新合成 PDF 并覆盖线上教案，其他新课不受影响。确定保存吗？"
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
    changePdfPage,
    downloadAnnotated,
    saveAsLatestRef,
  };
}
