"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { JpLessonTeacherReviewModal } from "@/components/JpLessonTeacherReviewModal";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
  adminUsersPath,
  jpLessonPath,
} from "@/lib/locale-path";
import type { JpLessonTeacher, JpLessonTeacherReviewSummary } from "@/lib/types";
import { formatHourlyRate } from "@/lib/jp-lesson-teacher-rate";

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

type ScoreSortOrder = "asc" | "desc";

function compareTeachersByAvgScore(
  a: JpLessonTeacher,
  b: JpLessonTeacher,
  reviewSummaries: Map<number, JpLessonTeacherReviewSummary>,
  order: ScoreSortOrder
): number {
  const avgScore = (teacherId: number): number | null => {
    const summary = reviewSummaries.get(teacherId);
    if (!summary || summary.review_count <= 0 || summary.avg_score == null) return null;
    return summary.avg_score;
  };

  const scoreA = avgScore(a.id);
  const scoreB = avgScore(b.id);
  if (scoreA == null && scoreB == null) return a.sort_order - b.sort_order || a.id - b.id;
  if (scoreA == null) return 1;
  if (scoreB == null) return -1;
  if (scoreA !== scoreB) return order === "desc" ? scoreB - scoreA : scoreA - scoreB;
  return a.sort_order - b.sort_order || a.id - b.id;
}

export function AdminJpLessonTeachersPage() {
  const { locale } = useI18n();
  const { isAdmin, checking } = useEtrAuth();

  const [teachers, setTeachers] = useState<JpLessonTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [reviewSummaries, setReviewSummaries] = useState<
    Map<number, JpLessonTeacherReviewSummary>
  >(new Map());
  const [reviewTeacher, setReviewTeacher] = useState<JpLessonTeacher | null>(null);
  const [scoreSortOrder, setScoreSortOrder] = useState<ScoreSortOrder>("desc");

  useEffect(() => {
    document.title = locale === "zh" ? "上课老师管理" : "Lesson teachers";
  }, [locale]);

  const loadReviewSummaries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jp-lesson-teacher-review?summary=1", {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summaries?: JpLessonTeacherReviewSummary[];
      };
      if (!data.ok) return;
      const map = new Map<number, JpLessonTeacherReviewSummary>();
      for (const item of data.summaries ?? []) {
        map.set(item.teacher_id, item);
      }
      setReviewSummaries(map);
    } catch {
      /* summary is optional; ignore load errors */
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const [teachersRes, summariesRes] = await Promise.all([
        fetch("/api/admin/jp-lesson-teachers", { credentials: "include" }),
        fetch("/api/admin/jp-lesson-teacher-review?summary=1", {
          credentials: "include",
        }),
      ]);
      const data = (await teachersRes.json()) as {
        ok?: boolean;
        teachers?: JpLessonTeacher[];
        error?: string;
      };
      if (!data.ok) {
        setStatus(data.error || "加载失败");
        setStatusErr(true);
        return;
      }
      setTeachers(data.teachers ?? []);

      const summaryData = (await summariesRes.json()) as {
        ok?: boolean;
        summaries?: JpLessonTeacherReviewSummary[];
      };
      if (summaryData.ok) {
        const map = new Map<number, JpLessonTeacherReviewSummary>();
        for (const item of summaryData.summaries ?? []) {
          map.set(item.teacher_id, item);
        }
        setReviewSummaries(map);
      }
    } catch {
      setStatus("加载失败");
      setStatusErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!checking && isAdmin) void loadTeachers();
  }, [checking, isAdmin, loadTeachers]);

  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) =>
      compareTeachersByAvgScore(a, b, reviewSummaries, scoreSortOrder)
    );
  }, [teachers, reviewSummaries, scoreSortOrder]);

  const toggleScoreSortOrder = useCallback(() => {
    setScoreSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const createTeacher = async () => {
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          hourly_rate: newHourlyRate.trim() ? Number(newHourlyRate) : null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user_account?: {
          id: number;
          username: string;
          password: string;
          disabled: boolean;
        };
      };
      if (!data.ok) {
        setStatus(
          data.error === "name_duplicate" ? "老师名称已存在" : data.error || "添加失败"
        );
        setStatusErr(true);
        return;
      }
      setNewName("");
      setNewHourlyRate("");
      if (data.user_account) {
        rememberAdminUserPassword(data.user_account.id, data.user_account.password);
        setStatus(
          locale === "zh"
            ? `已添加。已自动创建禁用账号：${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                "zh"
              )}（请在用户管理中启用后再登录）`
            : `Added. Auto-created disabled account: ${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                "en"
              )} (enable in Users before login)`
        );
      } else {
        setStatus(locale === "zh" ? "已添加" : "Added");
      }
      setStatusErr(false);
      void loadTeachers();
    } catch {
      setStatus("添加失败");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (teacher: JpLessonTeacher) => {
    setEditingId(teacher.id);
    setEditName(teacher.name);
    setEditHourlyRate(
      teacher.hourly_rate != null ? String(teacher.hourly_rate) : ""
    );
    setEditSortOrder(teacher.sort_order);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditHourlyRate("");
    setEditSortOrder(0);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          name: editName,
          hourly_rate: editHourlyRate.trim() ? Number(editHourlyRate) : null,
          sort_order: editSortOrder,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(
          data.error === "name_duplicate" ? "老师名称已存在" : data.error || "保存失败"
        );
        setStatusErr(true);
        return;
      }
      cancelEdit();
      setStatus("已保存");
      setStatusErr(false);
      void loadTeachers();
    } catch {
      setStatus("保存失败");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const deleteTeacher = async (id: number, name: string) => {
    if (!confirm(`确定删除「${name}」？已关联的新课将变为未指定。`)) return;
    try {
      const res = await fetch(`/api/admin/jp-lesson-teachers?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || "删除失败");
        setStatusErr(true);
        return;
      }
      if (editingId === id) cancelEdit();
      setStatus("已删除");
      setStatusErr(false);
      void loadTeachers();
    } catch {
      setStatus("删除失败");
      setStatusErr(true);
    }
  };

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title={locale === "zh" ? "上课老师管理" : "Lesson teachers"}
        required={locale === "zh" ? "需要管理员权限" : "Admin access required"}
        login={locale === "zh" ? "登录" : "Log in"}
        registered={!checking && isAdmin}
      />
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{locale === "zh" ? "上课老师管理" : "Lesson teachers"}</h1>
        <p className="sub">
          {locale === "zh"
            ? "维护日语新课的上课老师列表；仅管理员可在新课页面看到并分配。"
            : "Manage lesson teachers for JP lessons. Only admins can assign them."}
        </p>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={jpLessonPath()}>{locale === "zh" ? "日语新课" : "JP lessons"}</a>
          {" · "}
          <a href={adminUsersPath(locale)}>{locale === "zh" ? "用户管理" : "Users"}</a>
          {" · "}
          <a href={adminTrendsPath(locale)}>{locale === "zh" ? "趋势抓取" : "Trends"}</a>
          {" · "}
          <a href={adminRbacPath(locale)}>{locale === "zh" ? "角色权限" : "Roles"}</a>
          {" · "}
          <a href={adminToolCodesPath(locale)}>{locale === "zh" ? "工具发码" : "Tool codes"}</a>
        </p>
      </div>

      {status ? (
        <p className={statusErr ? "telegram-push-result telegram-push-result--err" : "hint"}>
          {status}
        </p>
      ) : null}

      <section className="section etr-panel admin-rbac-section admin-user-add-section">
        <h2 className="admin-user-add-title">
          {locale === "zh" ? "添加老师" : "Add teacher"}
        </h2>
        <form
          className="admin-user-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void createTeacher();
          }}
        >
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "名称" : "Name"}</span>
            <input
              type="text"
              value={newName}
              disabled={saving}
              placeholder={locale === "zh" ? "例如：周老师" : "e.g. Teacher Zhou"}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "课时费（元/小时）" : "Rate (per hour)"}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newHourlyRate}
              disabled={saving}
              placeholder={locale === "zh" ? "选填" : "Optional"}
              onChange={(e) => setNewHourlyRate(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn-rsi-filter btn-rsi-filter--primary admin-user-add-submit"
            disabled={saving || !newName.trim()}
          >
            {saving
              ? locale === "zh"
                ? "提交中…"
                : "Saving…"
              : locale === "zh"
                ? "添加"
                : "Add"}
          </button>
        </form>
        <p className="hint admin-user-add-hint">
          {locale === "zh"
            ? "添加后将自动在用户管理中创建禁用的日语教师账号（用户名取自称呼的拼音，随机密码）。启用账号后老师方可登录。"
            : "A disabled Japanese-teacher account is auto-created in Users (username from pinyin of the name, random password). Enable it before the teacher can log in."}
        </p>
      </section>

      <section className="section etr-panel admin-rbac-section">
        <div className="etr-history-head">
          <h2>{locale === "zh" ? "老师列表" : "Teachers"}</h2>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={() => void loadTeachers()}
            disabled={loading}
          >
            {locale === "zh" ? "刷新" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="hint">{locale === "zh" ? "加载中…" : "Loading…"}</p>
        ) : teachers.length === 0 ? (
          <p className="hint">{locale === "zh" ? "暂无老师" : "No teachers yet"}</p>
        ) : (
          <div className="admin-jpl-teachers-table-wrap">
            <table className="admin-jpl-teachers-table">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-name">{locale === "zh" ? "名称" : "Name"}</th>
                  <th className="col-rate">{locale === "zh" ? "课时费" : "Rate"}</th>
                  <th
                    className={`col-score col-score--sortable${
                      scoreSortOrder === "asc"
                        ? " col-score--sorted-asc"
                        : " col-score--sorted-desc"
                    }`}
                  >
                    <button
                      type="button"
                      className="etr-sort-btn is-active admin-jpl-score-sort-btn"
                      title={
                        scoreSortOrder === "desc"
                          ? locale === "zh"
                            ? "按平均评分从高到低；点击切换为从低到高"
                            : "Avg score high to low; click for low to high"
                          : locale === "zh"
                            ? "按平均评分从低到高；点击切换为从高到低"
                            : "Avg score low to high; click for high to low"
                      }
                      aria-label={
                        scoreSortOrder === "desc"
                          ? locale === "zh"
                            ? "平均评分降序，点击切换为升序"
                            : "Avg score descending, click for ascending"
                          : locale === "zh"
                            ? "平均评分升序，点击切换为降序"
                            : "Avg score ascending, click for descending"
                      }
                      onClick={toggleScoreSortOrder}
                    >
                      {locale === "zh" ? "平均评分" : "Avg"}
                      <span className="admin-sort-indicator" aria-hidden="true">
                        {scoreSortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </th>
                  <th className="col-remark">{locale === "zh" ? "最近备注" : "Latest note"}</th>
                  <th className="col-updated">{locale === "zh" ? "更新时间" : "Updated"}</th>
                  <th className="col-actions">{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeachers.map((teacher) => {
                  const isEditing = editingId === teacher.id;
                  const summary = reviewSummaries.get(teacher.id);
                  const latestRemark = summary?.latest_remark ?? null;
                  const latestClassDate = summary?.latest_class_date ?? null;
                  return (
                    <tr key={teacher.id}>
                      <td className="col-id">{teacher.id}</td>
                      <td className="col-name">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            disabled={saving}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          teacher.name
                        )}
                      </td>
                      <td className="col-rate">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editHourlyRate}
                            disabled={saving}
                            placeholder={locale === "zh" ? "元/小时" : "Per hour"}
                            onChange={(e) => setEditHourlyRate(e.target.value)}
                          />
                        ) : (
                          formatHourlyRate(teacher.hourly_rate)
                        )}
                      </td>
                      <td className="col-score">
                        {summary && summary.review_count > 0 && summary.avg_score != null ? (
                          <span
                            className={`etr-score-badge ${scoreClass(summary.avg_score)}`}
                            title={
                              locale === "zh"
                                ? `${summary.review_count} 条评价`
                                : `${summary.review_count} review(s)`
                            }
                          >
                            {summary.avg_score} {locale === "zh" ? "分" : "pts"}
                            <span className="admin-jpl-review-count">
                              ({summary.review_count})
                            </span>
                          </span>
                        ) : (
                          <span className="col-remark--empty">—</span>
                        )}
                      </td>
                      <td
                        className={`col-remark${!latestRemark ? " col-remark--empty" : ""}`}
                        title={latestRemark ?? undefined}
                      >
                        {latestRemark ? (
                          <button
                            type="button"
                            className="admin-jpl-remark-box"
                            title={locale === "zh" ? "点击查看全部评价" : "View all reviews"}
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
                      <td className="col-updated">{formatBeijingDateTime(teacher.updated_at)}</td>
                      <td className="col-actions">
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

      <JpLessonTeacherReviewModal
        open={reviewTeacher != null}
        teacher={reviewTeacher}
        locale={locale}
        onClose={() => setReviewTeacher(null)}
        onChanged={() => void loadReviewSummaries()}
      />
    </div>
  );
}
