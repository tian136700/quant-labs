"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import {
  TeacherReviewAuth,
} from "@/components/TeacherReviewAuth";
import { TeacherReviewSeoContent } from "@/components/TeacherReviewSeoContent";
import {
  getEtrDemoRecords,
  sortEtrDemoRecords,
} from "@/lib/etr-demo-data";
import type {
  EnglishTeacherReviewRecord,
  EnglishTeacherReviewSortField,
} from "@/lib/types";

type SortOrder = "asc" | "desc";
type AuthPanelMode = "login" | "register" | null;

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type FormState = {
  id: string;
  teacher_name: string;
  class_date: string;
  score: string;
  remark: string;
};

function defaultOrderForField(field: EnglishTeacherReviewSortField): SortOrder {
  return field === "teacher_name" || field === "score" ? "asc" : "desc";
}

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

export function TeacherReviewPage() {
  const { locale, t } = useI18n();
  const tr = t("teacherReview");
  const demo = tr.demo;
  const formRef = useRef<HTMLFormElement>(null);

  const { user: authUser, checking: authChecking, setUser: setAuthUser, logout } =
    useEtrAuth();
  const [authPanel, setAuthPanel] = useState<AuthPanelMode>(null);

  const [form, setForm] = useState<FormState>({
    id: "",
    teacher_name: "",
    class_date: todayYmd(),
    score: "",
    remark: "",
  });
  const [records, setRecords] = useState<EnglishTeacherReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "ok" | "err">("");
  const [sortField, setSortField] = useState<EnglishTeacherReviewSortField>(
    "updated_at"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const isDemo = !authUser;

  const demoRecords = useMemo(
    () => sortEtrDemoRecords(getEtrDemoRecords(locale), sortField, sortOrder),
    [locale, sortField, sortOrder]
  );

  const displayRecords = isDemo ? demoRecords : records;

  useEffect(() => {
    document.title = tr.meta.title;
  }, [locale, tr.meta.title]);

  const openAuth = (mode: "login" | "register") => {
    setAuthPanel(mode);
    setStatus(demo.loginToSave);
    setStatusKind("err");
    window.setTimeout(() => {
      document.getElementById("etr-auth-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const onLogout = async () => {
    await logout();
    setAuthPanel(null);
    setRecords([]);
    resetForm();
    setStatus("");
    setStatusKind("");
  };

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setForm({
      id: "",
      teacher_name: "",
      class_date: todayYmd(),
      score: "",
      remark: "",
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: sortField,
        order: sortOrder,
        _: String(Date.now()),
      });
      const res = await fetch(`/api/english-teacher-review?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        return;
      }
      if (!data.ok) {
        setStatus(data.error || tr.status.loadFailed);
        setStatusKind("err");
        setRecords([]);
        return;
      }
      setRecords(data.data ?? []);
    } catch {
      setStatus(tr.status.loadFailed);
      setStatusKind("err");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortOrder, tr.status.loadFailed]);

  useEffect(() => {
    if (!authUser) return;
    void loadHistory();
  }, [loadHistory, authUser]);

  const onSort = (field: EnglishTeacherReviewSortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(defaultOrderForField(field));
    }
  };

  const sortMark = (field: EnglishTeacherReviewSortField) => {
    if (sortField !== field) return "";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  const requireAuth = (): boolean => {
    if (authUser) return true;
    openAuth("login");
    return false;
  };

  const validate = (): boolean => {
    if (!form.teacher_name.trim()) {
      setStatus(
        locale === "zh"
          ? "请输入英语老师姓名。"
          : "Please enter the teacher's name."
      );
      setStatusKind("err");
      return false;
    }
    if (form.score === "") {
      setStatus(
        locale === "zh" ? "请选择评分。" : "Please select a score."
      );
      setStatusKind("err");
      return false;
    }
    if (!form.class_date.trim()) {
      setStatus(
        locale === "zh" ? "请选择上课日期。" : "Please select a class date."
      );
      setStatusKind("err");
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!requireAuth()) return;
    if (!validate()) return;
    setSaving(true);
    setStatus("");
    setStatusKind("");

    try {
      const res = await fetch("/api/english-teacher-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: form.id || undefined,
          teacher_name: form.teacher_name.trim(),
          class_date: form.class_date,
          score: parseInt(form.score, 10),
          remark: form.remark.trim(),
        }),
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        openAuth("login");
        return;
      }
      if (!data.ok) {
        setStatus(data.error || tr.status.saveFailed);
        setStatusKind("err");
        return;
      }
      setStatus(tr.status.saved);
      setStatusKind("ok");
      resetForm();
      void loadHistory();
    } catch {
      setStatus(tr.status.saveFailed);
      setStatusKind("err");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (record: EnglishTeacherReviewRecord) => {
    if (!requireAuth()) return;
    setForm({
      id: String(record.id),
      teacher_name: record.teacher_name,
      class_date: record.class_date,
      score: String(record.score),
      remark: record.remark ?? "",
    });
    setStatus(tr.status.editLoaded);
    setStatusKind("ok");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onDelete = async (id: number) => {
    if (!requireAuth()) return;
    if (!window.confirm(tr.history.confirmDelete)) return;
    try {
      const res = await fetch("/api/english-teacher-review", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (data.auth_required) {
        setAuthUser(null);
        openAuth("login");
        return;
      }
      if (!data.ok) {
        setStatus(data.error || tr.status.deleteFailed);
        setStatusKind("err");
        return;
      }
      setStatus(tr.status.deleted);
      setStatusKind("ok");
      if (form.id === String(id)) resetForm();
      void loadHistory();
    } catch {
      setStatus(tr.status.deleteFailed);
      setStatusKind("err");
    }
  };

  const statusClass =
    statusKind === "ok"
      ? "telegram-push-result telegram-push-result--ok"
      : statusKind === "err"
        ? "telegram-push-result telegram-push-result--err"
        : "telegram-push-result";

  const saveButton = (
    <button
      type="button"
      className="btn-rsi-filter btn-rsi-filter--primary"
      onClick={onSave}
      disabled={saving || authChecking}
    >
      {saving ? tr.form.saving : tr.form.save}
    </button>
  );

  const scoreOptions = Array.from({ length: 11 }, (_, i) => i);

  return (
    <div className="etr-page">
      <div className="page-hero">
        <div className="etr-top-bar">
          <div className="etr-top-bar-main">
            <h1>{tr.page.title}</h1>
            <p className="sub">{tr.page.subtitle}</p>
          </div>
          <div className="etr-top-bar-actions">
            {authUser ? (
              <>
                <p className="hint etr-user-line">{authUser.expires_hint}</p>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => void onLogout()}
                >
                  {tr.auth.logout}
                </button>
              </>
            ) : (
              <div className="etr-guest-actions">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  onClick={() => openAuth("login")}
                >
                  {tr.auth.loginTab}
                </button>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                  onClick={() => openAuth("register")}
                >
                  {tr.auth.registerTab}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isDemo ? (
        <p className="etr-demo-banner hint" role="note">
          {demo.banner}
        </p>
      ) : null}

      {authPanel ? (
        <div id="etr-auth-panel">
          <TeacherReviewAuth
            variant="inline"
            initialMode={authPanel}
            onClose={() => setAuthPanel(null)}
            onAuthenticated={(user) => {
              setAuthUser(user);
              setAuthPanel(null);
              setStatus("");
              setStatusKind("");
            }}
          />
        </div>
      ) : null}

      <section className="section etr-panel" aria-labelledby="etr-form-heading">
        <h2 id="etr-form-heading">{tr.form.heading}</h2>
        {isDemo ? (
          <p className="hint etr-form-preview-hint">{demo.formPreviewHint}</p>
        ) : null}
        <form
          ref={formRef}
          className={`etr-form${isDemo ? " etr-form--preview" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <input type="hidden" name="id" value={form.id} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="etr-teacher-name">
                {tr.form.teacherName}
                <span className="etr-required">{tr.form.required}</span>
              </label>
              <input
                id="etr-teacher-name"
                type="text"
                value={isDemo ? (locale === "zh" ? "示例老师" : "Sample Teacher") : form.teacher_name}
                onChange={(e) => setField("teacher_name", e.target.value)}
                placeholder={tr.form.teacherNamePlaceholder}
                autoComplete="off"
                readOnly={isDemo}
              />
            </div>
            <div className="field">
              <label htmlFor="etr-class-date">
                {tr.form.classDate}
                <span className="etr-required">{tr.form.required}</span>
              </label>
              <input
                id="etr-class-date"
                type="date"
                value={isDemo ? "2026-05-20" : form.class_date}
                onChange={(e) => setField("class_date", e.target.value)}
                readOnly={isDemo}
              />
            </div>
            <div className="field">
              <label htmlFor="etr-score">
                {tr.form.score}
                <span className="etr-required">{tr.form.required}</span>
              </label>
              <select
                id="etr-score"
                value={isDemo ? "7" : form.score}
                onChange={(e) => setField("score", e.target.value)}
                disabled={isDemo}
              >
                <option value="">{tr.form.scorePlaceholder}</option>
                {scoreOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} {tr.form.scoreUnit}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--span-2 etr-remark-field">
              <label htmlFor="etr-remark">{tr.form.remark}</label>
              <textarea
                id="etr-remark"
                value={
                  isDemo
                    ? locale === "zh"
                      ? "这是备注示例：记录上课体验、优缺点等。"
                      : "Sample notes: class experience, pros and cons, etc."
                    : form.remark
                }
                onChange={(e) => setField("remark", e.target.value)}
                placeholder={tr.form.remarkPlaceholder}
                rows={3}
                readOnly={isDemo}
                onKeyDown={(e) => {
                  if (isDemo) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSave();
                  }
                }}
              />
            </div>
          </div>

          <div className="etr-form-actions desktop-action">
            {saveButton}
            {!isDemo ? (
              <button
                type="button"
                className="btn-rsi-filter"
                onClick={() => {
                  resetForm();
                  setStatus(tr.status.resetDone);
                  setStatusKind("ok");
                }}
              >
                {tr.form.reset}
              </button>
            ) : null}
          </div>

          <p className={statusClass} role="status" aria-live="polite">
            {status}
          </p>
        </form>
      </section>

      <section className="section" aria-labelledby="etr-history-heading">
        <div className="etr-history-head">
          <h2 id="etr-history-heading">
            {tr.history.heading}
            {isDemo ? (
              <span className="etr-demo-tag">{demo.sampleTag}</span>
            ) : null}
          </h2>
          {!isDemo ? (
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={() => void loadHistory()}
              disabled={loading}
            >
              {tr.history.refresh}
            </button>
          ) : null}
        </div>
        <p className="hint">{tr.history.sortHint}</p>

        {loading && !isDemo && !records.length ? (
          <p className="empty">{tr.form.saving}</p>
        ) : !displayRecords.length ? (
          <p className="empty">{tr.history.empty}</p>
        ) : (
          <>
            <div className="etr-cards">
              {displayRecords.map((item) => (
                <article key={item.id} className="strategy-card etr-card">
                  <h3 className="strategy-card-title">
                    {item.teacher_name}
                    <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                      {item.score} {tr.form.scoreUnit}
                    </span>
                  </h3>
                  <dl className="strategy-card-grid">
                    <div className="strategy-card-item">
                      <dt>{tr.history.classDate}</dt>
                      <dd>{item.class_date}</dd>
                    </div>
                    <div className="strategy-card-item">
                      <dt>{tr.history.updatedAt}</dt>
                      <dd>{item.updated_at}</dd>
                    </div>
                    {item.remark ? (
                      <div className="strategy-card-item strategy-card-item--wide">
                        <dt>{tr.history.remark}</dt>
                        <dd>{item.remark}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="etr-card-actions">
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact"
                      onClick={() => onEdit(item)}
                    >
                      {tr.history.edit}
                    </button>
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                      onClick={() => void onDelete(item.id)}
                    >
                      {tr.history.delete}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="etr-table-wrap">
              <table className="compare-table etr-table">
                <thead>
                  <tr>
                    <th>{tr.history.id}</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "teacher_name" ? " is-active" : ""}`}
                        onClick={() => onSort("teacher_name")}
                      >
                        {tr.history.teacherName}
                        {sortMark("teacher_name")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "class_date" ? " is-active" : ""}`}
                        onClick={() => onSort("class_date")}
                      >
                        {tr.history.classDate}
                        {sortMark("class_date")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "score" ? " is-active" : ""}`}
                        onClick={() => onSort("score")}
                      >
                        {tr.history.score}
                        {sortMark("score")}
                      </button>
                    </th>
                    <th>{tr.history.remark}</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "updated_at" ? " is-active" : ""}`}
                        onClick={() => onSort("updated_at")}
                      >
                        {tr.history.updatedAt}
                        {sortMark("updated_at")}
                      </button>
                    </th>
                    <th>{tr.history.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRecords.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.teacher_name}</td>
                      <td>{item.class_date}</td>
                      <td>
                        <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                          {item.score} {tr.form.scoreUnit}
                        </span>
                      </td>
                      <td className="etr-remark-cell">{item.remark || "—"}</td>
                      <td>{item.updated_at}</td>
                      <td>
                        <div className="etr-row-actions">
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact"
                            onClick={() => onEdit(item)}
                          >
                            {tr.history.edit}
                          </button>
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--danger"
                            onClick={() => void onDelete(item.id)}
                          >
                            {tr.history.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="mobile-action-bar etr-mobile-bar" role="toolbar">
        {saveButton}
        {!isDemo ? (
          <button
            type="button"
            className="btn-rsi-filter"
            onClick={() => {
              resetForm();
              setStatus(tr.status.resetDone);
              setStatusKind("ok");
            }}
          >
            {tr.form.reset}
          </button>
        ) : (
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            onClick={() => openAuth("register")}
          >
            {demo.loginToManage}
          </button>
        )}
      </div>

      <TeacherReviewSeoContent />
    </div>
  );
}
