"use client";

import { type ReactNode } from "react";
import { formatBeijingDateTime, formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  JP_LESSON_CACHE_KEY,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  buildJpLessonDisplayGroups,
  buildJpLessonDisplayGroupsByRecentOperation,
  formatClassDurationLabel,
  formatClassDurationLabelCompact,
  formatLessonContentLines,
  formatLessonExampleSentencesSummary,
  formatLessonMeaningsLines,
  formatNextClassAtLabel,
  formatNextClassAtLabelCompact,
  parseLessonContent,
  type JpLessonDisplayGroup,
  type JpLessonClassTimeSortOrder,
  type JpLessonRecentOperationSortOrder,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import {
  alignLessonItemAnnotations,
  formatLessonAnnotationsLines,
  JP_VOCAB_ANNOTATION_LABEL,
} from "@/lib/jp-vocab-annotation";
import {
  readClientCache,
  writeClientCache,
} from "@/lib/client-swr-cache";
import { normalizeJpLessonTeacher } from "@/lib/jp-lesson-teacher-rate";
import {
  jpLessonRefDownloadFilename,
  jpVocabRefViewerPath,
} from "@/lib/jp-vocab-ref-shared";
import type {
  JpLessonNote,
  JpLessonRecord,
  JpLessonTeacher,
  JpVocabRef,
} from "@/lib/types";

export function readLessonCache(): JpLessonApiPayload | null {
  const cached = readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
  if (!cached) return null;
  if (!Array.isArray(cached.teachers)) return cached;
  return {
    ...cached,
    teachers: cached.teachers.map((teacher) => normalizeJpLessonTeacher(teacher)),
  };
}

export function persistLessonCache(
  lessons: JpLessonRecord[],
  refs: Record<string, JpVocabRef>,
  notes: JpLessonNote[],
  teachers?: JpLessonTeacher[]
) {
  writeClientCache(JP_LESSON_CACHE_KEY, { lessons, refs, notes, teachers });
}

export function refViewUrl(refKey: string, updatedAt?: string | null): string {
  return jpVocabRefViewerPath(refKey, updatedAt);
}

export const LESSON_STATUS_SECTIONS: {
  status: JpLessonProgressStatus;
  title: string;
  emptyHint: string;
}[] = [
  { status: "learning", title: "学习中", emptyHint: "暂无学习中的新课" },
  { status: "pending", title: "未完成", emptyHint: "暂无未完成的新课" },
  { status: "completed", title: "已完成", emptyHint: "暂无已完成的新课" },
];

/** 日语新课第四个快捷 Tab：开课前/后各 10 分钟窗口（北京时间） */
export const JP_LESSON_IN_CLASS_SECTION = {
  key: "in_class" as const,
  title: "上课中",
  emptyHint: "当前没有开课前/后 10 分钟窗口内的新课",
};

/** API：学习中 + 开课 18h 内自动启用老师账号的回包摘要 */
export type TeacherAutoEnableInfo = {
  triggered?: boolean;
  enabled?: Array<{ username: string }>;
};

export function teacherAutoEnableStatusSuffix(
  info?: TeacherAutoEnableInfo | null
): string {
  const names = (info?.enabled ?? [])
    .map((row) => String(row.username ?? "").trim())
    .filter(Boolean);
  if (!names.length) return "";
  return `；已自动开启账号：${[...new Set(names)].join("、")}`;
}

export type JpLessonSortField = "classTime" | "recentOperation";

export type JpLessonSectionSort = {
  field: JpLessonSortField;
  order: JpLessonClassTimeSortOrder | JpLessonRecentOperationSortOrder;
};

export const DEFAULT_JP_LESSON_SECTION_SORT: Record<JpLessonProgressStatus, JpLessonSectionSort> = {
  learning: { field: "classTime", order: "asc" },
  // 未完成固定按 ID 升序（见 displayGroupsByStatus）；此处仅占位，表头排序按钮对 pending 无效
  pending: { field: "classTime", order: "asc" },
  completed: { field: "recentOperation", order: "desc" },
};

export function groupLessonsForDisplay(
  lessons: JpLessonRecord[],
  sort: JpLessonSectionSort
): JpLessonDisplayGroup<JpLessonRecord>[] {
  if (sort.field === "recentOperation") {
    return buildJpLessonDisplayGroupsByRecentOperation(
      lessons,
      sort.order as JpLessonRecentOperationSortOrder
    );
  }
  return buildJpLessonDisplayGroups(lessons, sort.order as JpLessonClassTimeSortOrder);
}

export function refFilename(lesson: JpLessonRecord, ref?: JpVocabRef): string {
  const mediaType = ref?.media_type === "pdf" ? "pdf" : "image";
  return jpLessonRefDownloadFilename(lesson, mediaType);
}

export function formatLessonContentOneLine(raw: string): string {
  const items = parseLessonContent(raw);
  if (!items.length) return raw.trim() || "—";
  return items.join("、");
}

const JP_LESSON_CONTENT_PREVIEW_LINES = 2;
/** 折叠时最多展示的词/语法条数（约两行 × 每行 3 个） */
const JP_LESSON_CONTENT_PREVIEW_ITEMS = 6;

export function JpLessonContentPreview({
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
    lines.length > JP_LESSON_CONTENT_PREVIEW_LINES ||
    items.length > JP_LESSON_CONTENT_PREVIEW_ITEMS;
  const shown =
    !expanded && needsMore ? lines.slice(0, JP_LESSON_CONTENT_PREVIEW_LINES) : lines;

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

export function JpLessonMeaningsPreview({
  content,
  meanings,
  expanded,
  onToggle,
}: {
  content: string;
  meanings: string | null | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lines = formatLessonMeaningsLines(content, meanings);
  const empty = !lines.length || lines.every((line) => line === "—");
  if (empty) {
    return <span className="jp-lesson-examples-empty">—</span>;
  }

  const needsMore = lines.length > JP_LESSON_CONTENT_PREVIEW_LINES;
  const shown =
    !expanded && needsMore ? lines.slice(0, JP_LESSON_CONTENT_PREVIEW_LINES) : lines;

  return (
    <div
      className={`jp-lesson-content-preview${expanded ? " is-expanded" : ""}${
        needsMore && !expanded ? " is-clamped" : ""
      }`}
    >
      <div className="jp-lesson-meanings-lines jp-lesson-meanings-desktop">
        {shown.map((line, lineIdx) => (
          <span key={lineIdx} className="jp-lesson-meanings-line">
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

/** 新课列表：备注级次要信息——口语/考试标注 */
export function JpLessonAnnotationsPreview({
  content,
  annotations,
}: {
  content: string;
  annotations: string | null | undefined;
}) {
  const lines = formatLessonAnnotationsLines(content, annotations);
  if (!lines.length) {
    return <span className="jp-lesson-examples-empty">—</span>;
  }
  return (
    <div className="jp-lesson-annotations-preview" aria-label={JP_VOCAB_ANNOTATION_LABEL}>
      <div className="jp-lesson-annotations-lines">
        {lines.map((line, lineIdx) => (
          <span key={lineIdx} className="jp-lesson-annotations-line">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

export function jpLessonItemAnnotation(
  content: string,
  annotations: string | null | undefined,
  index: number
): string | null {
  return alignLessonItemAnnotations(content, annotations)[index] ?? null;
}

export function lessonHasExamples(
  content: string,
  examples: string | null | undefined
): boolean {
  return formatLessonExampleSentencesSummary(content, examples) !== "—";
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

export function renderNextClassLabel(classAt: string, progressStatus: JpLessonProgressStatus) {
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

export function buildTeacherById(teachers: JpLessonTeacher[]): Map<number, JpLessonTeacher> {
  const map = new Map<number, JpLessonTeacher>();
  for (const teacher of teachers) {
    map.set(teacher.id, teacher);
  }
  return map;
}

export type JpLessonMobileIconName =
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

export function JpLessonMobileIcon({
  name,
  className = "",
}: {
  name: JpLessonMobileIconName;
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

export function JpLessonMobileFieldValue({
  icon,
  children,
}: {
  icon: JpLessonMobileIconName;
  children: ReactNode;
}) {
  return (
    <div className="jp-lesson-mobile-field-value">
      <JpLessonMobileIcon name={icon} />
      <span className="jp-lesson-mobile-field-text">{children}</span>
    </div>
  );
}
