"use client";

import { useMemo } from "react";
import { EnLessonScheduleLinkPickModal } from "@/components/en-lesson-page/EnLessonScheduleLinkPickModal";
import { JpLessonManualScheduleLessonPickModal } from "@/components/JpLessonManualScheduleLessonPickModal";
import { resolveManualScheduleLessonPickOptions } from "@/components/JpLessonManualScheduleLessonPicker";
import { filterEnLessonsForScheduleLink } from "@/lib/en-lesson-schedule-link-pick";
import {
  linkedLessonKey,
  type ManualScheduleLessonOption,
} from "@/lib/jp-lesson-manual-schedule-linked";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import { detectScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import type { EnLessonRecord, EnLessonTeacher, JpLessonRecord } from "@/lib/types";

type Props = {
  open: boolean;
  manual: JpLessonManualSchedule | null;
  jpLessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  enTeachers?: EnLessonTeacher[];
  syncing?: boolean;
  progressPercent?: number | null;
  onClose: () => void;
  onPick: (option: ManualScheduleLessonOption) => void | Promise<void>;
};

/**
 * 日程详情右侧「关联教材」：直接打开选教材弹窗，无需先进编辑。
 * 英语标题 → 迷你英语新课列表（未完成/上课中）；其它仍用通用卡片列表。
 */
export function JpLessonManualScheduleLinkFromDetailModal({
  open,
  manual,
  jpLessons,
  enLessons,
  enTeachers = [],
  syncing = false,
  progressPercent = null,
  onClose,
  onPick,
}: Props) {
  const titleSubject = detectScheduleTeacherSubjectFromTitle(manual?.title ?? "");
  const { options, fieldLabel, emptyHint } = useMemo(
    () => resolveManualScheduleLessonPickOptions(titleSubject, jpLessons, enLessons),
    [titleSubject, jpLessons, enLessons]
  );
  const selectedKeys = useMemo(
    () =>
      new Set(
        (manual?.linked_lessons ?? []).map((link) => linkedLessonKey(link))
      ),
    [manual?.linked_lessons]
  );

  const enLinkableLessons = useMemo(
    () => filterEnLessonsForScheduleLink(enLessons),
    [enLessons]
  );

  if (titleSubject === "en") {
    return (
      <EnLessonScheduleLinkPickModal
        open={open && manual != null}
        lessons={enLessons}
        teachers={enTeachers}
        selectedKeys={selectedKeys}
        emptyHint={
          enLinkableLessons.length
            ? null
            : emptyHint || "暂无未完成或上课中的英语新课可关联"
        }
        fieldLabel={fieldLabel}
        disabled={syncing}
        syncing={syncing}
        progressPercent={progressPercent}
        onClose={onClose}
        onPick={(option) => {
          void onPick(option);
        }}
      />
    );
  }

  return (
    <JpLessonManualScheduleLessonPickModal
      open={open && manual != null}
      options={options}
      selectedKeys={selectedKeys}
      emptyHint={emptyHint}
      fieldLabel={fieldLabel}
      disabled={syncing}
      onClose={onClose}
      onPick={(option) => {
        void onPick(option);
      }}
    />
  );
}
