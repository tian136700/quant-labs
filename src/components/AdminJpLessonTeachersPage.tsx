"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { EnLessonTeacherReviewModal } from "@/components/EnLessonTeacherReviewModal";
import { JpLessonTeacherReviewModal } from "@/components/JpLessonTeacherReviewModal";
import {
  adminPath,
  adminRbacPath,
  adminToolCodesPath,
  adminTrendsPath,
  adminUsersPath,
  enLessonPath,
  jpLessonPath,
  parseLessonTeacherSubject,
  type LessonTeacherSubject,
} from "@/lib/locale-path";
import {
  formatAdminUserCredentials,
  rememberAdminUserPassword,
} from "@/lib/admin-user-credentials";
import type { JpLessonTeacher, JpLessonTeacherReviewSummary } from "@/lib/types";
import {
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

function teachersApiBase(subject: LessonTeacherSubject): string {
  return subject === "en" ? "/api/admin/en-lesson-teachers" : "/api/admin/jp-lesson-teachers";
}

function teacherReviewApiBase(subject: LessonTeacherSubject): string {
  return subject === "en"
    ? "/api/admin/en-lesson-teacher-review"
    : "/api/admin/jp-lesson-teacher-review";
}

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

type SortOrder = "asc" | "desc";
type TeacherSortKey =
  | "id"
  | "name"
  | "rate"
  | "minutes"
  | "hourlyEquiv"
  | "score"
  | "remark"
  | "updated";

/** 按课时费和课时时长计算折合时薪：hourly_rate / lesson_minutes * 60 */
function calcEquivalentHourlyRate(teacher: JpLessonTeacher): number | null {
  const resolved = resolveLessonTeacherRateFields(teacher);
  if (resolved.hourly_rate == null || resolved.lesson_minutes == null) return null;
  if (resolved.lesson_minutes <= 0) return null;
  return Math.round((resolved.hourly_rate / resolved.lesson_minutes) * 60 * 100) / 100;
}

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

function formatTeacherRateRmbOnly(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 100) / 100;
  const num = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
  return `${num} RMB`;
}

function compareNullableNumber(a: number | null, b: number | null, order: SortOrder): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return order === "desc" ? b - a : a - b;
}

function compareString(a: string, b: string, order: SortOrder): number {
  const result = a.localeCompare(b, "zh-CN", { sensitivity: "base" });
  return order === "desc" ? -result : result;
}

function nextSortOrder(currentKey: TeacherSortKey, key: TeacherSortKey, current: SortOrder): SortOrder {
  if (currentKey === key) return current === "asc" ? "desc" : "asc";
  if (key === "name" || key === "remark") return "asc";
  return "desc";
}

export function AdminJpLessonTeachersPageContent() {
  const { locale, t } = useI18n();
  const { isAdmin, checking } = useEtrAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teacherSubject = useMemo(
    () => parseLessonTeacherSubject(searchParams.get("subject")),
    [searchParams]
  );
  const focusTeacherId = useMemo(() => {
    const raw = searchParams.get("teacher");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [highlightTeacherId, setHighlightTeacherId] = useState<number | null>(null);
  const nav = t("nav");
  const addNameInputRef = useRef<HTMLInputElement | null>(null);

  const [teachers, setTeachers] = useState<JpLessonTeacher[]>(() => readJpLessonTeachersCache());
  const [loading, setLoading] = useState(() => readJpLessonTeachersCache().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
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
  const [creatingUserTeacherId, setCreatingUserTeacherId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<TeacherSortKey>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const switchTeacherSubject = useCallback(
    (next: LessonTeacherSubject) => {
      if (next === teacherSubject) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "en") params.set("subject", "en");
      else params.delete("subject");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams, teacherSubject]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.title = locale === "zh" ? "上课老师管理" : "Lesson teachers";
  }, [locale]);

  useEffect(() => {
    if (!addModalOpen) return;
    const timer = window.setTimeout(() => {
      addNameInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [addModalOpen]);

  const loadReviewSummaries = useCallback(async (opts?: { force?: boolean }) => {
    if (teacherSubject === "jp") {
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
    } else {
      setReviewSummaries(new Map());
    }

    try {
      const res = await fetch(`${teacherReviewApiBase(teacherSubject)}?summary=1`, {
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
      if (teacherSubject === "jp") {
        syncJpLessonTeacherReviewCache(data.summaries ?? []);
      }
    } catch {
      /* summary is optional; ignore load errors */
    }
  }, [teacherSubject]);

  const loadTeachers = useCallback(async (opts?: { force?: boolean }) => {
    const cached = teacherSubject === "jp" ? readJpLessonTeachersCache() : [];
    const hasCache = cached.length > 0;
    const cacheAge = readClientCacheAge(JP_LESSON_CACHE_KEY);
    const cacheFresh =
      teacherSubject === "jp" &&
      !opts?.force &&
      hasCache &&
      cacheAge != null &&
      cacheAge < JP_LESSON_REFRESH_TTL_MS;

    if (hasCache) {
      setTeachers(cached);
      setLoading(false);
      if (!cacheFresh) setRefreshing(true);
    } else {
      setTeachers([]);
      setLoading(true);
    }

    try {
      const tasks: Promise<void>[] = [loadReviewSummaries(opts)];

      if (!cacheFresh) {
        tasks.push(
          (async () => {
            const res = await fetch(teachersApiBase(teacherSubject), {
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
            if (teacherSubject === "jp") {
              syncJpLessonTeachersCache(list);
            }
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
  }, [loadReviewSummaries, teacherSubject]);

  useEffect(() => {
    setEditingId(null);
    setEditName("");
    setEditHourlyRate("");
    setEditLessonMinutes("");
    setEditSortOrder(0);
    setReviewTeacher(null);
    if (!checking && isAdmin) void loadTeachers({ force: true });
  }, [checking, isAdmin, teacherSubject, loadTeachers]);

  /** 与日语新课页共用 localStorage 老师缓存；切回此页时合并新课页刚保存的数据 */
  useEffect(() => {
    if (teacherSubject !== "jp") return;
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
  }, [teacherSubject]);

  const sortedTeachers = useMemo(() => {
    const getScore = (teacherId: number): number | null => {
      const summary = reviewSummaries.get(teacherId);
      if (!summary || summary.review_count <= 0 || summary.avg_score == null) return null;
      return summary.avg_score;
    };

    return [...teachers].sort((a, b) => {
      const resolvedA = resolveLessonTeacherRateFields(a);
      const resolvedB = resolveLessonTeacherRateFields(b);
      const remarkA = reviewSummaries.get(a.id)?.latest_remark?.trim() ?? "";
      const remarkB = reviewSummaries.get(b.id)?.latest_remark?.trim() ?? "";
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      const comparableDateA = Number.isFinite(dateA) ? dateA : null;
      const comparableDateB = Number.isFinite(dateB) ? dateB : null;

      let result = 0;
      switch (sortKey) {
        case "id":
          result = compareNullableNumber(a.id, b.id, sortOrder);
          break;
        case "name":
          result = compareString(resolvedA.name, resolvedB.name, sortOrder);
          break;
        case "rate":
          result = compareNullableNumber(resolvedA.hourly_rate, resolvedB.hourly_rate, sortOrder);
          break;
        case "minutes":
          result = compareNullableNumber(
            resolvedA.lesson_minutes,
            resolvedB.lesson_minutes,
            sortOrder
          );
          break;
        case "hourlyEquiv":
          result = compareNullableNumber(
            calcEquivalentHourlyRate(a),
            calcEquivalentHourlyRate(b),
            sortOrder
          );
          break;
        case "score":
          result = compareNullableNumber(getScore(a.id), getScore(b.id), sortOrder);
          break;
        case "remark":
          result = compareString(remarkA, remarkB, sortOrder);
          break;
        case "updated":
          result = compareNullableNumber(comparableDateA, comparableDateB, sortOrder);
          break;
      }
      if (result !== 0) return result;
      return a.sort_order - b.sort_order || a.id - b.id;
    });
  }, [reviewSummaries, sortKey, sortOrder, teachers]);

  const filteredTeachers = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return sortedTeachers;
    return sortedTeachers.filter((teacher) => {
      const summary = reviewSummaries.get(teacher.id);
      const resolved = resolveLessonTeacherRateFields(teacher);
      const haystack = [
        String(teacher.id),
        teacher.name,
        resolved.name,
        summary?.latest_remark ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [reviewSummaries, searchQuery, sortedTeachers]);

  useEffect(() => {
    if (focusTeacherId == null || loading) return;
    if (!teachers.some((teacher) => teacher.id === focusTeacherId)) return;
    if (!filteredTeachers.some((teacher) => teacher.id === focusTeacherId)) {
      setSearchQuery("");
    }
  }, [focusTeacherId, filteredTeachers, loading, teachers]);

  useEffect(() => {
    if (focusTeacherId == null || loading || teachers.length === 0) return;
    const row = rowRefs.current.get(focusTeacherId);
    if (!row) return;
    setHighlightTeacherId(focusTeacherId);
    window.requestAnimationFrame(() => {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlightTeacherId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [focusTeacherId, filteredTeachers, loading, teachers]);

  const toggleSort = useCallback((key: TeacherSortKey) => {
    setSortOrder((prevOrder) => nextSortOrder(sortKey, key, prevOrder));
    setSortKey(key);
  }, [sortKey]);

  const fieldLabels =
    locale === "zh"
      ? {
          id: "ID",
          name: "名称",
          rate: "课时费 (RMB)",
          minutes: "课时时长",
          hourlyEquiv: "折合时薪",
          score: "平均评分",
          remark: "最近备注",
          updated: "更新时间",
          actions: "操作",
        }
      : {
          id: "ID",
          name: "Name",
          rate: "Rate (RMB)",
          minutes: "Duration",
          hourlyEquiv: "Hourly equiv.",
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
      const res = await fetch(teachersApiBase(teacherSubject), {
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
        if (teacherSubject === "jp") {
          for (const item of data.renamed_teachers ?? []) {
            upsertJpLessonTeacherCache(normalizeJpLessonTeacher(item));
          }
          upsertJpLessonTeacherCache(teacher);
          setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
        } else {
          setTeachers((prev) => [...prev.filter((item) => item.id !== teacher.id), teacher]);
        }
      }
      setNewName("");
      setNewHourlyRate("");
      setNewLessonMinutes("");
      setAddModalOpen(false);
      if (data.user_account) {
        rememberAdminUserPassword(data.user_account.id, data.user_account.password);
        setStatus(
          locale === "zh"
            ? `已添加。已自动创建禁用账号：${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                locale
              )}（请在用户管理中启用后再登录）`
            : `Added. Auto-created disabled account: ${formatAdminUserCredentials(
                data.user_account.username,
                data.user_account.password,
                locale
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
      const res = await fetch(teachersApiBase(teacherSubject), {
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
        if (teacherSubject === "jp") {
          upsertJpLessonTeacherCache(teacher);
          setTeachers((prev) => mergeJpLessonTeachersCache(prev, [teacher]));
        } else {
          setTeachers((prev) => prev.map((item) => (item.id === teacher.id ? teacher : item)));
        }
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
      const res = await fetch(`${teachersApiBase(teacherSubject)}?id=${id}`, {
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
      if (teacherSubject === "jp") {
        removeJpLessonTeacherCache(id);
      }
      setTeachers((prev) => prev.filter((teacher) => teacher.id !== id));
      setStatus("已删除");
      setStatusErr(false);
    } catch {
      setStatus("删除失败");
      setStatusErr(true);
    }
  };

function mapCreateTeacherUserError(err: string, locale: "zh" | "en"): string {
  if (err === "user_exists" || err === "username_taken") {
    return locale === "zh"
      ? "用户名已被占用，请在用户管理中手动关联"
      : "Username taken; link manually in Users";
  }
  if (err === "username_unavailable") {
    return locale === "zh" ? "无法生成可用用户名" : "Could not derive a valid username";
  }
  if (err === "username_invalid" || err === "teacher_name_empty") {
    return locale === "zh"
      ? "老师名称无效，无法生成用户名"
      : "Invalid teacher name; cannot derive username";
  }
  if (/Cannot read properties of|reading 'length'|reading 'map'|reading 'trim'/i.test(err)) {
    return locale === "zh"
      ? "创建账号时内部错误，请刷新后重试；仍失败请到用户管理手动创建"
      : "Internal error while creating account; refresh and retry, or create manually in Users";
  }
  return err;
}

  const createTeacherUser = async (teacher: JpLessonTeacher) => {
    if (teacherSubject !== "jp") return;
    const ok = window.confirm(
      locale === "zh"
        ? `为「${teacher.name}」一键创建日语教师账号？\n用户名将按老师名拼音生成（如李老师 → LiLaoshi），密码为易记的英文词组组合。`
        : `Create a Japanese-teacher account for "${teacher.name}"?\nUsername will be pinyin (e.g. LiLaoshi); password is a memorable word combo.`
    );
    if (!ok) return;

    setCreatingUserTeacherId(teacher.id);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/jp-lesson-teachers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_user", id: teacher.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: boolean;
        user?: { id: number; username: string; disabled: boolean };
        password?: string;
        error?: string;
      };
      if (!data.ok || !data.user) {
        const err = data.error ?? "create failed";
        setStatus(mapCreateTeacherUserError(String(err), locale));
        setStatusErr(true);
        return;
      }

      const linkedUser = { id: data.user.id, username: data.user.username };
      setTeachers((prev) =>
        prev.map((item) =>
          item.id === teacher.id ? { ...item, linked_user: linkedUser } : item
        )
      );
      if (data.password) {
        rememberAdminUserPassword(data.user.id, data.password);
      }

      const creds =
        data.password != null
          ? formatAdminUserCredentials(
              data.user.username,
              data.password,
              locale
            )
          : data.user.username;

      setStatus(
        data.created
          ? locale === "zh"
            ? `已创建并关联账号：${creds}`
            : `Account created and linked: ${creds}`
          : locale === "zh"
            ? `已关联已有账号：${data.user.username}`
            : `Linked existing account: ${data.user.username}`
      );
      setStatusErr(false);
    } catch {
      setStatus(locale === "zh" ? "创建账号失败" : "Failed to create account");
      setStatusErr(true);
    } finally {
      setCreatingUserTeacherId(null);
    }
  };

  const closeAddModal = useCallback(() => {
    if (saving) return;
    setAddModalOpen(false);
  }, [saving]);

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
          {teacherSubject === "en"
            ? locale === "zh"
              ? "维护英语新课的上课老师列表；仅管理员可在新课页面看到并分配。英语老师评价已合并到本页。"
              : "Manage English lesson teachers. Teacher reviews are managed here."
            : locale === "zh"
              ? "维护日语新课的上课老师列表；仅管理员可在新课页面看到并分配。"
              : "Manage lesson teachers for JP lessons. Only admins can assign them."}
        </p>
        <div className="admin-jpl-subject-switch">
          <label htmlFor="admin-jpl-teacher-subject">
            {locale === "zh" ? "老师类型" : "Teacher type"}
          </label>
          <select
            id="admin-jpl-teacher-subject"
            value={teacherSubject}
            onChange={(event) =>
              switchTeacherSubject(parseLessonTeacherSubject(event.target.value))
            }
          >
            <option value="jp">{locale === "zh" ? "日语老师" : "Japanese teachers"}</option>
            <option value="en">{locale === "zh" ? "英语老师" : "English teachers"}</option>
          </select>
        </div>
        <p className="hint">
          <a href={adminPath(locale)}>{locale === "zh" ? "← 返回后台管理" : "← Back to admin"}</a>
          {" · "}
          <a href={teacherSubject === "en" ? enLessonPath() : jpLessonPath()}>
            {teacherSubject === "en"
              ? locale === "zh"
                ? "英语新课"
                : "English lessons"
              : locale === "zh"
                ? "日语新课"
                : "JP lessons"}
          </a>
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

      <section className="section etr-panel admin-rbac-section">
        <div className="etr-history-head admin-jpl-teachers-head">
          <h2>{locale === "zh" ? "老师列表" : "Teachers"}</h2>
          <div className="admin-jpl-teachers-toolbar">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary btn-rsi-filter--compact"
              onClick={() => setAddModalOpen(true)}
            >
              {locale === "zh" ? "添加老师" : "Add teacher"}
            </button>
            <label className="admin-jpl-search-field" htmlFor="admin-jpl-teacher-search">
              <span className="sr-only">
                {locale === "zh" ? "搜索老师" : "Search teachers"}
              </span>
              <input
                id="admin-jpl-teacher-search"
                type="text"
                value={searchQuery}
                placeholder={
                  locale === "zh"
                    ? "按老师名称、ID、备注搜索"
                    : "Search by name, ID, or note"
                }
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
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
        ) : filteredTeachers.length === 0 ? (
          <p className="hint">
            {locale === "zh" ? "没有匹配的老师，请调整搜索关键词。" : "No matching teachers."}
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
                  <th className="col-rate col-score--sortable">
                    <button
                      type="button"
                      className={`etr-sort-btn admin-jpl-score-sort-btn${sortKey === "rate" ? " is-active" : ""}`}
                      onClick={() => toggleSort("rate")}
                    >
                      {locale === "zh" ? "课时费 (RMB)" : "Rate (RMB)"}
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
                      {locale === "zh" ? "最近备注" : "Latest note"}
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
                      {locale === "zh" ? "更新时间" : "Updated"}
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
                              setEditLessonMinutes((prev) =>
                                defaultLessonMinutesWhenRateSet(next, prev)
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
                                  userActionBusy || linkedUser != null || teacherSubject === "en"
                                }
                                onClick={() => void createTeacherUser(teacher)}
                                title={
                                  teacherSubject === "en"
                                    ? locale === "zh"
                                      ? "添加英语老师时已自动创建禁用账号"
                                      : "Disabled account is auto-created when adding an English teacher"
                                    : linkedUser
                                    ? locale === "zh"
                                      ? `已关联 ${linkedUser.username}；点击老师名称可跳转到用户管理`
                                      : `Linked as ${linkedUser.username}; click the teacher name to view in Users`
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
                                      ? "一键创建用户"
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

      {teacherSubject === "en" ? (
        <EnLessonTeacherReviewModal
          open={reviewTeacher != null}
          teacher={reviewTeacher}
          locale={locale}
          onClose={() => setReviewTeacher(null)}
          onChanged={() => void loadReviewSummaries({ force: true })}
        />
      ) : (
        <JpLessonTeacherReviewModal
          open={reviewTeacher != null}
          teacher={reviewTeacher}
          locale={locale}
          onClose={() => setReviewTeacher(null)}
          onChanged={() => void loadReviewSummaries({ force: true })}
        />
      )}

      {mounted && addModalOpen
        ? createPortal(
            <div
              className="jp-lesson-teacher-overlay"
              role="presentation"
              onClick={closeAddModal}
            >
              <div
                className="jp-lesson-teacher-modal admin-jpl-add-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-jpl-add-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="jp-lesson-teacher-header">
                  <div>
                    <h2 id="admin-jpl-add-title">
                      {locale === "zh" ? "添加老师" : "Add teacher"}
                    </h2>
                    <p className="jp-lesson-teacher-modal-lesson">
                      {locale === "zh"
                        ? "新增老师后可在列表中「一键创建用户」；也可在评价弹窗中勾选创建账号。"
                        : "After adding, use “Create user” in the list, or create from the review modal."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="jp-lesson-teacher-close"
                    aria-label={locale === "zh" ? "关闭" : "Close"}
                    disabled={saving}
                    onClick={closeAddModal}
                  >
                    ×
                  </button>
                </div>

                <form
                  className="admin-jpl-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createTeacher();
                  }}
                >
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "名称" : "Name"}</span>
                    <input
                      ref={addNameInputRef}
                      type="text"
                      value={newName}
                      disabled={saving}
                      placeholder={locale === "zh" ? "例如：周老师" : "e.g. Teacher Zhou"}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </label>
                  <label className="admin-user-add-field">
                    <span>{locale === "zh" ? "课时费（RMB/小时）" : "Rate (RMB/h)"}</span>
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
                  <p className="hint admin-user-add-hint">
                    {locale === "zh"
                      ? "老师列表支持「一键创建用户」（拼音用户名 + 易记密码）；评价弹窗中也可勾选创建。"
                      : "Use “Create user” on the teacher list (pinyin username + memorable password), or create from review."}
                  </p>
                  <div className="etr-form-actions etr-form-actions--inline">
                    <button
                      type="button"
                      className="btn-rsi-filter"
                      disabled={saving}
                      onClick={closeAddModal}
                    >
                      {locale === "zh" ? "取消" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="btn-rsi-filter btn-rsi-filter--primary"
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
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      <style jsx>{`
        .admin-jpl-teacher-user-link {
          color: var(--accent, #6eb5ff);
          font-weight: 600;
          text-decoration: none;
        }

        .admin-jpl-teacher-user-link:hover {
          text-decoration: underline;
        }

        .admin-jpl-subject-switch {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin: 0.75rem 0 0.35rem;
        }

        .admin-jpl-subject-switch label {
          font-size: 0.875rem;
          color: var(--muted);
        }

        .admin-jpl-subject-switch select {
          min-height: 2.25rem;
          padding: 0.35rem 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
        }

        .admin-jpl-search-field {
          flex: 1 1 15rem;
          min-width: min(100%, 15rem);
        }

        .admin-jpl-search-field input {
          min-height: 2.25rem;
          padding-block: 0.45rem;
        }

        .jp-lesson-teacher-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-lesson-teacher-modal {
          width: min(560px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-teacher-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-teacher-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-teacher-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-teacher-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .admin-jpl-add-form {
          display: grid;
          gap: 0.85rem;
        }
      `}</style>
    </div>
  );
}

export function AdminJpLessonTeachersPage() {
  return (
    <Suspense fallback={<div className="admin-page"><p className="hint">Loading…</p></div>}>
      <AdminJpLessonTeachersPageContent />
    </Suspense>
  );
}
