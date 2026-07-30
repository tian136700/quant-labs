"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatManualScheduleLessonOptionLabel,
  linkedLessonKey,
  MANUAL_SCHEDULE_LINKED_LESSONS_MAX,
  sortManualScheduleLessonOptions,
  type ManualScheduleLinkedLesson,
  type ManualScheduleLinkedLessonSubject,
  type ManualScheduleLessonOption,
} from "@/lib/jp-lesson-manual-schedule-linked";
import type { ScheduleTeacherSubjectFromTitle } from "@/lib/jp-lesson-teacher-rate";
import type { EnLessonRecord, JpLessonRecord } from "@/lib/types";

type Props = {
  value: ManualScheduleLinkedLesson[];
  onChange: (links: ManualScheduleLinkedLesson[]) => void;
  titleSubject: ScheduleTeacherSubjectFromTitle;
  jpLessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  disabled?: boolean;
};

function toOptions(
  subject: ManualScheduleLinkedLessonSubject,
  lessons: Array<JpLessonRecord | EnLessonRecord>
): ManualScheduleLessonOption[] {
  return lessons.map((lesson) => ({
    subject,
    id: lesson.id,
    kind:
      lesson.kind === "grammar"
        ? "grammar"
        : lesson.kind === "word_grammar"
          ? "word_grammar"
          : "word",
    content: lesson.content,
    title: lesson.title,
    completed: lesson.completed,
    learning: lesson.learning,
  }));
}

function resolveOptionsForSubject(
  titleSubject: ScheduleTeacherSubjectFromTitle,
  jpLessons: JpLessonRecord[],
  enLessons: EnLessonRecord[]
): {
  options: ManualScheduleLessonOption[];
  fieldLabel: string;
  emptyHint: string | null;
} {
  if (titleSubject === "ko") {
    return {
      options: [],
      fieldLabel: "教材（可选 · 韩语暂无新课列表）",
      emptyHint: "韩语暂无对应新课教材可关联，可留空。",
    };
  }
  if (titleSubject === "jp") {
    return {
      options: sortManualScheduleLessonOptions(toOptions("jp", jpLessons)),
      fieldLabel: "教材（可选，最多 2 个 · 日语新课）",
      emptyHint: jpLessons.length ? null : "日语新课列表为空，请先在「日语新课」上传教材。",
    };
  }
  if (titleSubject === "en") {
    return {
      options: sortManualScheduleLessonOptions(toOptions("en", enLessons)),
      fieldLabel: "教材（可选，最多 2 个 · 英语新课）",
      emptyHint: enLessons.length ? null : "英语新课列表为空，请先在「英语新课」上传教材。",
    };
  }
  return {
    options: sortManualScheduleLessonOptions([
      ...toOptions("jp", jpLessons),
      ...toOptions("en", enLessons),
    ]),
    fieldLabel: "教材（可选，最多 2 个）",
    emptyHint:
      "选标题「日语」可从日语新课关联；选「英语」从英语新课关联。也可先搜全部教材。",
  };
}

export function JpLessonManualScheduleLessonPicker({
  value,
  onChange,
  titleSubject,
  jpLessons,
  enLessons,
  disabled = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { options, fieldLabel, emptyHint } = useMemo(
    () => resolveOptionsForSubject(titleSubject, jpLessons, enLessons),
    [titleSubject, jpLessons, enLessons]
  );

  const optionByKey = useMemo(() => {
    const map = new Map<string, ManualScheduleLessonOption>();
    for (const option of options) {
      map.set(linkedLessonKey({ subject: option.subject, lesson_id: option.id }), option);
    }
    return map;
  }, [options]);

  const selectedKeys = useMemo(
    () => new Set(value.map((link) => linkedLessonKey(link))),
    [value]
  );

  // 标题科目切换后，去掉不再属于当前来源的关联
  useEffect(() => {
    if (titleSubject === "ko") {
      if (value.length > 0) onChange([]);
      return;
    }
    if (titleSubject !== "jp" && titleSubject !== "en") return;
    const next = value.filter((link) => link.subject === titleSubject);
    if (next.length === value.length) return;
    onChange(next);
  }, [titleSubject, value, onChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((option) => {
      const key = linkedLessonKey({
        subject: option.subject,
        lesson_id: option.id,
      });
      if (selectedKeys.has(key)) return false;
      if (!q) return true;
      const label = formatManualScheduleLessonOptionLabel(option).toLowerCase();
      return (
        label.includes(q) ||
        String(option.id).includes(q) ||
        option.content.toLowerCase().includes(q) ||
        (option.title || "").toLowerCase().includes(q)
      );
    });
  }, [options, query, selectedKeys]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const canAddMore = value.length < MANUAL_SCHEDULE_LINKED_LESSONS_MAX;

  const addLesson = (option: ManualScheduleLessonOption) => {
    if (!canAddMore || disabled) return;
    const link: ManualScheduleLinkedLesson = {
      subject: option.subject,
      lesson_id: option.id,
    };
    if (selectedKeys.has(linkedLessonKey(link))) return;
    onChange([...value, link]);
    setQuery("");
    setOpen(false);
  };

  const removeAt = (index: number) => {
    if (disabled) return;
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="jp-lesson-manual-lesson-picker" ref={rootRef}>
      <span className="jp-lesson-manual-lesson-picker-label">{fieldLabel}</span>

      {value.length > 0 ? (
        <ul className="jp-lesson-manual-lesson-chips" aria-label="已关联教材">
          {value.map((link, index) => {
            const option =
              optionByKey.get(linkedLessonKey(link)) ??
              ({
                subject: link.subject,
                id: link.lesson_id,
                kind: "word" as const,
                content: "",
                title: null,
                completed: false,
              } satisfies ManualScheduleLessonOption);
            return (
              <li key={linkedLessonKey(link)} className="jp-lesson-manual-lesson-chip">
                <span className="jp-lesson-manual-lesson-chip-text">
                  {formatManualScheduleLessonOptionLabel(option)}
                </span>
                <button
                  type="button"
                  className="jp-lesson-manual-lesson-chip-clear"
                  aria-label="移除教材"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canAddMore ? (
        <div className="jp-lesson-manual-lesson-add-row">
          <input
            type="search"
            className="jp-lesson-next-class-input jp-lesson-manual-lesson-search"
            value={query}
            disabled={disabled || titleSubject === "ko"}
            placeholder={
              titleSubject === "ko"
                ? "韩语暂无教材可关联"
                : value.length
                  ? "再选一本教材…"
                  : "搜索并添加教材…"
            }
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            aria-label="搜索教材"
            autoComplete="off"
          />
        </div>
      ) : (
        <p className="jp-lesson-manual-lesson-limit-hint">已选满 2 本教材</p>
      )}

      {open && canAddMore && titleSubject !== "ko" ? (
        <ul className="jp-lesson-manual-lesson-dropdown" role="listbox">
          {filtered.length === 0 ? (
            <li className="jp-lesson-manual-lesson-dropdown-empty">
              {emptyHint || "没有匹配的教材"}
            </li>
          ) : (
            filtered.slice(0, 40).map((option) => (
              <li key={linkedLessonKey({ subject: option.subject, lesson_id: option.id })}>
                <button
                  type="button"
                  className="jp-lesson-manual-lesson-option"
                  disabled={disabled}
                  onClick={() => addLesson(option)}
                >
                  {formatManualScheduleLessonOptionLabel(option)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {!value.length && emptyHint && titleSubject === "ko" ? (
        <p className="jp-lesson-manual-lesson-hint">{emptyHint}</p>
      ) : null}
      {!value.length && !open && titleSubject !== "ko" && emptyHint && options.length === 0 ? (
        <p className="jp-lesson-manual-lesson-hint">{emptyHint}</p>
      ) : null}

      <style jsx>{`
        .jp-lesson-manual-lesson-picker {
          display: grid;
          gap: 0.45rem;
          position: relative;
        }

        .jp-lesson-manual-lesson-picker-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-manual-lesson-chips {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.4rem;
        }

        .jp-lesson-manual-lesson-chip {
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          padding: 0.45rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .jp-lesson-manual-lesson-chip-text {
          flex: 1;
          min-width: 0;
          font-size: 0.8125rem;
          line-height: 1.4;
          word-break: break-word;
        }

        .jp-lesson-manual-lesson-chip-clear {
          flex-shrink: 0;
          width: 1.75rem;
          height: 1.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-lesson-manual-lesson-add-row {
          display: grid;
        }

        .jp-lesson-manual-lesson-search {
          width: 100%;
          box-sizing: border-box;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-manual-lesson-dropdown {
          list-style: none;
          margin: 0;
          padding: 0.25rem;
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 0.2rem);
          z-index: 20;
          max-height: 14rem;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        }

        .jp-lesson-manual-lesson-option {
          display: block;
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          color: inherit;
          padding: 0.55rem 0.6rem;
          border-radius: 6px;
          font-size: 0.8125rem;
          line-height: 1.4;
          cursor: pointer;
        }

        .jp-lesson-manual-lesson-option:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }

        .jp-lesson-manual-lesson-dropdown-empty,
        .jp-lesson-manual-lesson-hint,
        .jp-lesson-manual-lesson-limit-hint {
          margin: 0;
          padding: 0.5rem 0.55rem;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-lesson-manual-lesson-limit-hint {
          padding: 0;
        }
      `}</style>
    </div>
  );
}
