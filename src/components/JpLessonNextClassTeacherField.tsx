"use client";

import { useMemo } from "react";
import {
  formatTeacherDisplayLabel,
  sortJpLessonTeachersByLessonCount,
} from "@/lib/jp-lesson-teacher-rate";
import { filterLessonTeachersBySearch } from "@/lib/lesson-teacher-search";
import type { JpLessonTeacher } from "@/lib/types";

type Props = {
  teachers: JpLessonTeacher[];
  selectedIds: number[];
  query: string;
  disabled?: boolean;
  durationHint?: string | null;
  onQueryChange: (query: string) => void;
  onToggle: (teacherId: number) => void;
  onManageTeachers?: () => void;
};

/**
 * 「设置上课时间」内联选老师：排序与「设置上课老师」一致（上课频次高的靠前）。
 */
export function JpLessonNextClassTeacherField({
  teachers,
  selectedIds,
  query,
  disabled = false,
  durationHint = null,
  onQueryChange,
  onToggle,
  onManageTeachers,
}: Props) {
  const sortedTeachers = useMemo(
    () => sortJpLessonTeachersByLessonCount(teachers),
    [teachers]
  );

  const filteredTeachers = useMemo(
    () => filterLessonTeachersBySearch(sortedTeachers, query),
    [sortedTeachers, query]
  );

  return (
    <fieldset className="jp-lesson-next-class-teacher-field" disabled={disabled}>
      <legend>上课老师（可多选，上课多的靠前）</legend>
      <input
        type="text"
        className="jp-lesson-next-class-teacher-search"
        value={query}
        placeholder="模糊搜索老师、上课频次、课时费或时长"
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="搜索上课老师"
      />
      <div className="jp-lesson-next-class-teacher-options" role="group" aria-label="上课老师列表">
        {filteredTeachers.map((teacher) => (
          <label key={teacher.id} className="jp-lesson-next-class-teacher-option">
            <input
              type="checkbox"
              checked={selectedIds.includes(teacher.id)}
              onChange={() => onToggle(teacher.id)}
            />
            <span>
              {formatTeacherDisplayLabel(
                teacher.name,
                teacher.hourly_rate,
                teacher.lesson_minutes
              )}
            </span>
          </label>
        ))}
        {!filteredTeachers.length ? (
          <p className="jp-lesson-next-class-teacher-empty">没有匹配的老师</p>
        ) : null}
      </div>
      {durationHint ? (
        <p className="jp-lesson-next-class-teacher-duration-hint">{durationHint}</p>
      ) : null}
      {onManageTeachers ? (
        <button
          type="button"
          className="jp-lesson-next-class-teacher-manage"
          disabled={disabled}
          onClick={onManageTeachers}
        >
          管理老师（改课时费 / 新增）…
        </button>
      ) : null}
      <style jsx>{`
        .jp-lesson-next-class-teacher-field {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
          min-width: 0;
        }

        .jp-lesson-next-class-teacher-field legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.45rem;
        }

        .jp-lesson-next-class-teacher-search {
          width: 100%;
          box-sizing: border-box;
          min-height: 2.2rem;
          padding: 0.45rem 0.6rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-next-class-teacher-options {
          display: grid;
          gap: 0.35rem;
          max-height: 10rem;
          overflow-x: hidden;
          overflow-y: auto;
          margin-top: 0.45rem;
          padding: 0.55rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 22%, var(--panel));
        }

        .jp-lesson-next-class-teacher-option {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.875rem;
          line-height: 1.35;
          cursor: pointer;
        }

        .jp-lesson-next-class-teacher-option input {
          margin-top: 0.15rem;
          flex-shrink: 0;
        }

        .jp-lesson-next-class-teacher-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.8125rem;
        }

        .jp-lesson-next-class-teacher-duration-hint {
          margin: 0.4rem 0 0;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--muted);
        }

        .jp-lesson-next-class-teacher-manage {
          margin-top: 0.45rem;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--accent);
          font-size: 0.8125rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .jp-lesson-next-class-teacher-manage:hover:not(:disabled) {
          opacity: 0.85;
        }

        .jp-lesson-next-class-teacher-manage:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </fieldset>
  );
}
