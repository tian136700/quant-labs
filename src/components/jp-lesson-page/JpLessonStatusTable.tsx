"use client";

import { type ReactNode } from "react";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { JpLessonBatchCopyMenu } from "@/components/JpLessonBatchCopyMenu";
import { JpLessonCopyMenu } from "@/components/JpLessonCopyMenu";
import type { JpLessonExamplesViewTarget } from "@/components/JpLessonExamplesViewModal";
import { JpLessonTeacherDisplay } from "@/components/JpLessonTeacherDisplay";
import { JpVocabRefDownloadMenu } from "@/components/JpVocabRefDownloadMenu";
import {
  JpLessonContentPreview,
  JpLessonMeaningsPreview,
  JpLessonAnnotationsPreview,
  jpLessonItemAnnotation,
  JpLessonMobileFieldValue,
  JpLessonMobileIcon,
  formatLessonContentOneLine,
  lessonHasExamples,
  refFilename,
  refViewUrl,
  renderClassDurationLabel,
  renderLessonDateTime,
  renderNextClassLabel,
  type JpLessonSectionSort,
} from "@/components/jp-lesson-page/jp-lesson-page-helpers";
import { buildJpLessonCoursePairMap, type JpLessonCoursePair } from "@/lib/jp-lesson-course-pair";
import type { JpLessonCourseMergeBusy } from "@/components/JpLessonCopyMenu";
import {
  JpLessonContentEditIconButton,
} from "@/components/jp-lesson-page/JpLessonContentEditButtons";
import { JpLessonStatusTableMobileFooter } from "@/components/jp-lesson-page/JpLessonStatusTableMobileFooter";
import {
  getJpLessonProgressStatus,
  getLessonClassDate,
  getLessonClassSchedules,
  jpLessonCropKind,
  jpLessonKindLabel,
  jpLessonKindShortLabel,
  parseLessonContent,
  type JpLessonDisplayGroup,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import { JP_SITE_URL } from "@/lib/jp-site-host";
import { jpVocabRefApiPath } from "@/lib/jp-vocab-ref-shared";
import type { JpLessonRecord, JpLessonTeacher, JpVocabRef } from "@/lib/types";

export type JpLessonStatusTableProps = {
  displayGroups: JpLessonDisplayGroup<JpLessonRecord>[];
  status: JpLessonProgressStatus;
  dayToneByDate?: Map<string, number>;
  sectionSort: JpLessonSectionSort;
  isAdmin: boolean;
  canOperate: boolean;
  refs: Record<string, JpVocabRef>;
  teacherById: Map<number, JpLessonTeacher>;
  noteCountByLesson: Map<number, number>;
  batchLessonIds: number[];
  expandedContentIds: Record<number, boolean>;
  expandedMeaningsIds: Record<number, boolean>;
  savingId: number | null;
  savingNextClassId: number | null;
  deletingId: number | null;
  copiedId: number | null;
  copiedBatchKey: string | null;
  onToggleRecentOperationSort: () => void;
  onToggleClassTimeSort: () => void;
  onToggleBatchLesson: (lessonId: number) => void;
  onToggleContentExpanded: (lessonId: number) => void;
  onToggleMeaningsExpanded: (lessonId: number) => void;
  onSetLessonProgress: (lessonId: number, status: JpLessonProgressStatus) => void | Promise<void>;
  onViewExamples: (target: JpLessonExamplesViewTarget) => void;
  onEditLesson: (lesson: JpLessonRecord) => void;
  onEditContent: (lesson: JpLessonRecord) => void;
  onAnnotateLesson: (payload: {
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    imageUrl: string;
    mediaType?: "image" | "pdf";
  }) => void;
  onOpenTeacherEdit: (lesson: JpLessonRecord, lessonIds?: number[]) => void;
  onOpenNextClassEdit: (lesson: JpLessonRecord) => void;
  onDeleteLesson: (lesson: JpLessonRecord) => void;
  onLessonLinkCopied: (lessonId: number) => void;
  onBatchLinkCopied: (batchKey: string) => void;
  onLessonLinkCopyError: () => void;
  mergeBusy?: JpLessonCourseMergeBusy;
  onCopyCourseMerge?: (pair: JpLessonCoursePair) => void;
};

export function JpLessonStatusTable({
  displayGroups,
  status,
  dayToneByDate,
  sectionSort,
  isAdmin,
  canOperate,
  refs,
  teacherById,
  noteCountByLesson,
  batchLessonIds,
  expandedContentIds,
  expandedMeaningsIds,
  savingId,
  savingNextClassId,
  deletingId,
  copiedId,
  copiedBatchKey,
  onToggleRecentOperationSort,
  onToggleClassTimeSort,
  onToggleBatchLesson,
  onToggleContentExpanded,
  onToggleMeaningsExpanded,
  onSetLessonProgress,
  onViewExamples,
  onEditLesson,
  onEditContent,
  onAnnotateLesson,
  onOpenTeacherEdit,
  onOpenNextClassEdit,
  onDeleteLesson,
  onLessonLinkCopied,
  onBatchLinkCopied,
  onLessonLinkCopyError,
  mergeBusy = null,
  onCopyCourseMerge,
}: JpLessonStatusTableProps) {
  const sectionLessons = displayGroups.flatMap((g) => g.lessons);
  const coursePairMap = buildJpLessonCoursePairMap(sectionLessons);

  const courseSideForLesson = (
    lesson: JpLessonRecord
  ): "word" | "grammar" | null => {
    if (lesson.kind === "grammar") return "grammar";
    if (lesson.kind === "word" || lesson.kind === "word_grammar") return "word";
    return null;
  };

  const renderLessonDeleteButton = (lesson: JpLessonRecord) =>
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

  const renderLessonActions = (lesson: JpLessonRecord) => {
    const ref = lesson.ref_key ? refs[lesson.ref_key] : undefined;
    const hasRefKey = Boolean(lesson.ref_key);
    const hasRefMeta = Boolean(lesson.ref_key && ref);
    const viewUrl = lesson.ref_key ? refViewUrl(lesson.ref_key, ref?.updated_at) : "";
    const gid = (lesson.course_group_id || "").trim();
    const coursePair =
      canOperate && gid ? coursePairMap.get(gid) ?? null : null;

    if (!hasRefKey) {
      return canOperate ? (
        <div className="jp-lesson-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            onClick={() => onEditContent(lesson)}
          >
            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
              <JpLessonMobileIcon name="edit" />
            </span>
            编辑内容
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn"
            onClick={() => onEditLesson(lesson)}
          >
            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
              <JpLessonMobileIcon name="upload" />
            </span>
            上传教案
          </button>
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
          <JpLessonMobileIcon name="view" />
        </span>
        查看
      </a>,
    ];
    if (hasRefMeta && ref && (ref.media_type === "image" || ref.media_type === "pdf")) {
      const imageUrl = jpVocabRefApiPath(lesson.ref_key!, { v: ref.updated_at });
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
            <JpLessonMobileIcon name="pen" />
          </span>
          随手画
        </button>
      );
    }
    actionItems.push(
      <JpVocabRefDownloadMenu
        key="download"
        downloadUrl={jpVocabRefApiPath(lesson.ref_key!, { download: true })}
        mediaUrl={jpVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })}
        filename={refFilename(lesson, ref)}
        mediaType={ref?.media_type ?? "image"}
        primaryClassName="jp-lesson-action-btn jp-lesson-action-btn--download"
        fixedPanel
        allowOriginalDownload={isAdmin}
        cropKind={jpLessonCropKind(lesson.kind)}
      />
    );
    actionItems.push(
      <JpLessonCopyMenu
        key="copy"
        lessonId={lesson.id}
        viewUrl={viewUrl}
        siteUrl={JP_SITE_URL}
        copyCount={lesson.link_copy_count ?? 0}
        primaryClassName="jp-lesson-action-btn"
        fixedPanel
        copiedId={copiedId}
        onCopied={onLessonLinkCopied}
        onCopyError={onLessonLinkCopyError}
        pdfMediaUrl={
          ref?.media_type === "image"
            ? jpVocabRefApiPath(lesson.ref_key!, { v: ref?.updated_at })
            : null
        }
        pdfFilename={ref?.media_type === "image" ? refFilename(lesson, ref) : null}
        pdfCropKind={
          ref?.media_type === "image" ? jpLessonCropKind(lesson.kind) : null
        }
        coursePair={coursePair}
        courseSide={courseSideForLesson(lesson)}
        mergeBusy={mergeBusy}
        onCopyCourseMerge={onCopyCourseMerge}
        icon={
          <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
            <JpLessonMobileIcon name="copy" />
          </span>
        }
      />
    );
    if (canOperate) {
      actionItems.push(
        <JpLessonContentEditIconButton
          key="edit-content"
          lesson={lesson}
          onEdit={onEditContent}
        />,
        <JpEditIconButton
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

  const renderMobileCardFooter = (groupLessons: JpLessonRecord[]) => (
    <JpLessonStatusTableMobileFooter
      groupLessons={groupLessons}
      canOperate={canOperate}
      isAdmin={isAdmin}
      savingNextClassId={savingNextClassId}
      onEditContent={onEditContent}
      onEditLesson={onEditLesson}
      onOpenNextClassEdit={onOpenNextClassEdit}
      onOpenTeacherEdit={onOpenTeacherEdit}
    />
  );

  const renderSharedTeacherCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    const batchKey = `group-${groupLessons.map((item) => item.id).join("-")}`;
    const batchCopyItems = groupLessons
      .map((item) => {
        if (!item.ref_key) return null;
        const ref = refs[item.ref_key];
        if (!ref) return null;
        return {
          lessonId: item.id,
          content: formatLessonContentOneLine(item.content),
          viewUrl: refViewUrl(item.ref_key, ref.updated_at),
        };
      })
      .filter((item): item is { lessonId: number; content: string; viewUrl: string } => item != null);
    return (
      <td data-label="上课老师" className="jp-lesson-teacher-col">
        <div className="jp-lesson-teacher-cell">
          <JpLessonMobileFieldValue icon="user">
            <JpLessonTeacherDisplay lesson={lesson} teachersById={teacherById} />
          </JpLessonMobileFieldValue>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.length > 1 ? (
              <JpLessonBatchCopyMenu
                batchKey={batchKey}
                items={batchCopyItems}
                siteUrl={JP_SITE_URL}
                primaryClassName="jp-lesson-action-btn"
                fixedPanel
                copiedBatchKey={copiedBatchKey}
                onCopied={onBatchLinkCopied}
                onCopyError={onLessonLinkCopyError}
              />
            ) : null}
            <JpEditIconButton
              title={
                groupLessons.length > 1
                  ? `设置该合并行上课老师（共 ${groupLessons.length} 条）`
                  : `设置 #${lesson.id} 上课老师`
              }
              onClick={() => onOpenTeacherEdit(lesson, groupLessons.map((item) => item.id))}
            />
          </div>
        </div>
      </td>
    );
  };

  const renderSharedClassTimeCell = (groupLessons: JpLessonRecord[]) => {
    const lesson = groupLessons[0];
    const progressStatus = getJpLessonProgressStatus(lesson);
    const classSchedules = getLessonClassSchedules(lesson);

    return (
      <td data-label="上课时间" className="jp-lesson-next-class-col">
        <div className="jp-lesson-next-class-cell">
          <JpLessonMobileFieldValue icon="calendar">
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
          </JpLessonMobileFieldValue>
          <div className="jp-lesson-merged-edit-stack">
            {groupLessons.map((item) => (
              <JpEditIconButton
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

    const sort = sectionSort;
    const pendingIdSorted = status === "pending";
    const recentOperationSorted = !pendingIdSorted && sort.field === "recentOperation";
    const classTimeSorted = !pendingIdSorted && sort.field === "classTime";

    return (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th
              className={`jp-lesson-id-col${
                pendingIdSorted ? " jp-lesson-id-col--sorted-asc" : ""
              }`}
              title={
                pendingIdSorted
                  ? "未完成按 ID 从小到大排序：先上传的基础课优先"
                  : undefined
              }
            >
              ID
              {pendingIdSorted ? (
                <span className="jp-lesson-sort-indicator" aria-hidden="true">
                  ↑
                </span>
              ) : null}
            </th>
            <th className="jp-lesson-kind-col" title="学习类型：词 / 法">
              类
            </th>
            <th
              className="jp-lesson-course-col"
              title="同一课教材（合传上传标记，如标日23课）"
            >
              教材
            </th>
            <th className="jp-lesson-content-col">学习内容</th>
            <th className="jp-lesson-content-count-col" title="按英文/中文逗号分隔统计的词/语法数">
              数
            </th>
            <th className="jp-lesson-meanings-col">释义</th>
            <th className="jp-lesson-annotations-col" title="口语常用 / 考试常用">
              标注
            </th>
            <th className="jp-lesson-examples-col">例句</th>
            <th className="jp-lesson-uploaded-col" title="上传日期">上传</th>
            <th
              className={`jp-lesson-status-at-col jp-lesson-status-at-col--sortable${
                recentOperationSorted
                  ? sort.order === "asc"
                    ? " jp-lesson-status-at-col--sorted-asc"
                    : " jp-lesson-status-at-col--sorted-desc"
                  : ""
              }`}
            >
              <button
                type="button"
                className="jp-lesson-sort-btn"
                disabled={pendingIdSorted}
                title={
                  pendingIdSorted
                    ? "未完成固定按 ID 从小到大排序，不可改按最近操作"
                    : recentOperationSorted
                      ? sort.order === "desc"
                        ? "按最近操作从新到旧排序；点击切换为从旧到新"
                        : "按最近操作从旧到新排序；点击切换为从新到旧"
                      : "按最近操作排序；点击后最近一次操作的排在前面"
                }
                aria-label={
                  pendingIdSorted
                    ? "未完成固定按 ID 升序"
                    : recentOperationSorted
                      ? sort.order === "desc"
                        ? "最近操作降序，点击切换为升序"
                        : "最近操作升序，点击切换为降序"
                      : "按最近操作排序"
                }
                onClick={onToggleRecentOperationSort}
              >
                最近
                {recentOperationSorted ? (
                  <span className="jp-lesson-sort-indicator" aria-hidden="true">
                    {sort.order === "asc" ? "↑" : "↓"}
                  </span>
                ) : null}
              </button>
            </th>
            <th className="jp-lesson-operator-col" title="操作人">操作人</th>
            {isAdmin ? (
              <th className="jp-lesson-teacher-col" title="上课老师">
                老师
              </th>
            ) : null}
            {isAdmin ? (
              <th
                className={`jp-lesson-next-class-col jp-lesson-next-class-col--sortable${
                  classTimeSorted
                    ? sort.order === "asc"
                      ? " jp-lesson-next-class-col--sorted-asc"
                      : " jp-lesson-next-class-col--sorted-desc"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="jp-lesson-sort-btn"
                  disabled={pendingIdSorted}
                  title={
                    pendingIdSorted
                      ? "未完成固定按 ID 从小到大排序，不可改按上课时间"
                      : classTimeSorted
                        ? sort.order === "asc"
                          ? "按上课时间从早到晚排序；点击切换为从晚到早。同一老师同一时段的多条教材会合并为一行"
                          : "按上课时间从晚到早排序；点击切换为从早到晚。同一老师同一时段的多条教材会合并为一行"
                        : "按上课时间排序；点击后按上课时间从早到晚排列。同一老师同一时段的多条教材会合并为一行"
                  }
                  aria-label={
                    pendingIdSorted
                      ? "未完成固定按 ID 升序"
                      : classTimeSorted
                        ? sort.order === "asc"
                          ? "上课时间升序，点击切换为降序"
                          : "上课时间降序，点击切换为升序"
                        : "按上课时间排序"
                  }
                  onClick={onToggleClassTimeSort}
                >
                  时间
                  {classTimeSorted ? (
                    <span className="jp-lesson-sort-indicator" aria-hidden="true">
                      {sort.order === "asc" ? "↑" : "↓"}
                    </span>
                  ) : null}
                </button>
              </th>
            ) : null}
            <th className="jp-lesson-complete-col" title="学习状态">
              状态
            </th>
            <th className="jp-lesson-notes-col" title="课堂笔记">
              笔记
            </th>
            <th className="jp-lesson-actions-col" title="教案操作">
              操作
            </th>
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
                        <label className="jp-lesson-batch-id-row">
                          {isAdmin && getJpLessonProgressStatus(lesson) === "pending" ? (
                            <input
                              type="checkbox"
                              checked={batchLessonIds.includes(lesson.id)}
                              onChange={() => onToggleBatchLesson(lesson.id)}
                              aria-label={`勾选课程 #${lesson.id} 批量设置`}
                            />
                          ) : (
                            <span className="jp-lesson-batch-id-placeholder" aria-hidden="true" />
                          )}
                          <span>{lesson.id}</span>
                        </label>
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
                            lesson.kind === "grammar" || lesson.kind === "word_grammar"
                              ? " jp-lesson-kind--grammar"
                              : ""
                          }${
                            lesson.kind === "word_grammar" ? " jp-lesson-kind--mixed" : ""
                          }`}
                          title={jpLessonKindLabel(lesson.kind)}
                        >
                          {jpLessonKindShortLabel(lesson.kind)}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="教材" className="jp-lesson-course-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        {lesson.course_label ? (
                          <span
                            className="jp-lesson-course-label"
                            title={
                              lesson.course_group_id
                                ? `同一课 ${lesson.course_label}`
                                : lesson.course_label
                            }
                          >
                            {lesson.course_label}
                          </span>
                        ) : (
                          <span className="jp-lesson-course-label jp-lesson-course-label--empty">
                            —
                          </span>
                        )}
                      </div>
                    ))}
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
                        <JpLessonContentPreview
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
                                  lesson.kind === "grammar" ||
                                  lesson.kind === "word_grammar"
                                    ? " jp-lesson-kind--grammar"
                                    : ""
                                }${
                                  lesson.kind === "word_grammar"
                                    ? " jp-lesson-kind--mixed"
                                    : ""
                                }`}
                              >
                                {jpLessonKindLabel(lesson.kind)}
                              </span>
                              {lesson.course_label ? (
                                <span
                                  className="jp-lesson-course-label jp-lesson-mobile-course-label"
                                  title={
                                    lesson.course_group_id
                                      ? `同一课 ${lesson.course_label}`
                                      : lesson.course_label
                                  }
                                >
                                  {lesson.course_label}
                                </span>
                              ) : null}
                            </div>
                            <ul
                              className="jp-lesson-mobile-content-chips"
                              aria-label={`课程 #${lesson.id} 学习内容`}
                            >
                              {chipItems.map((item, itemIdx) => {
                                const tag = jpLessonItemAnnotation(
                                  lesson.content,
                                  lesson.annotations,
                                  itemIdx
                                );
                                return (
                                <li
                                  key={`${lesson.id}-c-${itemIdx}`}
                                  className="jp-lesson-mobile-content-chip"
                                >
                                  <span className="jp-lesson-mobile-content-chip-text">
                                    {item}
                                  </span>
                                  {tag ? (
                                    <span className="jp-lesson-mobile-content-chip-annotation">
                                      {tag}
                                    </span>
                                  ) : null}
                                </li>
                                );
                              })}
                            </ul>
                            <p className="jp-lesson-mobile-meanings-inline">
                              <span className="jp-lesson-mobile-meanings-label">释义</span>
                              <JpLessonMeaningsPreview
                                content={lesson.content}
                                meanings={lesson.meanings}
                                expanded={Boolean(expandedMeaningsIds[lesson.id])}
                                onToggle={() => onToggleMeaningsExpanded(lesson.id)}
                              />
                            </p>
                            <p className="jp-lesson-mobile-annotations-inline">
                              <span className="jp-lesson-mobile-meanings-label">标注</span>
                              <JpLessonAnnotationsPreview
                                content={lesson.content}
                                annotations={lesson.annotations}
                              />
                            </p>
                            <div className="jp-lesson-mobile-examples-toolbar">
                              <span className="jp-lesson-mobile-examples-label">例句</span>
                              {lessonHasExamples(lesson.content, lesson.example_sentences) ? (
                                <button
                                  type="button"
                                  className="jp-lesson-examples-view-btn"
                                  onClick={() =>
                                    onViewExamples({
                                      lessonId: lesson.id,
                                      content: lesson.content,
                                      exampleSentences: lesson.example_sentences,
                                    })
                                  }
                                >
                                  查看
                                </button>
                              ) : (
                                <span className="jp-lesson-examples-empty">—</span>
                              )}
                              {canOperate ? (
                                <button
                                  type="button"
                                  className="jp-lesson-mobile-content-edit"
                                  title={`修改 #${lesson.id} 教案`}
                                  aria-label={`修改 #${lesson.id} 教案`}
                                  onClick={() => onEditLesson(lesson)}
                                >
                                  修改
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </td>
                <td data-label="词/语法数" className="jp-lesson-content-count-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        {parseLessonContent(lesson.content).length}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="释义" className="jp-lesson-meanings-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <JpLessonMeaningsPreview
                          content={lesson.content}
                          meanings={lesson.meanings}
                          expanded={Boolean(expandedMeaningsIds[lesson.id])}
                          onToggle={() => onToggleMeaningsExpanded(lesson.id)}
                        />
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="标注" className="jp-lesson-annotations-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        <JpLessonAnnotationsPreview
                          content={lesson.content}
                          annotations={lesson.annotations}
                        />
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="例句" className="jp-lesson-examples-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className={merged ? "jp-lesson-merged-stack-item" : undefined}
                      >
                        {lessonHasExamples(lesson.content, lesson.example_sentences) ? (
                          <button
                            type="button"
                            className="jp-lesson-examples-view-btn"
                            onClick={() =>
                              onViewExamples({
                                lessonId: lesson.id,
                                content: lesson.content,
                                exampleSentences: lesson.example_sentences,
                              })
                            }
                          >
                            查看
                          </button>
                        ) : (
                          <span className="jp-lesson-examples-empty">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="upload">
                          {renderLessonDateTime(lesson.uploaded_at)}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="clock">
                          {lesson.status_updated_at
                            ? renderLessonDateTime(lesson.status_updated_at)
                            : "—"}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => (
                      <div key={lesson.id} className={merged ? "jp-lesson-merged-stack-item" : undefined}>
                        <JpLessonMobileFieldValue icon="user">
                          {lesson.status_updated_by ?? "—"}
                        </JpLessonMobileFieldValue>
                      </div>
                    ))}
                  </div>
                </td>
                {isAdmin ? renderSharedTeacherCell(group.lessons) : null}
                {isAdmin ? renderSharedClassTimeCell(group.lessons) : null}
                <td data-label="学习状态" className="jp-lesson-complete-col jp-lesson-mobile-labeled-col">
                  <div className={stackClass.trim() || undefined}>
                    {group.lessons.map((lesson) => {
                      const progressStatus = getJpLessonProgressStatus(lesson);
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
                                  e.target.value as JpLessonProgressStatus
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
                            href={`/jp-lesson/notes?id=${lesson.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="jp-lesson-notes-btn"
                            title="在新标签页打开课堂笔记"
                          >
                            <span className="jp-lesson-mobile-btn-icon" aria-hidden="true">
                              <JpLessonMobileIcon name="notes" />
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
