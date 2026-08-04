"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { filterImportSchedulesByTeacherName } from "@/lib/en-lesson-import-schedule";
import { resolveManualScheduleDurationMinutes } from "@/lib/jp-lesson-manual-schedule";
import type { JpLessonManualSchedule } from "@/lib/jp-lesson-manual-schedule";
import type { EnLessonTeacher } from "@/lib/types";

function formatManualClassAtLabel(classAt: string): string {
  const trimmed = classAt.trim();
  // 存库已是北京时间 YYYY-MM-DD HH:mm:ss，勿再当 UTC 转一次
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return trimmed;
}

type Props = {
  open: boolean;
  lessonId: number | null;
  candidates: JpLessonManualSchedule[];
  teachers: EnLessonTeacher[];
  loading: boolean;
  importing: boolean;
  progressPercent: number | null;
  error: string;
  emptyHint: string | null;
  onClose: () => void;
  onImport: (manual: JpLessonManualSchedule) => void;
};

export function EnLessonImportScheduleModal({
  open,
  lessonId,
  candidates,
  teachers,
  loading,
  importing,
  progressPercent,
  error,
  emptyHint,
  onClose,
  onImport,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setTeacherFilter("");
      return;
    }
    return lockBodyScroll();
  }, [open]);

  const teacherOptions = useMemo(() => {
    const names = new Set<string>();
    for (const manual of candidates) {
      const name = (manual.teacher ?? "").trim();
      if (name) names.add(name);
    }
    for (const teacher of teachers) {
      const name = (teacher.name ?? "").trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "zh"));
  }, [candidates, teachers]);

  const filtered = useMemo(
    () => filterImportSchedulesByTeacherName(candidates, teacherFilter),
    [candidates, teacherFilter]
  );

  if (!open || !mounted || lessonId == null) return null;

  return createPortal(
    <div
      className="en-lesson-import-schedule-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!importing) closeModalOnBackdropMouseDown(event, onClose);
      }}
    >
      <div
        className="en-lesson-import-schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-lesson-import-schedule-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="en-lesson-import-schedule-header">
          <div>
            <h2 id="en-lesson-import-schedule-title">引入日程</h2>
            <p className="en-lesson-import-schedule-sub">
              仅显示英语手动日程（未上完）。引入后关联本教案，时间不同则追加。
            </p>
          </div>
          <button
            type="button"
            className="en-lesson-import-schedule-close"
            aria-label="关闭"
            disabled={importing}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label className="en-lesson-import-schedule-filter">
          <span>上课老师</span>
          <select
            value={teacherFilter}
            disabled={importing || loading}
            onChange={(e) => setTeacherFilter(e.target.value)}
          >
            <option value="">全部英语老师</option>
            {teacherOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className="en-lesson-import-schedule-error" role="alert">
            {error}
          </p>
        ) : null}

        {progressPercent != null ? (
          <div className="en-lesson-import-schedule-progress">
            <JpVocabSaveProgressBar
              label={
                importing ? "正在引入日程，传输中…" : "排队同步中…"
              }
              percent={progressPercent}
              fullWidth
            />
          </div>
        ) : null}

        <div className="en-lesson-import-schedule-list" role="list">
          {loading ? (
            <p className="en-lesson-import-schedule-empty">加载日程中…</p>
          ) : filtered.length === 0 ? (
            <p className="en-lesson-import-schedule-empty">
              {emptyHint || "暂无未上完的英语手动日程"}
            </p>
          ) : (
            filtered.map((manual) => {
              const duration = resolveManualScheduleDurationMinutes(
                manual.title,
                manual.duration_minutes
              );
              return (
                <button
                  key={manual.id}
                  type="button"
                  role="listitem"
                  className="en-lesson-import-schedule-item"
                  disabled={importing}
                  onClick={() => onImport(manual)}
                >
                  <span className="en-lesson-import-schedule-item-title">
                    {manual.title.trim() || "（无标题）"}
                  </span>
                  <span className="en-lesson-import-schedule-item-meta">
                    {formatManualClassAtLabel(manual.class_at)} · {duration}{" "}
                    分钟
                    {manual.teacher.trim()
                      ? ` · ${manual.teacher.trim()}`
                      : ""}
                  </span>
                  {manual.note.trim() ? (
                    <span className="en-lesson-import-schedule-item-note">
                      {manual.note.trim()}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      <style jsx global>{`
        .en-lesson-import-schedule-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(0.75rem, env(safe-area-inset-top))
            max(0.75rem, env(safe-area-inset-right))
            max(0.75rem, env(safe-area-inset-bottom))
            max(0.75rem, env(safe-area-inset-left));
          background: rgba(0, 0, 0, 0.55);
        }
        .en-lesson-import-schedule-modal {
          width: min(32rem, 100%);
          max-height: min(88vh, 40rem);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem 1.1rem 1.1rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .en-lesson-import-schedule-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .en-lesson-import-schedule-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .en-lesson-import-schedule-sub {
          margin: 0.35rem 0 0;
          font-size: 0.82rem;
          color: var(--muted);
          line-height: 1.4;
        }
        .en-lesson-import-schedule-close {
          flex: 0 0 auto;
          width: 2rem;
          height: 2rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
        }
        .en-lesson-import-schedule-close:hover:not(:disabled) {
          color: var(--text);
          background: color-mix(in srgb, var(--border) 50%, transparent);
        }
        .en-lesson-import-schedule-filter {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.85rem;
        }
        .en-lesson-import-schedule-filter select {
          min-height: 2.4rem;
          padding: 0.4rem 0.55rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
        }
        .en-lesson-import-schedule-error {
          margin: 0;
          font-size: 0.85rem;
          color: #e85d6f;
        }
        .en-lesson-import-schedule-progress {
          width: 100%;
        }
        .en-lesson-import-schedule-list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          -webkit-overflow-scrolling: touch;
        }
        .en-lesson-import-schedule-empty {
          margin: 0.5rem 0;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .en-lesson-import-schedule-item {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
          width: 100%;
          padding: 0.7rem 0.8rem;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
          color: inherit;
          text-align: left;
          cursor: pointer;
          min-height: 2.75rem;
        }
        .en-lesson-import-schedule-item:hover:not(:disabled) {
          border-color: color-mix(in srgb, #5b9fd4 55%, var(--border));
          background: color-mix(in srgb, #5b9fd4 12%, var(--panel));
        }
        .en-lesson-import-schedule-item:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .en-lesson-import-schedule-item-title {
          font-weight: 600;
          font-size: 0.95rem;
        }
        .en-lesson-import-schedule-item-meta {
          font-size: 0.82rem;
          color: var(--muted);
        }
        .en-lesson-import-schedule-item-note {
          font-size: 0.8rem;
          color: var(--muted);
          line-height: 1.35;
        }
        @media (max-width: 767px) {
          .en-lesson-import-schedule-modal {
            max-height: min(92vh, 100%);
            border-radius: 14px;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
