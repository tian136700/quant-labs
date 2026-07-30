"use client";

import { useEffect, useMemo, useState } from "react";
import { JpLessonManualScheduleLessonPickModal } from "@/components/JpLessonManualScheduleLessonPickModal";
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
  /** 选中一本教材后：关联 + 同步到新课学习中（由父级处理进度条/错误） */
  onPickLesson: (option: ManualScheduleLessonOption) => void | Promise<void>;
  titleSubject: ScheduleTeacherSubjectFromTitle;
  jpLessons: JpLessonRecord[];
  enLessons: EnLessonRecord[];
  disabled?: boolean;
  /** 正在同步到新课时禁用再选 */
  syncing?: boolean;
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
    course_label: lesson.course_label,
    uploaded_at: lesson.uploaded_at || lesson.created_at || "",
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
      "选标题「日语」可从日语新课关联；选「英语」从英语新课关联。",
  };
}

export function JpLessonManualScheduleLessonPicker({
  value,
  onChange,
  onPickLesson,
  titleSubject,
  jpLessons,
  enLessons,
  disabled = false,
  syncing = false,
}: Props) {
  const [pickOpen, setPickOpen] = useState(false);

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

  useEffect(() => {
    if (disabled || syncing || titleSubject === "ko") {
      setPickOpen(false);
    }
  }, [disabled, syncing, titleSubject]);

  const canAddMore = value.length < MANUAL_SCHEDULE_LINKED_LESSONS_MAX;
  const busy = disabled || syncing;

  const removeAt = (index: number) => {
    if (busy) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const handlePick = (option: ManualScheduleLessonOption) => {
    if (!canAddMore || busy) return;
    const link: ManualScheduleLinkedLesson = {
      subject: option.subject,
      lesson_id: option.id,
    };
    if (selectedKeys.has(linkedLessonKey(link))) return;
    setPickOpen(false);
    void onPickLesson(option);
  };

  return (
    <div className="jp-lesson-manual-lesson-picker">
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
                course_label: null,
                uploaded_at: "",
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
                  disabled={busy}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canAddMore && titleSubject !== "ko" ? (
        <button
          type="button"
          className="jp-lesson-action-btn jp-lesson-manual-lesson-open"
          disabled={busy || options.length === 0}
          onClick={() => setPickOpen(true)}
        >
          {value.length ? "再选一本教材…" : "选择教材…"}
        </button>
      ) : null}

      {canAddMore && titleSubject === "ko" ? (
        <p className="jp-lesson-manual-lesson-hint">{emptyHint}</p>
      ) : null}

      {!canAddMore ? (
        <p className="jp-lesson-manual-lesson-limit-hint">已选满 2 本教材</p>
      ) : null}

      {!value.length && titleSubject !== "ko" && emptyHint && options.length === 0 ? (
        <p className="jp-lesson-manual-lesson-hint">{emptyHint}</p>
      ) : null}

      <JpLessonManualScheduleLessonPickModal
        open={pickOpen}
        options={options}
        selectedKeys={selectedKeys}
        emptyHint={emptyHint}
        fieldLabel={fieldLabel}
        disabled={busy}
        onClose={() => setPickOpen(false)}
        onPick={handlePick}
      />

      <style jsx>{`
        .jp-lesson-manual-lesson-picker {
          display: grid;
          gap: 0.45rem;
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

        .jp-lesson-manual-lesson-open {
          justify-self: start;
          min-height: 2.25rem;
        }

        .jp-lesson-manual-lesson-hint,
        .jp-lesson-manual-lesson-limit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
