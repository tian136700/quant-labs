import { LOCALE_HEADER } from "@/lib/locale-detect";
import { uploadFormWithProgress } from "@/lib/upload-form-progress";
import { notifyVocabRefUpdated } from "@/lib/vocab-ref-live";
import type {
  EnLessonRecord,
  EnVocabRef,
  JpLessonRecord,
  JpVocabRef,
} from "@/lib/types";
import {
  downloadFilename,
  renderAnnotatedBlob,
  type Stroke,
} from "@/components/lesson-annotate/lesson-annotate-draw";

export async function downloadAnnotatedImage(
  img: HTMLImageElement,
  strokes: Stroke[],
  refKey: string,
  lessonId: number
): Promise<void> {
  const blob = await renderAnnotatedBlob(img, strokes);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadFilename(refKey, lessonId);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAnnotatedPdf(
  blob: Blob,
  refKey: string,
  lessonId: number
): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${refKey || `lesson-${lessonId}`}-annotate.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function uploadAnnotatedRefFile(params: {
  file: File;
  mediaType: "image" | "pdf";
  refKey: string;
  lessonId: number;
  subject: "jp" | "en";
  locale: "en" | "zh";
  onNeedAuth?: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
}): Promise<void> {
  const {
    file,
    mediaType,
    refKey,
    lessonId,
    subject,
    locale,
    onNeedAuth,
    onSaved,
  } = params;
  const form = new FormData();
  form.append("lesson_id", String(lessonId));
  form.append("file", file);
  form.append("media_type", mediaType);

  const result = await uploadFormWithProgress({
    url: subject === "jp" ? "/api/jp-lesson/ref/replace" : "/api/en-lesson/ref/replace",
    form,
    headers: { [LOCALE_HEADER]: locale },
  });

  const data = result.data as {
    ok?: boolean;
    ref?: JpVocabRef | EnVocabRef;
    lesson?: JpLessonRecord | EnLessonRecord;
    error?: string;
  };

  if (result.status === 401) {
    onNeedAuth?.();
    throw new Error("请登录后再保存教案。");
  }
  if (!result.ok || !data.ok || !data.ref || !data.lesson) {
    throw new Error(data.error || "保存失败");
  }

  notifyVocabRefUpdated({
    subject,
    refKey: data.ref.ref_key || refKey,
    updatedAt: data.ref.updated_at,
  });
  onSaved?.(data.ref, data.lesson);
}

export async function saveAnnotatedLessonRef(params: {
  img: HTMLImageElement;
  strokes: Stroke[];
  refKey: string;
  lessonId: number;
  subject: "jp" | "en";
  locale: "en" | "zh";
  onNeedAuth?: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
}): Promise<void> {
  const { img, strokes, refKey, lessonId, subject, locale, onNeedAuth, onSaved } =
    params;
  const blob = await renderAnnotatedBlob(img, strokes);
  const file = new File([blob], `${refKey || `lesson-${lessonId}`}.png`, {
    type: "image/png",
  });
  await uploadAnnotatedRefFile({
    file,
    mediaType: "image",
    refKey,
    lessonId,
    subject,
    locale,
    onNeedAuth,
    onSaved,
  });
}

export async function saveAnnotatedLessonPdfRef(params: {
  pdfBlob: Blob;
  refKey: string;
  lessonId: number;
  subject: "jp" | "en";
  locale: "en" | "zh";
  onNeedAuth?: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
}): Promise<void> {
  const { pdfBlob, refKey, lessonId, subject, locale, onNeedAuth, onSaved } =
    params;
  const file = new File([pdfBlob], `${refKey || `lesson-${lessonId}`}.pdf`, {
    type: "application/pdf",
  });
  await uploadAnnotatedRefFile({
    file,
    mediaType: "pdf",
    refKey,
    lessonId,
    subject,
    locale,
    onNeedAuth,
    onSaved,
  });
}

type PersistCommon = {
  img: HTMLImageElement;
  strokes: Stroke[];
  refKey: string;
  lessonId: number;
  subject: "jp" | "en";
  locale: "en" | "zh";
  isPdf: boolean;
  /** PDF：当前页批注写入 map 后合成整份 */
  buildPdfBlob?: () => Promise<Blob>;
  onNeedAuth?: () => void;
  onSaved?: (
    ref: JpVocabRef | EnVocabRef,
    lesson: JpLessonRecord | EnLessonRecord
  ) => void;
};

/** 下载当前随手画结果（图片页或整份 PDF）。 */
export async function downloadAnnotateSession(
  params: PersistCommon
): Promise<void> {
  const { img, strokes, refKey, lessonId, isPdf, buildPdfBlob } = params;
  if (isPdf) {
    if (!buildPdfBlob) throw new Error("PDF 未就绪");
    const pdfBlob = await buildPdfBlob();
    await downloadAnnotatedPdf(pdfBlob, refKey, lessonId);
    return;
  }
  await downloadAnnotatedImage(img, strokes, refKey, lessonId);
}

/** 保存为最新教案（图片覆盖 / PDF 整份覆盖）。 */
export async function saveAnnotateSession(params: PersistCommon): Promise<void> {
  const {
    img,
    strokes,
    refKey,
    lessonId,
    subject,
    locale,
    isPdf,
    buildPdfBlob,
    onNeedAuth,
    onSaved,
  } = params;
  if (isPdf) {
    if (!buildPdfBlob) throw new Error("PDF 未就绪");
    const pdfBlob = await buildPdfBlob();
    await saveAnnotatedLessonPdfRef({
      pdfBlob,
      refKey,
      lessonId,
      subject,
      locale,
      onNeedAuth,
      onSaved,
    });
    return;
  }
  await saveAnnotatedLessonRef({
    img,
    strokes,
    refKey,
    lessonId,
    subject,
    locale,
    onNeedAuth,
    onSaved,
  });
}
