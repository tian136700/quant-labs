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
  onEditContent,
  onEditLesson,
  onOpenNextClassEdit,
  onOpenTeacherEdit,
}: Props): ReactNode {
  const rows = groupLessons.flatMap((lesson) => {
    const buttons: ReactNode[] = [];
    if (canOperate) {
      buttons.push(
        <JpLessonContentEditMobileButton
          key={`edit-content-${lesson.id}`}
          lesson={lesson}
          idPrefix={groupLessons.length > 1 ? `#${lesson.id}` : undefined}
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
          <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}编辑课程</span>
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
          <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}修改时间</span>
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
          <span>{groupLessons.length > 1 ? `#${lesson.id} ` : ""}修改老师</span>
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
