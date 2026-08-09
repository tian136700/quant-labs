"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  EnLessonContentPreview,
  formatLessonTeacherNames,
  renderNextClassLabel,
} from "@/components/en-lesson-page/en-lesson-page-helpers";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatBeijingDateTimeCompact } from "@/lib/format-datetime";
import {
  defaultEnLessonScheduleLinkPickStatus,
  enLessonToManualScheduleOption,
  filterEnLessonsByLinkPickStatus,
  filterEnLessonsForScheduleLink,
  sortEnLessonsForScheduleLinkPick,
  type EnLessonScheduleLinkPickStatus,
} from "@/lib/en-lesson-schedule-link-pick";
import { getEnLessonProgressStatus, parseLessonContent } from "@/lib/en-lesson-shared";
import { shortEnVocabCategoryLabel } from "@/lib/en-vocab-category";
import { linkedLessonKey } from "@/lib/jp-lesson-manual-schedule-linked";
import type { ManualScheduleLessonOption } from "@/lib/jp-lesson-manual-schedule-linked";
import type { EnLessonRecord, EnLessonTeacher } from "@/lib/types";

const PICK_STATUS_TABS: {
  status: EnLessonScheduleLinkPickStatus;
  title: string;
}[] = [
  { status: "all", title: "全部" },
  { status: "pending", title: "未完成" },
  { status: "learning", title: "上课中" },
];

type Props = {
  open: boolean;
  lessons: EnLessonRecord[];
  teachers: EnLessonTeacher[];
  selectedKeys: Set<string>;
  emptyHint: string | null;
  fieldLabel: string;
  disabled?: boolean;
  syncing?: boolean;
  progressPercent?: number | null;
  onClose: () => void;
  onPick: (option: ManualScheduleLessonOption) => void;
};

function kindShort(kind: EnLessonRecord["kind"]): string {
  if (kind === "grammar") return "法";
  return "词";
}

function statusLabel(lesson: EnLessonRecord): string {
  const status = getEnLessonProgressStatus(lesson);
  if (status === "learning") return "上课中";
  if (status === "completed") return "上课完";
  return "未完成";
}

/**
 * 日程「关联教材」英语侧：弹窗内嵌迷你英语新课列表（未完成 / 上课中），点选即关联。
 */
export function EnLessonScheduleLinkPickModal({
  open,
  lessons,
  teachers,
  selectedKeys,
  emptyHint,
  fieldLabel,
  disabled = false,
  syncing = false,
  progressPercent = null,
  onClose,
  onPick,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] =
    useState<EnLessonScheduleLinkPickStatus>("all");
  const [query, setQuery] = useState("");
  const [expandedContentIds, setExpandedContentIds] = useState<
    Record<number, boolean>
  >({});

  const teacherNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [teachers]);

  const linkable = useMemo(
    () => filterEnLessonsForScheduleLink(lessons),
    [lessons]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setStatusFilter("all");
      setExpandedContentIds({});
      return;
    }
    setStatusFilter(
      defaultEnLessonScheduleLinkPickStatus(
        filterEnLessonsForScheduleLink(lessons)
      )
    );
    return lockBodyScroll();
    // 只在打开瞬间定默认 Tab；lessons 仅取打开当帧，勿列入 deps 以免刷新打回 Tab
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only reset
  }, [open]);

  const counts = useMemo(() => {
    const pending = filterEnLessonsByLinkPickStatus(linkable, "pending").length;
    const learning = filterEnLessonsByLinkPickStatus(linkable, "learning").length;
    return { all: pending + learning, pending, learning };
  }, [linkable]);

  const visible = useMemo(() => {
    const byStatus = filterEnLessonsByLinkPickStatus(linkable, statusFilter);
    const q = query.trim().toLowerCase();
    return sortEnLessonsForScheduleLinkPick(
      byStatus.filter((lesson) => {
        const key = linkedLessonKey({ subject: "en", lesson_id: lesson.id });
        if (selectedKeys.has(key)) return false;
        if (!q) return true;
        const haystack = [
          String(lesson.id),
          lesson.content,
          lesson.meanings || "",
          lesson.title || "",
          lesson.course_label || "",
          lesson.category || "",
          formatLessonTeacherNames(lesson, teacherNameById),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    );
  }, [linkable, statusFilter, query, selectedKeys, teacherNameById]);

  if (!open || !mounted) return null;

  const busy = disabled || syncing;

  return createPortal(
    <div
      className="en-lesson-schedule-link-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy) closeModalOnBackdropMouseDown(event, onClose);
      }}
    >
      <div
        className="en-lesson-schedule-link-modal jp-lesson-page jp-lesson-page--en"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-lesson-schedule-link-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="en-lesson-schedule-link-header">
          <div>
            <h2 id="en-lesson-schedule-link-title">选择英语教材</h2>
            <p className="en-lesson-schedule-link-sub">{fieldLabel}</p>
            <p className="en-lesson-schedule-link-hint">
              未完成与上课中都可选（已上课完不显示）。上课中会显示当前上课老师，方便分辨是哪本教材。
            </p>
          </div>
          <button
            type="button"
            className="en-lesson-schedule-link-close"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div
          className="jp-lesson-mobile-status-filter en-lesson-schedule-link-tabs"
          role="tablist"
          aria-label="教材状态"
        >
          {PICK_STATUS_TABS.map(({ status, title }) => {
            const active = statusFilter === status;
            const count = counts[status];
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={active}
                className={`jp-lesson-mobile-status-tab jp-lesson-mobile-status-tab--${status}${
                  active ? " is-active" : ""
                }`}
                disabled={busy}
                onClick={() => setStatusFilter(status)}
              >
                <span className="jp-lesson-mobile-status-tab-label">{title}</span>
                <span className="jp-lesson-mobile-status-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        <input
          type="search"
          className="en-lesson-schedule-link-search"
          value={query}
          disabled={busy}
          placeholder="搜索 ID、学习内容、分类、老师…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索英语教材"
          autoComplete="off"
        />

        {syncing && progressPercent != null ? (
          <JpVocabSaveProgressBar
            label="正在关联教材，传输中…"
            percent={progressPercent}
            fullWidth
          />
        ) : null}

        <div className="en-lesson-schedule-link-table-wrap jp-lesson-table-wrap">
          {visible.length === 0 ? (
            <p className="en-lesson-schedule-link-empty">
              {emptyHint ||
                (linkable.length === 0
                  ? "暂无未完成或上课中的英语新课"
                  : "当前状态下没有可关联的教材")}
            </p>
          ) : (
            <table className="compare-table etr-table jp-lesson-table en-lesson-schedule-link-table">
              <thead>
                <tr>
                  <th className="jp-lesson-id-col">ID</th>
                  <th className="jp-lesson-kind-col">类</th>
                  <th className="en-lesson-category-col">分类</th>
                  <th className="jp-lesson-content-col">学习内容</th>
                  <th className="jp-lesson-content-count-col">数</th>
                  <th className="jp-lesson-uploaded-col">上传日期</th>
                  <th className="jp-lesson-teacher-col">上课老师</th>
                  <th className="jp-lesson-next-class-col">上课时间</th>
                  <th className="jp-lesson-complete-col">状态</th>
                  <th className="jp-lesson-actions-col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((lesson) => {
                  const count = parseLessonContent(lesson.content).length;
                  const progress = getEnLessonProgressStatus(lesson);
                  const schedules = lesson.class_schedules ?? [];
                  const primaryAt =
                    schedules[0]?.class_at ?? lesson.next_class_at ?? "";
                  const teacherLabel = formatLessonTeacherNames(
                    lesson,
                    teacherNameById
                  );
                  const isLearning = progress === "learning";
                  const teacherDisplay =
                    isLearning && teacherLabel === "—"
                      ? "未指定老师"
                      : teacherLabel;
                  return (
                    <tr
                      key={lesson.id}
                      className={
                        isLearning
                          ? "en-lesson-schedule-link-row--learning"
                          : undefined
                      }
                    >
                      <td className="jp-lesson-id-col">{lesson.id}</td>
                      <td className="jp-lesson-kind-col">{kindShort(lesson.kind)}</td>
                      <td
                        className="en-lesson-category-col"
                        title={lesson.category || undefined}
                      >
                        {shortEnVocabCategoryLabel(lesson.category)}
                      </td>
                      <td className="jp-lesson-content-col">
                        <EnLessonContentPreview
                          content={lesson.content}
                          expanded={Boolean(expandedContentIds[lesson.id])}
                          onToggle={() =>
                            setExpandedContentIds((prev) => ({
                              ...prev,
                              [lesson.id]: !prev[lesson.id],
                            }))
                          }
                        />
                        {lesson.meanings?.trim() ? (
                          <p className="en-lesson-schedule-link-meanings">
                            {lesson.meanings.trim()}
                          </p>
                        ) : null}
                      </td>
                      <td className="jp-lesson-content-count-col">{count}</td>
                      <td className="jp-lesson-uploaded-col">
                        {formatBeijingDateTimeCompact(
                          lesson.uploaded_at || lesson.created_at || ""
                        ) || "—"}
                      </td>
                      <td
                        className={`jp-lesson-teacher-col${
                          isLearning
                            ? " en-lesson-schedule-link-teacher--learning"
                            : ""
                        }`}
                        title={
                          isLearning
                            ? `当前上课老师：${teacherDisplay}`
                            : teacherDisplay === "—"
                              ? undefined
                              : teacherDisplay
                        }
                      >
                        {isLearning ? (
                          <strong className="en-lesson-schedule-link-teacher-name">
                            {teacherDisplay}
                          </strong>
                        ) : (
                          teacherDisplay
                        )}
                      </td>
                      <td className="jp-lesson-next-class-col">
                        {primaryAt
                          ? renderNextClassLabel(primaryAt, progress)
                          : "未定义"}
                      </td>
                      <td className="jp-lesson-complete-col">
                        {statusLabel(lesson)}
                      </td>
                      <td className="jp-lesson-actions-col">
                        <button
                          type="button"
                          className="jp-lesson-action-btn"
                          disabled={busy}
                          onClick={() =>
                            onPick(enLessonToManualScheduleOption(lesson))
                          }
                        >
                          选择
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="en-lesson-schedule-link-footer">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>

      <style jsx global>{`
        .en-lesson-schedule-link-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(0.5rem, env(safe-area-inset-top))
            max(0.5rem, env(safe-area-inset-right))
            max(0.5rem, env(safe-area-inset-bottom))
            max(0.5rem, env(safe-area-inset-left));
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }
        .en-lesson-schedule-link-modal {
          width: min(96vw, 72rem);
          max-height: min(94vh, 52rem);
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          padding: 0.9rem 1rem 1rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          box-shadow: 0 18px 56px rgba(0, 0, 0, 0.45);
          box-sizing: border-box;
        }
        .en-lesson-schedule-link-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          flex: 0 0 auto;
        }
        .en-lesson-schedule-link-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .en-lesson-schedule-link-sub,
        .en-lesson-schedule-link-hint {
          margin: 0.3rem 0 0;
          font-size: 0.82rem;
          color: var(--muted);
          line-height: 1.4;
        }
        .en-lesson-schedule-link-close {
          width: 2rem;
          height: 2rem;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-size: 1.35rem;
          cursor: pointer;
        }
        .en-lesson-schedule-link-tabs {
          flex: 0 0 auto;
        }
        .en-lesson-schedule-link-tabs .jp-lesson-mobile-status-tab--all.is-active {
          background: rgba(142, 197, 255, 0.18);
          border-color: rgba(142, 197, 255, 0.45);
          color: #8ec5ff;
        }
        .en-lesson-schedule-link-search {
          width: 100%;
          min-height: 2.4rem;
          padding: 0.45rem 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          box-sizing: border-box;
        }
        .en-lesson-schedule-link-table-wrap {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--panel);
        }
        .en-lesson-schedule-link-table {
          width: 100%;
          table-layout: fixed;
        }
        .en-lesson-schedule-link-empty {
          margin: 1.25rem 1rem;
          color: var(--muted);
          font-size: 0.9rem;
        }
        .en-lesson-schedule-link-meanings {
          margin: 0.35rem 0 0;
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .en-lesson-schedule-link-row--learning .jp-lesson-complete-col {
          color: #f0a35a;
          font-weight: 600;
        }
        .en-lesson-schedule-link-teacher--learning {
          color: var(--text);
        }
        .en-lesson-schedule-link-teacher-name {
          font-weight: 700;
          color: #8ec5ff;
          word-break: break-word;
        }
        .en-lesson-schedule-link-footer {
          display: flex;
          justify-content: flex-end;
          flex: 0 0 auto;
        }
        @media (max-width: 767px) {
          .en-lesson-schedule-link-modal {
            width: 100%;
            max-height: 96vh;
            border-radius: 14px;
          }
          .en-lesson-schedule-link-table {
            min-width: 40rem;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
