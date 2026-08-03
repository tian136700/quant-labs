"use client";

import type { ReactNode } from "react";
import { JpLessonMobileIcon } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { JpLessonRecord } from "@/lib/types";

/** 桌面操作列：编辑学习内容/释义（文案按钮，避免与「编辑教案」图标混淆） */
export function JpLessonContentEditIconButton({
  lesson,
  onEdit,
}: {
  lesson: JpLessonRecord;
  onEdit: (lesson: JpLessonRecord) => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="jp-lesson-action-btn"
      title="编辑学习内容与释义"
      onClick={() => onEdit(lesson)}
    >
      <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
        <JpLessonMobileIcon name="notes" />
      </span>
      编辑内容
    </button>
  );
}

/** 手机底栏：编辑学习内容/释义 */
export function JpLessonContentEditMobileButton({
  lesson,
  idPrefix,
  onEdit,
}: {
  lesson: JpLessonRecord;
  idPrefix?: string;
  onEdit: (lesson: JpLessonRecord) => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="jp-lesson-mobile-footer-btn"
      onClick={() => onEdit(lesson)}
    >
      <JpLessonMobileIcon name="notes" />
      <span>
        {idPrefix ? `${idPrefix} ` : ""}
        编辑内容
      </span>
    </button>
  );
}
