"use client";

import { type ReactNode } from "react";
import { formatBeijingDateTime, formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  JP_LESSON_CACHE_KEY,
  parseEnLessonApi,
  type EnLessonApiPayload,
} from "@/lib/en-api-cache";
import {
  buildEnLessonDisplayGroups,
  buildLearningClassDayToneMap,
  formatClassDurationLabel,
  formatClassDurationLabelCompact,
  formatLessonContentLines,
  parseLessonContent,
  formatNextClassAtLabel,
  formatNextClassAtLabelCompact,
  getEnLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  enLessonProgressToFields,
  normalizeClassDurationMinutes,
  type EnLessonDisplayGroup,
  type EnLessonClassTimeSortOrder,
  type EnLessonProgressStatus,
} from "@/lib/en-lesson-shared";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import {
  enLessonRefDownloadFilename,
  enVocabRefApiPath,
  enVocabRefViewerPath,
} from "@/lib/en-vocab-ref-shared";
import type {
  EnLessonClassScheduleInput,
  EnLessonNote,
  EnLessonRecord,
  EnLessonTeacher,
  EnVocabRef,
} from "@/lib/types";

export function readLessonCache(): EnLessonApiPayload | null {
  return readClientCache<EnLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

export function persistLessonCache(
  lessons: EnLessonRecord[],
  refs: Record<string, EnVocabRef>,
  notes: EnLessonNote[],
  teachers?: EnLessonTeacher[]
) {
  writeClientCache(JP_LESSON_CACHE_KEY, { lessons, refs, notes, teachers });
}

export function refViewUrl(refKey: string, updatedAt?: string | null): string {
  return enVocabRefViewerPath(refKey, updatedAt);
}

export const LESSON_STATUS_SECTIONS: {
  status: EnLessonProgressStatus;
  title: string;
  emptyHint: string;
}[] = [
  { status: "learning", title: "学习中", emptyHint: "暂无学习中的新课" },
  { status: "pending", title: "未完成", emptyHint: "暂无未完成的新课" },
  { status: "completed", title: "已完成", emptyHint: "暂无已完成的新课" },
];

export function groupLessonsForDisplay(
  lessons: EnLessonRecord[],
  classTimeSortOrder: EnLessonClassTimeSortOrder
): EnLessonDisplayGroup<EnLessonRecord>[] {
  return buildEnLessonDisplayGroups(lessons, classTimeSortOrder);
}

export function refFilename(lesson: EnLessonRecord, ref?: EnVocabRef): string {
  const mediaType = ref?.media_type === "pdf" ? "pdf" : "image";
  return enLessonRefDownloadFilename(lesson, mediaType);
}

export const EN_LESSON_CONTENT_PREVIEW_LINES = 2;
/** 折叠时最多展示的词/短语条数（约两行 × 每行 3 个） */
export const EN_LESSON_CONTENT_PREVIEW_ITEMS = 6;

export function EnLessonContentPreview({
  content,
  expanded,
  onToggle,
}: {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const items = parseLessonContent(content);
  const lines = formatLessonContentLines(content);
  const needsMore =
    lines.length > EN_LESSON_CONTENT_PREVIEW_LINES ||
    items.length > EN_LESSON_CONTENT_PREVIEW_ITEMS;
  const shown =
    !expanded && needsMore ? lines.slice(0, EN_LESSON_CONTENT_PREVIEW_LINES) : lines;

  return (
    <div
      className={`jp-lesson-content-preview${expanded ? " is-expanded" : ""}${
        needsMore && !expanded ? " is-clamped" : ""
      }`}
    >
      <div className="jp-lesson-content-lines jp-lesson-content-desktop">
        {shown.map((line, lineIdx) => (
          <span key={lineIdx} className="jp-lesson-content-line">
            {line}
          </span>
        ))}
      </div>
      {needsMore ? (
        <button
          type="button"
          className="jp-lesson-content-more-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "更多"}
        </button>
      ) : null}
    </div>
  );
}

export type EnLessonMobileIconName =
  | "edit"
  | "calendar"
  | "user"
  | "upload"
  | "clock"
  | "view"
  | "pen"
  | "download"
  | "copy"
  | "notes";

export function EnLessonMobileIcon({
  name,
  className = "",
}: {
  name: EnLessonMobileIconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const body = (() => {
    switch (name) {
      case "edit":
      case "pen":
        return <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" {...common} />;
      case "calendar":
        return (
          <>
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.2" {...common} />
            <path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" {...common} />
          </>
        );
      case "user":
        return (
          <>
            <circle cx="8" cy="5.5" r="2.2" {...common} />
            <path d="M3.5 13.5c.8-2.2 2.6-3.5 4.5-3.5s3.7 1.3 4.5 3.5" {...common} />
          </>
        );
      case "upload":
        return (
          <>
            <path d="M8 10V3.5M5.5 6 8 3.5 10.5 6" {...common} />
            <path d="M3 12.5h10" {...common} />
          </>
        );
      case "clock":
        return (
          <>
            <circle cx="8" cy="8" r="5.5" {...common} />
            <path d="M8 5v3.5l2.2 1.3" {...common} />
          </>
        );
      case "view":
        return (
          <>
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" {...common} />
            <circle cx="8" cy="8" r="2" {...common} />
          </>
        );
      case "download":
        return (
          <>
            <path d="M8 2.5v7M5.5 7 8 9.5 10.5 7" {...common} />
            <path d="M3 12.5h10" {...common} />
          </>
        );
      case "copy":
        return (
          <>
            <rect x="5.5" y="5.5" width="7" height="7" rx="1" {...common} />
            <path d="M3.5 10.5V4.5a1 1 0 011-1H10" {...common} />
          </>
        );
      case "notes":
        return <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" {...common} />;
      default:
        return null;
    }
  })();
  return (
    <svg
      className={`jp-lesson-mobile-icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

export function EnLessonMobileFieldValue({
  icon,
  children,
}: {
  icon: EnLessonMobileIconName;
  children: ReactNode;
}) {
  return (
    <div className="jp-lesson-mobile-field-value">
      <EnLessonMobileIcon name={icon} />
      <span className="jp-lesson-mobile-field-text">{children}</span>
    </div>
  );
}

export function renderLessonDateTime(iso: string) {
  const full = formatBeijingDateTime(iso);
  const spaceIdx = full.lastIndexOf(" ");
  const datePart = spaceIdx > 0 ? full.slice(0, spaceIdx) : full;
  const timePart = spaceIdx > 0 ? full.slice(spaceIdx + 1) : "";
  return (
    <span className="jp-lesson-dt">
      <span className="jp-lesson-dt-full jp-lesson-dt-stacked">
        <span className="jp-lesson-dt-date">{datePart}</span>
        {timePart ? <span className="jp-lesson-dt-time">{timePart}</span> : null}
      </span>
      <span className="jp-lesson-dt-compact">{formatBeijingDateTimeCompact(iso)}</span>
    </span>
  );
}

export function renderNextClassLabel(classAt: string, progressStatus: EnLessonProgressStatus) {
  return (
    <span className="jp-lesson-next-class-dt">
      <span className="jp-lesson-next-class-dt-full">
        {formatNextClassAtLabel(classAt, progressStatus)}
      </span>
      <span className="jp-lesson-next-class-dt-compact">
        {formatNextClassAtLabelCompact(classAt, progressStatus)}
      </span>
    </span>
  );
}

export function renderClassDurationLabel(minutes: number | null | undefined) {
  const full = formatClassDurationLabel(minutes);
  const compact = formatClassDurationLabelCompact(minutes);
  if (!full || !compact) return null;
  return (
    <span className="jp-lesson-class-duration-dt">
      <span className="jp-lesson-class-duration-dt-full">{full}</span>
      <span className="jp-lesson-class-duration-dt-compact">{compact}</span>
    </span>
  );
}

export function formatLessonTeacherNames(
  lesson: EnLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? []).map(
    (id) => teacherNameById.get(id) || `#${id}`
  );
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.length ? names.join("、") : "—";
}

/** 复制「仅文字」用：无上课老师时返回空串，由复制模板留两个空格 */
export function formatLessonTeacherNamesForCopy(
  lesson: EnLessonRecord,
  teacherNameById: Map<number, string>
): string {
  const names = (lesson.teacher_ids ?? [])
    .map((id) => teacherNameById.get(id)?.trim() || "")
    .filter(Boolean);
  if (lesson.teacher_other?.trim()) {
    names.push(lesson.teacher_other.trim());
  }
  return names.join("、");
}

export function mergeEnLessonTeachers(
  primary: EnLessonTeacher[],
  updates: EnLessonTeacher[]
): EnLessonTeacher[] {
  const map = new Map(primary.map((teacher) => [teacher.id, teacher]));
  for (const teacher of updates) {
    map.set(teacher.id, teacher);
  }
  return [...map.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id
  );
}

