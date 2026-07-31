"use client";

import { type RefObject } from "react";
import type { Locale } from "@/i18n/messages";
import type { LessonTeacherSubject } from "@/lib/locale-path";
import { adminUsersPath, parseLessonTeacherSubject } from "@/lib/locale-path";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import {
  formatTeacherLessonMinutes,
  resolveLessonTeacherRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import { lessonTeacherSubjectLabel, lessonTeacherSubjectSkipsUserAccount } from "@/lib/lesson-teacher-subject";
import type { JpLessonTeacher, JpLessonTeacherReviewSummary } from "@/lib/types";
import {
  LESSON_MINUTE_OPTIONS,
  calcEquivalentHourlyRate,
  defaultLessonMinutesWhenRateSet,
  formatLessonMinuteOptionLabel,
  formatTeacherRateRmbOnly,
  scoreClass,
  type TeacherSearchHit,
  type TeacherSortKey,
  type SortOrder,
} from "@/components/admin-jp-lesson-teachers-page/admin-jp-lesson-teachers-page-helpers";

export type AdminJpLessonTeachersListProps = {
  locale: Locale;
  teacherSubject: LessonTeacherSubject;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  teachers: JpLessonTeacher[];
  filteredTeachers: JpLessonTeacher[];
  searchDraft: string;
  appliedSearchQuery: string;
  searchSuggestOpen: boolean;
  searchSuggestions: TeacherSearchHit[];
  searchFieldRef: RefObject<HTMLDivElement | null>;
  rowRefs: RefObject<Map<number, HTMLTableRowElement>>;
  highlightTeacherId: number | null;
  editingId: number | null;
  editName: string;
  editHourlyRate: string;
  editLessonMinutes: string;
  reviewSummaries: Map<number, JpLessonTeacherReviewSummary>;
  creatingUserTeacherId: number | null;
  sortKey: TeacherSortKey;
  sortOrder: SortOrder;
  fieldLabels: Record<string, string>;
  selectedSearchTeacherId: number | null;
  onOpenAddModal: () => void;
  switchTeacherSubject: (next: LessonTeacherSubject) => void;
  setSearchDraft: (v: string) => void;
  setSelectedSearchTeacherId: (v: number | null) => void;
  setSearchSuggestOpen: (v: boolean) => void;
  applySearch: (draft: string) => void;
  selectSearchTeacher: (hit: TeacherSearchHit) => void;
  toggleSort: (key: TeacherSortKey) => void;
  setEditName: (v: string) => void;
  setEditHourlyRate: (v: string) => void;
  setEditLessonMinutes: (v: string) => void;
  startEdit: (teacher: JpLessonTeacher) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  deleteTeacher: (id: number, name: string) => void;
  createTeacherUser: (teacher: JpLessonTeacher) => void;
  setReviewTeacher: (teacher: JpLessonTeacher | null) => void;
};

export function AdminJpLessonTeachersList(props: AdminJpLessonTeachersListProps) {
  const {
    locale, teacherSubject, loading, refreshing, saving, teachers, filteredTeachers,
    searchDraft, appliedSearchQuery, searchSuggestOpen, searchSuggestions,
    searchFieldRef, rowRefs, highlightTeacherId, editingId, editName,
    editHourlyRate, editLessonMinutes, reviewSummaries, creatingUserTeacherId,
    sortKey, sortOrder, fieldLabels, selectedSearchTeacherId, onOpenAddModal, switchTeacherSubject,
    setSearchDraft, setSelectedSearchTeacherId, setSearchSuggestOpen, applySearch,
    selectSearchTeacher, toggleSort, setEditName, setEditHourlyRate, setEditLessonMinutes,
    startEdit, cancelEdit, saveEdit, deleteTeacher, createTeacherUser, setReviewTeacher,
  } = props;

  return (
      <section className="section etr-panel admin-rbac-section">
        <div className="etr-history-head admin-jpl-teachers-head">
          <h2>{locale === "zh" ? "老师列表" : "Teachers"}</h2>
          <div className="admin-jpl-teachers-toolbar">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary btn-rsi-filter--compact"
              onClick={() => onOpenAddModal()}
            >
              {locale === "zh" ? "添加老师" : "Add teacher"}
            </button>
            <select
              id="admin-jpl-teacher-subject"
              className="admin-jpl-subject-select"
              value={teacherSubject}
              aria-label={locale === "zh" ? "老师类型" : "Teacher type"}
              onChange={(event) =>
                switchTeacherSubject(parseLessonTeacherSubject(event.target.value))
              }
            >
              <option value="jp">{locale === "zh" ? "日语老师" : "Japanese"}</option>
              <option value="en">{locale === "zh" ? "英语老师" : "English"}</option>
              <option value="ko">{locale === "zh" ? "韩语老师" : "Korean"}</option>
            </select>
            <div className="admin-jpl-search-combo" ref={searchFieldRef}>
              <label className="admin-jpl-search-field" htmlFor="admin-jpl-teacher-search">
                <span className="sr-only">
                  {locale === "zh" ? "搜索老师" : "Search teachers"}
                </span>
                <input
                  id="admin-jpl-teacher-search"
                  type="text"
                  value={searchDraft}
                  placeholder={
                    locale === "zh"
                      ? "模糊搜索老师名（日语/英语都搜，如 m、周）"
                      : "Fuzzy search JP/EN teachers, e.g. m or Zhou"
                  }
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={searchSuggestOpen && searchSuggestions.length > 0}
                  aria-controls="admin-jpl-teacher-search-list"
                  aria-autocomplete="list"
                  onFocus={() => setSearchSuggestOpen(true)}
                  onChange={(e) => {
                    setSearchDraft(e.target.value);
                    setSelectedSearchTeacherId(null);
                    setSearchSuggestOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applySearch(searchDraft);
                    } else if (e.key === "Escape") {
                      setSearchSuggestOpen(false);
                    }
                  }}
                />
              </label>
              {searchSuggestOpen && searchDraft.trim() && searchSuggestions.length > 0 ? (
                <ul
                  id="admin-jpl-teacher-search-list"
                  className="admin-jpl-search-suggest"
                  role="listbox"
                >
                  {searchSuggestions.map((hit) => {
                    const name = resolveLessonTeacherRateFields(hit.teacher).name;
                    const subjectLabel = lessonTeacherSubjectLabel(hit.subject, locale);
                    return (
                      <li key={`${hit.subject}-${hit.teacher.id}`} role="option">
                        <button
                          type="button"
                          className="admin-jpl-search-suggest-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSearchTeacher(hit)}
                        >
                          <span className="admin-jpl-search-suggest-name">{name}</span>
                          <span className="admin-jpl-search-suggest-meta">
                            {subjectLabel}
                            {" · "}
                            {locale === "zh" ? "频次" : "Lessons"}{" "}
                            {hit.teacher.lesson_count ?? 0}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary btn-rsi-filter--compact"
              onClick={() => applySearch(searchDraft)}
            >
              {locale === "zh" ? "搜索" : "Search"}
            </button>
            {appliedSearchQuery || selectedSearchTeacherId != null ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact"
                onClick={() => applySearch("")}
              >
                {locale === "zh" ? "清除" : "Clear"}
              </button>
            ) : null}
          </div>
        </div>

        {refreshing && teachers.length > 0 ? (
          <p className="hint">{locale === "zh" ? "同步中…" : "Syncing…"}</p>
        ) : null}

        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : teachers.length === 0 ? (
          <p className="hint">{locale === "zh" ? "暂无老师" : "No teachers yet"}</p>
        ) : filteredTeachers.length === 0 ? (
          <p className="hint admin-jpl-search-empty" role="status">
            {locale === "zh" ? "查无此人" : "No such teacher found."}
          </p>
        ) : (
          <div className="admin-jpl-teachers-table-wrap">
            <table className="admin-jpl-teachers-table">
              <thead>
                <tr>
                  <th className="col-id col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "id" ? " is-active" : ""}`}
                      onClick={() => toggleSort("id")}
                    >
                      ID
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "id" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-name col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "name" ? " is-active" : ""}`}
                      onClick={() => toggleSort("name")}
                    >
                      {locale === "zh" ? "名称" : "Name"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "name" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-lesson-count col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "lessonCount" ? " is-active" : ""}`}
                      onClick={() => toggleSort("lessonCount")}
                    >
                      {locale === "zh" ? "上课频次" : "Lessons"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "lessonCount" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-rate col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "rate" ? " is-active" : ""}`}
                      onClick={() => toggleSort("rate")}
                    >
                      {locale === "zh" ? "课时费" : "Rate (RMB)"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "rate" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-minutes col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "minutes" ? " is-active" : ""}`}
                      onClick={() => toggleSort("minutes")}
                    >
                      {locale === "zh" ? "课时时长" : "Duration"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "minutes" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th
                    className={`col-hourly-equiv col-hourly-equiv--sortable${
                      sortKey === "hourlyEquiv" && sortOrder === "asc"
                        ? " col-hourly-equiv--sorted-asc"
                        : sortKey === "hourlyEquiv" && sortOrder === "desc"
                          ? " col-hourly-equiv--sorted-desc"
                          : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "hourlyEquiv" ? " is-active" : ""}`}
                      onClick={() => toggleSort("hourlyEquiv")}
                    >
                      {locale === "zh" ? "折合时薪" : "Hourly"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "hourlyEquiv" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th
                    className={`col-score col-score--sortable${
                      sortKey === "score" && sortOrder === "asc"
                        ? " col-score--sorted-asc"
                        : sortKey === "score"
                          ? " col-score--sorted-desc"
                          : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "score" ? " is-active" : ""}`}
                      onClick={() => toggleSort("score")}
                    >
                      {locale === "zh" ? "平均评分" : "Avg"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "score" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-remark col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "remark" ? " is-active" : ""}`}
                      onClick={() => toggleSort("remark")}
                    >
                      {locale === "zh" ? "备注" : "Latest note"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "remark" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-updated col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "updated" ? " is-active" : ""}`}
                      onClick={() => toggleSort("updated")}
                    >
                      {locale === "zh" ? "更新" : "Updated"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {sortKey === "updated" ? (sortOrder === "asc" ? "↑" : "↓") : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="col-actions">{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map((teacher) => {
                  const isEditing = editingId === teacher.id;
                  const summary = reviewSummaries.get(teacher.id);
                  const latestRemark = summary?.latest_remark ?? null;
                  const latestClassDate = summary?.latest_class_date ?? null;
                  const linkedUser = teacher.linked_user ?? null;
                  const userActionBusy = creatingUserTeacherId === teacher.id;
                  return (
                    <tr
                      key={teacher.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(teacher.id, node);
                        else rowRefs.current.delete(teacher.id);
                      }}
                      className={
                        highlightTeacherId === teacher.id
                          ? "admin-jpl-teacher-row--highlight"
                          : undefined
                      }
                    >
                      <td className="col-id" data-label={fieldLabels.id}>
                        {teacher.id}
                      </td>
                      <td className="col-name" data-label={fieldLabels.name}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            disabled={saving}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          <>
                            {linkedUser ? (
                              <a
                                href={adminUsersPath(locale, linkedUser.id)}
                                className="admin-jpl-teacher-user-link"
                                title={
                                  locale === "zh"
                                    ? `查看用户 ${linkedUser.username}`
                                    : `View user ${linkedUser.username}`
                                }
                              >
                                {teacher.name}
                              </a>
                            ) : (
                              <span>{teacher.name}</span>
                            )}
                            <span className="admin-jpl-mobile-id">#{teacher.id}</span>
                          </>
                        )}
                      </td>
                      <td className="col-lesson-count" data-label={fieldLabels.lessonCount}>
                        {teacher.lesson_count ?? 0}
                      </td>
                      <td className="col-rate" data-label={fieldLabels.rate}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editHourlyRate}
                            disabled={saving}
                            placeholder="RMB"
                            onChange={(e) => {
                              const next = e.target.value;
                              setEditHourlyRate(next);
                              setEditLessonMinutes(
                                defaultLessonMinutesWhenRateSet(next, editLessonMinutes)
                              );
                            }}
                          />
                        ) : (
                          formatTeacherRateRmbOnly(resolveLessonTeacherRateFields(teacher).hourly_rate)
                        )}
                      </td>
                      <td className="col-minutes" data-label={fieldLabels.minutes}>
                        {isEditing ? (
                          <select
                            value={editLessonMinutes}
                            disabled={saving}
                            aria-label={
                              locale === "zh"
                                ? `${teacher.name} 单次课时长`
                                : `${teacher.name} lesson duration`
                            }
                            onChange={(e) => setEditLessonMinutes(e.target.value)}
                          >
                            <option value="">
                              {locale === "zh" ? "未设置" : "Unset"}
                            </option>
                            {LESSON_MINUTE_OPTIONS.map((minutes) => (
                              <option key={minutes} value={minutes}>
                                {formatLessonMinuteOptionLabel(minutes, locale)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          formatTeacherLessonMinutes(
                            resolveLessonTeacherRateFields(teacher).lesson_minutes,
                            locale
                          )
                        )}
                      </td>
                      <td className="col-hourly-equiv" data-label={fieldLabels.hourlyEquiv}>
                        {(() => {
                          const equiv = calcEquivalentHourlyRate(teacher);
                          if (equiv == null) return "—";
                          const display = equiv % 1 === 0 ? equiv.toFixed(0) : equiv.toFixed(2);
                          return `${display}/h`;
                        })()}
                      </td>
                      <td className="col-score" data-label={fieldLabels.score}>
                        {summary && summary.review_count > 0 && summary.avg_score != null ? (
                          <span
                            className={`etr-score-badge ${scoreClass(summary.avg_score)}`}
                            title={locale === "zh" ? "已评价" : "Reviewed"}
                          >
                            {summary.avg_score} {locale === "zh" ? "分" : "pts"}
                          </span>
                        ) : (
                          <span className="col-remark--empty">—</span>
                        )}
                      </td>
                      <td
                        className={`col-remark${!latestRemark ? " col-remark--empty" : ""}`}
                        data-label={fieldLabels.remark}
                        title={latestRemark ?? undefined}
                      >
                        {latestRemark ? (
                          <button
                            type="button"
                            className="admin-jpl-remark-box"
                            title={locale === "zh" ? "点击查看评价" : "View review"}
                            onClick={() => setReviewTeacher(teacher)}
                          >
                            {latestClassDate ? (
                              <span className="admin-jpl-remark-date">{latestClassDate}</span>
                            ) : null}
                            <span className="admin-jpl-remark-preview">{latestRemark}</span>
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="col-updated" data-label={fieldLabels.updated}>
                        {formatBeijingDateTime(teacher.updated_at)}
                      </td>
                      <td className="col-actions" data-label={fieldLabels.actions}>
                        <div className="etr-form-actions etr-form-actions--inline">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                disabled={saving || !editName.trim()}
                                onClick={() => void saveEdit()}
                              >
                                {locale === "zh" ? "保存" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                disabled={saving}
                                onClick={cancelEdit}
                              >
                                {locale === "zh" ? "取消" : "Cancel"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={`btn-rsi-filter btn-rsi-filter--compact${
                                  linkedUser
                                    ? ""
                                    : " btn-rsi-filter--primary"
                                }`}
                                disabled={
                                  userActionBusy ||
                                  linkedUser != null ||
                                  lessonTeacherSubjectSkipsUserAccount(teacherSubject)
                                }
                                onClick={() => void createTeacherUser(teacher)}
                                title={
                                  lessonTeacherSubjectSkipsUserAccount(teacherSubject)
                                    ? locale === "zh"
                                      ? `${lessonTeacherSubjectLabel(teacherSubject, locale)}不提供系统登录账号`
                                      : `${lessonTeacherSubjectLabel(teacherSubject, locale)} do not get system login accounts`
                                    : linkedUser
                                    ? locale === "zh"
                                      ? `已关联 ${linkedUser.username}；点击老师名称可跳转到用户管理`
                                      : `Linked as ${linkedUser.username}; click the teacher name to view in Users`
                                    : teacherSubject === "ko"
                                      ? locale === "zh"
                                        ? "创建韩语教师账号并关联（开课前 30 分钟启用）"
                                        : "Create and link Korean-teacher account"
                                      : locale === "zh"
                                      ? "创建日语教师账号并关联"
                                      : "Create and link Japanese-teacher account"
                                }
                              >
                                {userActionBusy
                                  ? locale === "zh"
                                    ? "创建中…"
                                    : "Creating…"
                                  : linkedUser
                                    ? locale === "zh"
                                      ? "已生成"
                                      : "Created"
                                    : locale === "zh"
                                      ? "创建用户"
                                      : "Create user"}
                              </button>
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--primary btn-rsi-filter--compact"
                                onClick={() => setReviewTeacher(teacher)}
                              >
                                {locale === "zh" ? "评价" : "Review"}
                              </button>
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--compact"
                                onClick={() => startEdit(teacher)}
                              >
                                {locale === "zh" ? "编辑" : "Edit"}
                              </button>
                              <button
                                type="button"
                                className="btn-rsi-filter btn-rsi-filter--danger btn-rsi-filter--compact"
                                onClick={() => void deleteTeacher(teacher.id, teacher.name)}
                              >
                                {locale === "zh" ? "删除" : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
  );
}
