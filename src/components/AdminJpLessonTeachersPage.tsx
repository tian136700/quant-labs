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
import {
  formatHourlyRate,
  formatTeacherLessonMinutes,
  normalizeJpLessonTeacher,
  resolveLessonTeacherRateFields,
} from "@/lib/jp-lesson-teacher-rate";
import {
  mergeJpLessonTeachersCache,
  readJpLessonTeachersCache,
  removeJpLessonTeacherCache,
  syncJpLessonTeachersCache,
  upsertJpLessonTeacherCache,
} from "@/lib/jp-lesson-teachers-cache";
import { JP_LESSON_CACHE_KEY, JP_LESSON_REFRESH_TTL_MS } from "@/lib/jp-api-cache";
import { readClientCacheAge } from "@/lib/client-swr-cache";
import {
  JP_LESSON_TEACHER_REVIEW_CACHE_KEY,
  JP_LESSON_TEACHER_REVIEW_TTL_MS,
  readJpLessonTeacherReviewCache,
  syncJpLessonTeacherReviewCache,
} from "@/lib/jp-lesson-teacher-review-cache";
import { JP_LESSON_CLASS_DURATION_MINUTES } from "@/lib/jp-lesson-shared";

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

type ScoreSortOrder = "asc" | "desc";

const LESSON_MINUTE_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES;
/** 填写「元/小时」课时费时，未选手动时长则默认按 1 小时计 */
const DEFAULT_HOURLY_LESSON_MINUTES = 60;

function formatLessonMinuteOptionLabel(minutes: number, locale: "zh" | "en"): string {
  if (locale === "zh" && minutes === 60) return "60 分钟（1 小时）";
  return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
}

function isPositiveHourlyRate(value: string): boolean {
  const rate = Number(value.trim());
  return Number.isFinite(rate) && rate > 0;
}

/** 有课时费且时长未选时，默认 1 小时 */
function defaultLessonMinutesWhenRateSet(
  hourlyRate: string,
  lessonMinutes: string
): string {
  if (!isPositiveHourlyRate(hourlyRate) || lessonMinutes.trim()) {
    return lessonMinutes;
  }
  return String(DEFAULT_HOURLY_LESSON_MINUTES);
}

function resolveLessonMinutesForSave(
  hourlyRate: string,
  lessonMinutes: string,
  fallback: number | null
): number | null {
  if (lessonMinutes.trim()) return Number(lessonMinutes);
  if (isPositiveHourlyRate(hourlyRate)) return DEFAULT_HOURLY_LESSON_MINUTES;
  return fallback;
}

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
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const nav = t("nav");

  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(() => readJpLessonTeachersCache());
  const [loading, setLoading] = useState(() => readJpLessonTeachersCache().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHourlyRate, setNewHourlyRate] = useState("");
  const [newLessonMinutes, setNewLessonMinutes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editLessonMinutes, setEditLessonMinutes] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [reviewSummaries, setReviewSummaries] = useState<
    Map<number, JpLessonTeacherReviewSummary>
  >(() => readJpLessonTeacherReviewCache());
  const [reviewTeacher, setReviewTeacher] = useState<JpLessonTeacher | null>(null);
  const [scoreSortOrder, setScoreSortOrder] = useState<ScoreSortOrder>("desc");

  useEffect(() => {
    document.title = locale === "zh" ? "上课老师管理" : "Lesson teachers";
  }, [locale]);

  const loadReviewSummaries = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readJpLessonTeacherReviewCache();
    const cacheAge = readClientCacheAge(JP_LESSON_TEACHER_REVIEW_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      cached.size > 0 &&
      cacheAge != null &&
      cacheAge < JP_LESSON_TEACHER_REVIEW_TTL_MS;

    if (cached.size > 0) {
      setReviewSummaries(cached);
    }
    if (cacheFresh) return;

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
      syncJpLessonTeacherReviewCache(data.summaries ?? []);
    } catch {
      /* summary is optional; ignore load errors */
    }
  }, []);

  const loadTeachers = useCallback(async (opts?: { force?: boolean }) => {
    const cached = readJpLessonTeachersCache();
    const hasCache = cached.length > 0;
    const cacheAge = readClientCacheAge(JP_LESSON_CACHE_KEY);
    const cacheFresh =
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_REFRESH_TTL_MS;

    if (hasCache) {
      setTeachers(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const tasks: Promise<void>[] = [loadReviewSummaries(opts)];

      if (!cacheFresh) {
        tasks.push(
          (async () => {
            const res = await fetch("/api/admin/jp-lesson-teachers", {
              credentials: "include",
            });
            const data = (await res.json()) as {
              ok?: boolean;
              teachers?: JpLessonTeacher[];
              error?: string;
            };
            if (!data.ok) {
              if (!hasCache) {
                setStatus(data.error || "加载失败");
                setStatusErr(true);
              }
              return;
            }
            const list = (data.teachers ?? []).map((teacher) =>
              normalizeJpLessonTeacher(teacher)
            );
            setTeachers(list);
            syncJpLessonTeachersCache(list);
          })()
        );
      }

      await Promise.all(tasks);
    } catch {
      if (!hasCache) {
        setStatus("加载失败");
        setStatusErr(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadReviewSummaries]);

  useEffect(() => {
    if (!checking && isAdmin) void loadTeachers();
  }, [checking, isAdmin, loadTeachers]);

  /** 与日语新课页共用 localStorage 老师缓存；切回此页时合并新课页刚保存的数据 */
  useEffect(() => {
    const refreshFromSharedCache = () => {
      const cached = readJpLessonTeachersCache();
      if (!cached.length) return;
      setTeachers((prev) => mergeJpLessonTeachersCache(prev, cached));
    };

    refreshFromSharedCache();

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshFromSharedCache();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) =>
      compareTeachersByAvgScore(a, b, reviewSummaries, scoreSortOrder)
    );
  }, [teachers, reviewSummaries, scoreSortOrder]);

  const toggleScoreSortOrder = useCallback(() => {
    setScoreSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const fieldLabels =
    locale === "zh"
      ? {
          id: "ID",
          name: "名称",
          rate: "课时费",
          minutes: "课时时长",
          score: "平均评分",
          remark: "最近备注",
          updated: "更新时间",
          actions: "操作",
        }
      : {
          id: "ID",
          name: "Name",
          rate: "Rate",
          minutes: "Duration",
          score: "Avg score",
          remark: "Latest note",
          updated: "Updated",
          actions: "Actions",
        };

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
          lesson_minutes: resolveLessonMinutesForSave(
            newHourlyRate,
            newLessonMinutes,
            null
          ),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        teacher?: JpLessonTeacher;
        renamed_teachers?: JpLessonTeacher[];
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
      if (data.teacher) {
        const teacher = normalizeJpLessonTeacher(data.teacher);
        for (const item of data.renamed_teachers ?? []) {
          upsertJpLessonTeacherCache(normalizeJpLessonTeacher(item));
        }
        upsertJpLessonTeacherCache(teacher);
        setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
      }
      setNewName("");
      setNewHourlyRate("");
      setNewLessonMinutes("");
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
    } catch {
      setStatus("添加失败");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (teacher: JpLessonTeacher) => {
    const resolved = resolveLessonTeacherRateFields(teacher);
    setEditingId(teacher.id);
    setEditName(resolved.name);
    setEditHourlyRate(
      resolved.hourly_rate != null ? String(resolved.hourly_rate) : ""
    );
    setEditLessonMinutes(
      resolved.lesson_minutes != null
        ? String(resolved.lesson_minutes)
        : resolved.hourly_rate != null
          ? String(DEFAULT_HOURLY_LESSON_MINUTES)
          : ""
    );
    setEditSortOrder(teacher.sort_order);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditHourlyRate("");
    setEditLessonMinutes("");
    setEditSortOrder(0);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    const original = teachers.find((t) => t.id === editingId);
    if (!original) return;
    const baseline = resolveLessonTeacherRateFields(original);
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
          hourly_rate: editHourlyRate.trim()
            ? Number(editHourlyRate)
            : baseline.hourly_rate,
          lesson_minutes: resolveLessonMinutesForSave(
            editHourlyRate,
            editLessonMinutes,
            baseline.lesson_minutes
          ),
          sort_order: editSortOrder,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        teacher?: JpLessonTeacher;
        error?: string;
      };
      if (!data.ok) {
        setStatus(
          data.error === "name_duplicate" ? "老师名称已存在" : data.error || "保存失败"
        );
        setStatusErr(true);
        return;
      }
      if (data.teacher) {
        const teacher = normalizeJpLessonTeacher(data.teacher);
        upsertJpLessonTeacherCache(teacher);
        setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
      }
      cancelEdit();
      setStatus("已保存");
      setStatusErr(false);
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
      removeJpLessonTeacherCache(id);
      setTeachers((prev) => prev.filter((teacher) => teacher.id !== id));
      setStatus("已删除");
      setStatusErr(false);
    } catch {
      setStatus("删除失败");
      setStatusErr(true);
    }
  };

  if (checking || !isAdmin) {
    return (
      <AdminAuthGate
        title={nav.adminJpLessonTeachers}
        required={locale === "zh" ? "需要管理员权限" : "Admin access required"}
        login={locale === "zh" ? "登录" : "Log in"}
        registered={!checking && isAdmin}
      />
    );
  }

  return (
    <div className="admin-page">
      <div className="page-hero">
        <h1>{nav.adminJpLessonTeachers}</h1>
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
              onChange={(e) => {
                const next = e.target.value;
                setNewHourlyRate(next);
                setNewLessonMinutes((prev) =>
                  defaultLessonMinutesWhenRateSet(next, prev)
                );
              }}
            />
          </label>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "单次课时长" : "Lesson duration"}</span>
            <select
              value={newLessonMinutes}
              disabled={saving}
              onChange={(e) => setNewLessonMinutes(e.target.value)}
            >
              <option value="">{locale === "zh" ? "选填" : "Optional"}</option>
              {LESSON_MINUTE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatLessonMinuteOptionLabel(minutes, locale)}
                </option>
              ))}
            </select>
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
        <div className="etr-history-head admin-jpl-teachers-head">
          <h2>{locale === "zh" ? "老师列表" : "Teachers"}</h2>
          <div className="admin-jpl-teachers-toolbar">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact admin-jpl-mobile-sort-btn"
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
              {fieldLabels.score}
              <span className="admin-sort-indicator" aria-hidden="true">
                {scoreSortOrder === "asc" ? "↑" : "↓"}
              </span>
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void loadTeachers({ force: true })}
              disabled={loading || refreshing}
            >
              {refreshing
                ? locale === "zh"
                  ? "同步中…"
                  : "Syncing…"
                : locale === "zh"
                  ? "刷新"
                  : "Refresh"}
            </button>
          </div>
        </div>

        {refreshing && teachers.length > 0 ? (
          <p className="hint">{locale === "zh" ? "同步中…" : "Syncing…"}</p>
        ) : null}

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
                  <th className="col-minutes">{locale === "zh" ? "课时时长" : "Duration"}</th>
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
                            <span>{teacher.name}</span>
                            <span className="admin-jpl-mobile-id">#{teacher.id}</span>
                          </>
                        )}
                      </td>
                      <td className="col-rate" data-label={fieldLabels.rate}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editHourlyRate}
                            disabled={saving}
                            placeholder={locale === "zh" ? "元/小时" : "Per hour"}
                            onChange={(e) => {
                              const next = e.target.value;
                              setEditHourlyRate(next);
                              setEditLessonMinutes((prev) =>
                                defaultLessonMinutesWhenRateSet(next, prev)
                              );
                            }}
                          />
                        ) : (
                          formatHourlyRate(
                            resolveLessonTeacherRateFields(teacher).hourly_rate
                          )
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
        onChanged={() => void loadReviewSummaries({ force: true })}
      />
    </div>
  );
}
