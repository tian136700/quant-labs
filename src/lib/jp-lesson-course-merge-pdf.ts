/**
 * 日语新课：同一课单词+语法教案合并为分页 PDF（客户端懒加载入口）。
 * 顺序固定：先单词切段页，再语法切段页；页码连续。
 * 首版仅支持两侧均为 image 长图。
 */

import type { JpVocabRefCropKind } from "@/lib/jp-vocab-ref-pdf-export";

export type JpLessonCourseMergePdfInput = {
  courseLabel: string;
  word: {
    mediaUrl: string;
    filenameBase: string;
    cropKind: JpVocabRefCropKind;
  };
  grammar: {
    mediaUrl: string;
    filenameBase: string;
    cropKind: JpVocabRefCropKind;
  };
};

export type JpLessonCourseMergePdfResult = {
  blob: Blob;
  filename: string;
  pageCount: number;
};

export async function buildJpLessonCourseMergedPaginatedPdf(
  input: JpLessonCourseMergePdfInput
): Promise<JpLessonCourseMergePdfResult> {
  const { buildMergedJpVocabRefPaginatedPdf } = await import(
    "@/lib/jp-vocab-ref-pdf-export"
  );
  const base =
    (input.courseLabel || "").trim().replace(/[\\/:*?"<>|]+/g, "") || "整课教案";
  return buildMergedJpVocabRefPaginatedPdf(
    [
      {
        imageUrl: input.word.mediaUrl,
        filenameBase: input.word.filenameBase,
        cropKind: input.word.cropKind,
      },
      {
        imageUrl: input.grammar.mediaUrl,
        filenameBase: input.grammar.filenameBase,
        cropKind: input.grammar.cropKind,
      },
    ],
    base
  );
}
