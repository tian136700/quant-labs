"use client";

import type { ReactNode } from "react";
import {
  JpLessonContentEditMobileButton,
} from "@/components/jp-lesson-page/JpLessonContentEditButtons";
import { JpLessonMobileIcon } from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import type { JpLessonRecord } from "@/lib/types";

type Props = {
  groupLessons: JpLessonRecord[];
  canOperate: boolean;
  isAdmin: boolean;
  savingNextClassId: number | null;
  onViewWords: (lesson: JpLessonRecord) => void;
  onEditContent: (lesson: JpLessonRecord) => void;
  onEditLesson: (lesson: JpLessonRecord) => void;
  onOpenNextClassEdit: (lesson: JpLessonRecord) => void;
  onOpenTeacherEdit: (lesson: JpLessonRecord) => void;
};

export function JpLessonStatusTableMobileFooter({
  groupLessons,
  canOperate,
  isAdmin,
  savingNextClassId,
  onViewWords,
  onEditContent,
  onEditLesson,
  onOpenNextClassEdit,
  onOpenTeacherEdit,
}: Props): ReactNode {
  const rows = groupLessons.flatMap((lesson) => {
    const buttons: ReactNode[] = [];
    const idPrefix = groupLessons.length > 1 ? `#${lesson.id}` : undefined;
    if (!lesson.ref_key) {
      buttons.push(
        <button
          key={`view-words-${lesson.id}`}
          type="button"
          className="jp-lesson-mobile-footer-btn"
          onClick={() => onViewWords(lesson)}
        >
          <JpLessonMobileIcon name="view" />
          <span>{idPrefix ? `${idPrefix} ` : ""}查看</span>
        </button>
      );
    }
    if (canOperate) {
      buttons.push(
        <JpLessonContentEditMobileButton
          key={`edit-content-${lesson.id}`}
          lesson={lesson}
          idPrefix={idPrefix}
          onEdit={onEditContent}
        />
      );
      buttons.push(
        <button
          key={`edit-${lesson.id}`}
          type="button"
          className="jp-lesson-mobile-footer-btn"
          onClick={() => onEditLesson(lesson)}
        >
          <JpLessonMobileIcon name="edit" />
          <span>{idPrefix ? `${idPrefix} ` : ""}编辑课程</span>
        </button>
      );
    }
    if (isAdmin) {
      buttons.push(
        <button
          key={`time-${lesson.id}`}
          type="button"
          className="jp-lesson-mobile-footer-btn"
          disabled={savingNextClassId === lesson.id}
          onClick={() => onOpenNextClassEdit(lesson)}
        >
          <JpLessonMobileIcon name="clock" />
          <span>{idPrefix ? `${idPrefix} ` : ""}修改时间</span>
        </button>
      );
      buttons.push(
        <button
          key={`teacher-${lesson.id}`}
          type="button"
          className="jp-lesson-mobile-footer-btn"
          onClick={() => onOpenTeacherEdit(lesson)}
        >
          <JpLessonMobileIcon name="user" />
          <span>{idPrefix ? `${idPrefix} ` : ""}修改老师</span>
        </button>
      );
    }
    if (!buttons.length) return [];
    return (
      <div
        key={lesson.id}
        className="jp-lesson-mobile-footer-row"
        style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}
      >
        {buttons}
      </div>
    );
  });

  if (!rows.length) {
    return <td className="jp-lesson-mobile-card-footer" aria-hidden="true" />;
  }

  return (
    <td className="jp-lesson-mobile-card-footer">
      <div className="jp-lesson-mobile-footer-stack">{rows}</div>
    </td>
  );
}
