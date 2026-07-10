"use client";

import { resolveTeacherLessonDisplayParts } from "@/lib/jp-lesson-teacher-rate";
import type { JpLessonRecord, JpLessonTeacher } from "@/lib/types";

type Props = {
  lesson: JpLessonRecord;
  teachersById: Map<number, JpLessonTeacher>;
  locale?: "zh" | "en";
  /** 若提供，老师名称将链到上课老师管理页并定位到该条目 */
  teacherHref?: (teacherId: number) => string;
};

export function JpLessonTeacherDisplay({
  lesson,
  teachersById,
  locale = "zh",
  teacherHref,
}: Props) {
  const entries: { key: string | number; name: string; priceDuration: string | null }[] = [];

  for (const id of lesson.teacher_ids ?? []) {
    const teacher = teachersById.get(id);
    if (!teacher) {
      entries.push({ key: id, name: `#${id}`, priceDuration: null });
      continue;
    }
    const parts = resolveTeacherLessonDisplayParts(teacher, locale);
    entries.push({ key: id, ...parts });
  }

  const other = lesson.teacher_other?.trim();
  if (other) {
    entries.push({ key: "other", name: other, priceDuration: null });
  }

  if (!entries.length) {
    return <>—</>;
  }

  return (
    <div className="jp-lesson-teacher-lines">
      {entries.map((entry) => {
        const href =
          typeof entry.key === "number" && teacherHref ? teacherHref(entry.key) : null;
        return (
          <div key={entry.key} className="jp-lesson-teacher-entry">
            {href ? (
              <a href={href} className="jp-lesson-teacher-name jp-lesson-teacher-name--link">
                {entry.name}
              </a>
            ) : (
              <span className="jp-lesson-teacher-name">{entry.name}</span>
            )}
            {entry.priceDuration ? (
              <span className="jp-lesson-teacher-rate">{entry.priceDuration}</span>
            ) : null}
          </div>
        );
      })}

      <style jsx>{`
        .jp-lesson-teacher-lines {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          line-height: 1.35;
          min-width: 0;
        }
        .jp-lesson-teacher-entry {
          display: flex;
          flex-wrap: wrap;
          flex-direction: column;
          gap: 0.08rem;
          max-width: 100%;
        }
        .jp-lesson-teacher-name {
          font-weight: 500;
        }
        .jp-lesson-teacher-name--link {
          color: var(--accent);
          text-decoration: none;
        }
        .jp-lesson-teacher-name--link:hover {
          text-decoration: underline;
        }
        .jp-lesson-teacher-rate {
          color: var(--muted);
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          white-space: normal;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}
