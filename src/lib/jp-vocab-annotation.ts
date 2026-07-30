/** 与 parseLessonContent 一致：按逗号拆 content 项（本文件自洽，避免环依赖） */
function parseContentItems(raw: string): string[] {
  return (raw || "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 词条「标注」：口语 / 考试常用（老师与学生卡片展示） */
export const JP_VOCAB_ANNOTATION_VALUES = [
  "口语常用",
  "考试常用",
  "口语考试都常用",
] as const;

export type JpVocabAnnotation = (typeof JP_VOCAB_ANNOTATION_VALUES)[number];

export const JP_VOCAB_ANNOTATION_LABEL = "标注";

export function isJpVocabAnnotation(
  raw: string | null | undefined
): raw is JpVocabAnnotation {
  const t = (raw || "").trim();
  return (JP_VOCAB_ANNOTATION_VALUES as readonly string[]).includes(t);
}

/** 空 → null；非法非空 → null（读库容错） */
export function normalizeJpVocabAnnotation(
  raw: string | null | undefined
): JpVocabAnnotation | null {
  const t = (raw || "").trim();
  if (!t) return null;
  return isJpVocabAnnotation(t) ? t : null;
}

/**
 * 上传校验：空允许；非空必须是三选一。
 * 返回规范化值或 error。
 */
export function parseJpVocabAnnotationInput(
  raw: string | null | undefined
):
  | { ok: true; value: JpVocabAnnotation | null }
  | { ok: false; error: "invalid_annotation" } {
  const t = (raw || "").trim();
  if (!t) return { ok: true, value: null };
  if (!isJpVocabAnnotation(t)) return { ok: false, error: "invalid_annotation" };
  return { ok: true, value: t };
}

/** 新课 annotations：与 meanings 相同，用 | 分隔、与 content 项对齐 */
export function parseLessonAnnotations(raw: string | null | undefined): string[] {
  const text = (raw || "").trim();
  if (!text) return [];
  return text.split("|").map((s) => s.trim());
}

export function alignLessonItemAnnotations(
  content: string,
  annotationsRaw: string | null | undefined
): Array<JpVocabAnnotation | null> {
  const items = parseContentItems(content);
  const parts = parseLessonAnnotations(annotationsRaw);
  return items.map((_, index) => normalizeJpVocabAnnotation(parts[index] ?? null));
}

/**
 * 入库前规范化；任一项非空且非法 → invalid_annotation。
 */
export function normalizeLessonAnnotationsForStorage(
  content: string,
  annotationsRaw: string | null | undefined
):
  | { ok: true; value: string | null }
  | { ok: false; error: "invalid_annotation" } {
  const items = parseContentItems(content);
  if (!items.length) return { ok: true, value: null };
  const parts = parseLessonAnnotations(annotationsRaw);
  const aligned: Array<JpVocabAnnotation | null> = [];
  for (let i = 0; i < items.length; i++) {
    const raw = parts[i] ?? "";
    const parsed = parseJpVocabAnnotationInput(raw);
    if (!parsed.ok) return parsed;
    aligned.push(parsed.value);
  }
  if (!aligned.some(Boolean)) return { ok: true, value: null };
  return {
    ok: true,
    value: aligned.map((a) => a || "").join("|"),
  };
}

export function formatLessonAnnotationsLines(
  content: string,
  annotationsRaw: string | null | undefined,
  perLine = 3
): string[] {
  const aligned = alignLessonItemAnnotations(content, annotationsRaw);
  if (!aligned.some(Boolean)) return [];
  const lines: string[] = [];
  for (let i = 0; i < aligned.length; i += perLine) {
    const chunk = aligned
      .slice(i, i + perLine)
      .map((item) => item || "—")
      .join(", ");
    lines.push(chunk);
  }
  return lines;
}

export function lessonHasAnnotations(
  content: string,
  annotationsRaw: string | null | undefined
): boolean {
  return alignLessonItemAnnotations(content, annotationsRaw).some(Boolean);
}
