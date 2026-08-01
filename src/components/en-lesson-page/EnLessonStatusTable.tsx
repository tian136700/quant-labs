"use client";

import { type ReactNode } from "react";
import { EnEditIconButton } from "@/components/EnEditIconButton";
import { EnLessonCopyMenu } from "@/components/EnLessonCopyMenu";
import { EnVocabRefDownloadMenu } from "@/components/EnVocabRefDownloadMenu";
import {
  EnLessonContentPreview,
  EnLessonMobileFieldValue,
  EnLessonMobileIcon,
  formatLessonTeacherNames,
  formatLessonTeacherNamesForCopy,
  refFilename,
  refViewUrl,
  renderClassDurationLabel,
  renderLessonDateTime,
  renderNextClassLabel,
} from "@/components/en-lesson-page/en-lesson-page-helpers";
import {
  getEnLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  parseLessonContent,
  type EnLessonClassTimeSortOrder,
  type EnLessonDisplayGroup,
  type EnLessonProgressStatus,
} from "@/lib/en-lesson-shared";
import { SITE_URL } from "@/lib/site";
import { displayEnVocabCategory, shortEnVocabCategoryLabel } from "@/lib/en-vocab-category";
import { enVocabRefApiPath } from "@/lib/en-vocab-ref-shared";
import type { EnLessonRecord, EnLessonTeacher, EnVocabRef } from "@/lib/types";
import {
  normalizeTencentMeetingId,
  resolveEnLessonMeetingIdForCopy,
} from "@/lib/en-lesson-tencent-meeting";
import { copyTextToClipboard } from "@/lib/copy-text";

export type EnLessonStatusTableProps = {
  displayGroups: EnLessonDisplayGroup<EnLessonRecord>[];
  dayToneByDate?: Map<string, number>;
  classTimeSortOrder: EnLessonClassTimeSortOrder;
  isAdmin: boolean;
  canOperate: boolean;
  refs: Record<string, EnVocabRef>;
  teachers: EnLessonTeacher[];
  teacherNameById: Map<number, string>;
  savingTeacherId: number | null;
  noteCountByLesson: Map<number, number>;
  expandedContentIds: Record<number, boolean>;
  deletingId: number | null;
  savingId: number | null;
  savingNextClassId: number | null;
  copiedId: number | null;
  onToggleClassTimeSort: () => void;
  onToggleContentExpanded: (lessonId: number) => void;
  onSetLessonProgress: (lessonId: number, status: EnLessonProgressStatus) => void | Promise<void>;
  onEditLesson: (lesson: EnLessonRecord) => void;
  onAnnotateLesson: (payload: {
    lesson: EnLessonRecord;
    ref: EnVocabRef;
    imageUrl: string;
    mediaType?: "image" | "pdf";
  }) => void;
  onOpenTeacherEdit: (lesson: EnLessonRecord) => void;
  onOpenNextClassEdit: (lesson: EnLessonRecord) => void;
  onDeleteLesson: (lesson: EnLessonRecord) => void;
  onLessonLinkCopied: (lessonId: number) => void;
  onLessonLinkCopyError: () => void;
  onCopyFeedback: (message: string) => void;
};

export function EnLessonStatusTable({
  displayGroups,
  dayToneByDate,
  classTimeSortOrder,
  isAdmin,
  canOperate,
  refs,
  teachers,
  teacherNameById,
  savingTeacherId,
  noteCountByLesson,
  expandedContentIds,
  deletingId,
  savingId,
  savingNextClassId,
  copiedId,
  onToggleClassTimeSort,
  onToggleContentExpanded,
  onSetLessonProgress,
  onEditLesson,
  onAnnotateLesson,
  onOpenTeacherEdit,
  onOpenNextClassEdit,
  onDeleteLesson,
  onLessonLinkCopied,
  onLessonLinkCopyError,
  onCopyFeedback,
}: EnLessonStatusTableProps) {
  const teachersForLesson = (lesson: EnLessonRecord): EnLessonTeacher[] =>
    (lesson.teacher_ids ?? [])
      .map((id) => teachers.find((teacher) => teacher.id === id))
      .filter((teacher): teacher is EnLessonTeacher => teacher != null);

  const copyMeetingIdForLesson = (lesson: EnLessonRecord) => {
    const result = resolveEnLessonMeetingIdForCopy(teachersForLesson(lesson));
    if (!result.ok) {
      if (result.message) onCopyFeedback(result.message);
      return;
    }
    void copyTextToClipboard(result.meetingId).then((ok) =>
      onCopyFeedback(ok ? "复制成功" : "复制失败")
    );
  };
  const renderLessonDeleteButton = (lesson: EnLessonRecord) =>
    canOperate ? (
      <button
        key="delete"
        type="button"
        className="jp-lesson-action-btn jp-lesson-action-btn--danger"
        disabled={deletingId === lesson.id}
        onClick={() => void onDeleteLesson(lesson)}
      >
        {deletingId === lesson.id ? "删除中…" : "删除"}
      </button>
    ) : null;

  const renderLessonActions = (lesson: EnLessonRecord) => {
    const ref = lesson.ref_key ? refs[lesson.ref_key] : undefined;
    const hasRefKey = Boolean(lesson.ref_key);
    const hasRefMeta = Boolean(lesson.ref_key && ref);
    const viewUrl = lesson.ref_key ? refViewUrl(lesson.ref_key, ref?.updated_at) : "";

    if (!hasRefKey) {
      return canOperate || isAdmin ? (
        <div className="jp-lesson-actions">
          {canOperate ? (
            <button
              type="button"
              className="jp-lesson-action-btn"
              onClick={() => onEditLesson(lesson)}
            >
              <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                <EnLessonMobileIcon name="upload" />
              </span>
              上传教案
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className="jp-lesson-action-btn"
              title="复制腾讯会议号"
              onClick={() => copyMeetingIdForLesson(lesson)}
            >
              <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                <EnLessonMobileIcon name="copy" />
              </span>
              会议号
            </button>
          ) : null}
          {renderLessonDeleteButton(lesson)}
        </div>
      ) : (
        <span style={{ color: "var(--muted)" }}>—</span>
      );
    }

    const actionItems: ReactNode[] = [
      <a
        key="view"
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="jp-lesson-action-btn jp-lesson-action-btn--view"
      >
        <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
          <EnLessonMobileIcon name="view" />
        </span>
        查看
      </a>,
    ];
    if (hasRefMeta && ref && (ref.media_type === "image" || ref.media_type === "pdf")) {
      const imageUrl = enVocabRefApiPath(lesson.ref_key!, { v: ref.updated_at });
      const mediaType = ref.media_type === "pdf" ? "pdf" : "image";
      actionItems.push(
        <button
          key="annotate"
          type="button"
          className="jp-lesson-action-btn"
          onClick={() =>
            onAnnotateLesson({ lesson, ref: ref!, imageUrl, mediaType })
          }
        >
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <EnLessonMobileIcon name="pen" />
          </span>
          随手画
        </button>
      );
    }
    actionItems.push(
      <EnVocabRefDownloadMenu
        key="download"
        downloadUrl={enVocabRefApiPath(lesson.ref_key!, { download: true })}
        mediaUrl={enVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })}
        filename={refFilename(lesson, ref)}
        mediaType={ref?.media_type ?? "image"}
        primaryClassName="jp-lesson-action-btn jp-lesson-action-btn--download"
        fixedPanel
        allowOriginalDownload={isAdmin}
        cropKind={lesson.kind}
      />
    );
    actionItems.push(
      <EnLessonCopyMenu
        key="copy"
        lessonId={lesson.id}
        viewUrl={viewUrl}
        siteUrl={SITE_URL}
        teacherNames={formatLessonTeacherNamesForCopy(lesson, teacherNameById)}
        copyCount={lesson.link_copy_count ?? 0}
        primaryClassName="jp-lesson-action-btn"
        fixedPanel
        copiedId={copiedId}
        onCopied={onLessonLinkCopied}
        onCopyError={onLessonLinkCopyError}
        icon={
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <EnLessonMobileIcon name="copy" />
          </span>
        }
      />
    );
    if (isAdmin) {
      actionItems.push(
        <button
          key="meeting"
          type="button"
          className="jp-lesson-action-btn"
          title="复制腾讯会议号"
          onClick={() => copyMeetingIdForLesson(lesson)}
        >
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <EnLessonMobileIcon name="copy" />
          </span>
          会议号
        </button>
      );
    }
    if (canOperate) {
      actionItems.push(
        <EnEditIconButton
          key="edit"
          title="编辑教案（弹窗）"
          onClick={() => onEditLesson(lesson)}
        />
      );
      const deleteBtn = renderLessonDeleteButton(lesson);
      if (deleteBtn) actionItems.push(deleteBtn);
    }
    return <div className="jp-lesson-actions">{actionItems}</div>;
  };

  const renderMobileCardFooter = (groupLessons: EnLessonRecord[]) => {
    const rows = groupLessons.flatMap((lesson) => {
      const buttons: ReactNode[] = [];
      if (canOperate) {
        buttons.push(
          <button
            key={`edit-${lesson.id}`}
            type="button"
            className="jp-lesson-mobile-footer-btn"
            onClick={() => onEditLesson(lesson)}
          >
            <EnLessonMobileIcon name="edit" />
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
            <EnLessonMobileIcon name="clock" />
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
            <EnLessonMobileIcon name="user" />
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
  };

  const renderSharedTeacherCell = (groupLessons: EnLessonRecord[]) => {
    const lesson = groupLessons[0];
    const assigned = teachersForLesson(lesson);
    const withMeeting = assigned.filter((t) =>
      Boolean(normalizeTencentMeetingId(t.tencent_meeting_id))
    );
    return (
      <td data-label="上课老师" className="jp-lesson-teacher-col">
        <div className="jp-lesson-teacher-cell">
          <div className="jp-lesson-teacher-cell-main">
            <span>{formatLessonTeacherNames(lesson, teacherNameById)}</span>
            {withMeeting.length ? (
              <span className="en-lesson-tencent-tags" aria-label="腾讯会议">
                {withMeeting.map((teacher) => (
                  <span
                    key={teacher.id}
                    className="en-lesson-tencent-tag"
                    title={`${teacher.name} · ${normalizeTencentMeetingId(teacher.tencent_meeting_id)}`}
                  >
                    腾讯会议
                  </span>
                ))}
              </span>
            ) : null}
          </div>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <EnEditIconButton
                key={item.id}
                title={`设置 #${item.id} 上课老师`}
                disabled={savingTeacherId === item.id}
                onClick={() => onOpenTeacherEdit(item)}
              />
            ))}
          </div>
        </div>
      </td>
    );
  };

  const renderSharedClassTimeCell = (groupLessons: EnLessonRecord[]) => {
    const lesson = groupLessons[0];
    const progressStatus = getEnLessonProgressStatus(lesson);
    const classSchedules = getLessonClassSchedules(lesson);

    return (
      <td data-label="上课时间" className="jp-lesson-next-class-col">
        <div className="jp-lesson-next-class-cell">
          <div className="jp-lesson-next-class-lines">
            {progressStatus === "completed" ? (
              <span className="jp-lesson-next-class-label is-done">已上完课</span>
            ) : classSchedules.length === 0 ? (
              <span className="jp-lesson-next-class-label is-undefined">未定义</span>
            ) : (
              classSchedules.map((schedule, scheduleIdx) => {
                const durationLabel = renderClassDurationLabel(schedule.duration_minutes);
                return (
                  <div
                    key={schedule.id || scheduleIdx}
                    className="jp-lesson-next-class-entry"
                  >
                    <span className="jp-lesson-next-class-label">
                      {renderNextClassLabel(schedule.class_at, progressStatus)}
                    </span>
                    {durationLabel ? (
                      <span className="jp-lesson-class-duration-label">{durationLabel}</span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <EnEditIconButton
                key={item.id}
                title={`设置 #${item.id} 上课时间`}
                disabled={savingNextClassId === item.id}
                onClick={() => onOpenNextClassEdit(item)}
              />
            ))}
          </div>
        </div>
      </td>
    );
  };

  return (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th className="jp-lesson-id-col">ID</th>
            <th className="jp-lesson-kind-col" title="学习类型：词 / 法">
              类
            </th>
            <th className="en-lesson-category-col" title="分类标签（如雅思 / 托福 / 托业）">
              分类
            </th>
            <th className="jp-lesson-content-col">学习内容</th>
            <th className="jp-lesson-content-count-col" title="按英文/中文逗号分隔统计的词/短语数">
              数
            </th>
            <th className="jp-lesson-uploaded-col">上传日期</th>
            <th className="jp-lesson-status-at-col">最近操作</th>
            <th className="jp-lesson-operator-col">操作人</th>
            {isAdmin ? <th className="jp-lesson-teacher-col">上课老师</th> : null}
            {isAdmin ? (
              <th
                className={`jp-lesson-next-class-col jp-lesson-next-class-col--sortable${
                  classTimeSortOrder === "asc"
                    ? " jp-lesson-next-class-col--sorted-asc"
                    : " jp-lesson-next-class-col--sorted-desc"
                }`}
              >
                <button
                  type="button"
                  className="jp-lesson-sort-btn"
                  title={
                    classTimeSortOrder === "asc"
                      ? "按上课时间从早到晚排序；点击切换为从晚到早。同一老师同一时段的多条教材会合并为一行"
                      : "按上课时间从晚到早排序；点击切换为从早到晚。同一老师同一时段的多条教材会合并为一行"
                  }
                  aria-label={
                    classTimeSortOrder === "asc"
                      ? "上课时间升序，点击切换为降序"
                      : "上课时间降序，点击切换为升序"
                  }
                  onClick={onToggleClassTimeSort}
                >
                  上课时间
                  <span className="jp-lesson-sort-indicator" aria-hidden="true">
                    {classTimeSortOrder === "asc" ? "↑" : "↓"}
                  </span>
                </button>
              </th>
            ) : null}
            <th className="jp-lesson-complete-col">学习状态</th>
            <th className="jp-lesson-notes-col">课堂笔记</th>
            <th className="jp-lesson-actions-col">教案操作</th>
          </tr>
        </thead>
        <tbody>
          {displayGroups.map((group) => {
            const merged = group.lessons.length > 1;
            const stackClass = merged ? " jp-lesson-merged-stack" : "";
            const classDate = getLessonClassDate(group.lessons[0]);
            const dayTone =
              classDate != null ? dayToneByDate?.get(classDate) : undefined;
            const rowClassName = [
              "jp-lesson-row",
              merged ? "jp-lesson-row--merged" : "",
              dayTone != null ? `jp-lesson-row--day-tone-${dayTone}` : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <tr key={group.key} className={rowClassName || undefined}>
                <td data-label="ID" className="jp-lesson-id-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        data-lesson-anchor={lesson.id}
                      >
                        {lesson.id}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="学习类型" className="jp-lesson-kind-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <span
                          className={`jp-lesson-kind${
                            lesson.kind === "grammar" ? " jp-lesson-kind--grammar" : ""
                          }`}
                          title={lesson.kind === "grammar" ? "语法" : "单词"}
                        >
                          {lesson.kind === "grammar" ? "法" : "词"}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="分类" className="en-lesson-category-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const fullCategory = displayEnVocabCategory(lesson.category);
                      return (
                      <div
                        key={lesson.id}
                        className={
                          merged
                            ? "jp-lesson-merged-stack-item en-lesson-category-short"
                            : "en-lesson-category-short"
                        }
                        title={fullCategory}
                      >
                        <span className="en-lesson-category-short-label">
                          {shortEnVocabCategoryLabel(lesson.category)}
                        </span>
                        <span className="en-lesson-category-full-label">
                          {fullCategory}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="学习内容" className="jp-lesson-content-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const mobileContentItems = parseLessonContent(lesson.content);
                      const chipItems = mobileContentItems.length
                        ? mobileContentItems
                        : [lesson.content.trim() || "—"];
                      return (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <EnLessonContentPreview
                          content={lesson.content}
                          expanded={Boolean(expandedContentIds[lesson.id])}
                          onToggle={() => onToggleContentExpanded(lesson.id)}
                        />
                        <div
                          className={`jp-lesson-mobile-content-item${
                            merged ? " jp-lesson-merged-stack-item" : ""
                          }`}
                          data-lesson-anchor={lesson.id}
                        >
                          <div className="jp-lesson-mobile-content-main">
                            <div className="jp-lesson-mobile-id-block">
                              <div className="jp-lesson-mobile-id-line">
                                <span className="jp-lesson-mobile-id-label">ID</span>
                                <span className="jp-lesson-mobile-id-value">{lesson.id}</span>
                              </div>
                              <span
                                className={`jp-lesson-kind jp-lesson-mobile-kind-tag${
                                  lesson.kind === "grammar" ? " jp-lesson-kind--grammar" : ""
                                }`}
                              >
                                {lesson.kind === "grammar" ? "语法" : "单词"}
                              </span>
                            </div>
                            <ul
                              className="jp-lesson-mobile-content-chips"
                              aria-label={`课程 #${lesson.id} 学习内容`}
                            >
                              {chipItems.map((item, itemIdx) => (
                                <li
                                  key={`${lesson.id}-c-${itemIdx}`}
                                  className="jp-lesson-mobile-content-chip"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                            {canOperate ? (
                              <div className="jp-lesson-mobile-examples-toolbar">
                                <button
                                  type="button"
                                  className="jp-lesson-mobile-content-edit"
                                  title={`修改 #${lesson.id} 教案`}
                                  aria-label={`修改 #${lesson.id} 教案`}
                                  onClick={() => onEditLesson(lesson)}
                                >
                                  修改
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="词/短语数" className="jp-lesson-content-count-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {parseLessonContent(lesson.content).length}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="upload">
                          {renderLessonDateTime(lesson.uploaded_at)}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="clock">
                          {lesson.status_updated_at
                            ? renderLessonDateTime(lesson.status_updated_at)
                            : "—"}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <EnLessonMobileFieldValue icon="user">
                          {lesson.status_updated_by ?? "—"}
                        </EnLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                {isAdmin ? renderSharedTeacherCell(group.lessons) : null}
                {isAdmin ? renderSharedClassTimeCell(group.lessons) : null}
                <td data-label="学习状态" className="jp-lesson-complete-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const progressStatus = getEnLessonProgressStatus(lesson);
                      return (
                        <div
                          key={lesson.id}
                          className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        >
                          <div
                            className={`jp-lesson-complete-wrap${
                              progressStatus === "completed" ? " is-done" : ""
                            }${progressStatus === "learning" ? " is-learning" : ""}${
                              !canOperate ? " is-readonly" : ""
                            }${savingId === lesson.id ? " is-saving" : ""}`}
                          >
                            <select
                              className="jp-lesson-complete-select"
                              value={progressStatus}
                              disabled={!canOperate || savingId === lesson.id}
                              aria-label={`${lesson.content} 学习状态`}
                              onChange={(e) =>
                                void onSetLessonProgress(
                                  lesson.id,
                                  e.target.value as EnLessonProgressStatus
                                )
                              }
                            >
                              <option value="pending">未完成</option>
                              <option value="learning">学习中</option>
                              <option value="completed">已完成</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="课堂笔记" className="jp-lesson-notes-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const noteCount = noteCountByLesson.get(lesson.id) ?? 0;
                      return (
                        <div
                          key={lesson.id}
                          className={merged ? "jp-lesson-merged-stack-item" : undefined}
                        >
                          <a
                            href={`/en-lesson/notes?id=${lesson.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="jp-lesson-notes-btn"
                            title="在新标签页打开课堂笔记"
                          >
                            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                              <EnLessonMobileIcon name="notes" />
                            </span>
                            笔记
                            {noteCount > 0 ? (
                              <span className="jp-lesson-notes-count">{noteCount}</span>
                            ) : null}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="教案操作" className="jp-lesson-actions-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        {renderLessonActions(lesson)}
                      </div>
                    ))}
                  </div>
                </td>
                {renderMobileCardFooter(group.lessons)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
