"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import type {
  EnLessonTeacher,
  EnLessonTeacherReviewRecord,
  EnLessonTeacherReviewSortField,
} from "@/lib/types";

type SortOrder = "asc" | "desc";

type FormState = {
  id: string;
  class_date: string;
  score: string;
  remark: string;
};

type Props = {
  open: boolean;
  teacher: EnLessonTeacher | null;
  locale: "zh" | "en";
  onClose: () => void;
  onChanged?: () => void;
};

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultOrderForField(field: EnLessonTeacherReviewSortField): SortOrder {
  return field === "score" ? "asc" : "desc";
}

function scoreClass(score: number): string {
  if (score >= 8) return "etr-score--high";
  if (score <= 3) return "etr-score--low";
  return "etr-score--mid";
}

function defaultForm(): FormState {
  return {
    id: "",
    class_date: todayYmd(),
    score: "",
    remark: "",
  };
}

export function EnLessonTeacherReviewModal({
  open,
  teacher,
  locale,
  onClose,
  onChanged,
}: Props) {
  const zh = locale === "zh";
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [records, setRecords] = useState<EnLessonTeacherReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [sortField, setSortField] = useState<EnLessonTeacherReviewSortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const scoreOptions = Array.from({ length: 11 }, (_, i) => i);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetForm = useCallback(() => {
    setForm(defaultForm());
  }, []);

  const loadHistory = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        teacher_id: String(teacher.id),
        sort: sortField,
        order: sortOrder,
        _: String(Date.now()),
      });
      const res = await fetch(`/api/admin/en-lesson-teacher-review?${params}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        data?: EnLessonTeacherReviewRecord[];
        error?: string;
      };
      if (!data.ok) {
        setStatus(data.error || (zh ? "加载失败" : "Load failed"));
        setStatusErr(true);
        setRecords([]);
        return;
      }
      setRecords(data.data ?? []);
    } catch {
      setStatus(zh ? "加载失败" : "Load failed");
      setStatusErr(true);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [teacher, sortField, sortOrder, zh]);

  useEffect(() => {
    if (!open || !teacher) return;
    resetForm();
    setStatus("");
    setStatusErr(false);
    void loadHistory();
  }, [open, teacher, loadHistory, resetForm]);

  const onSort = (field: EnLessonTeacherReviewSortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(defaultOrderForField(field));
    }
  };

  const sortMark = (field: EnLessonTeacherReviewSortField) => {
    if (sortField !== field) return "";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  const validate = (): boolean => {
    if (form.score === "") {
      setStatus(zh ? "请选择评分。" : "Please select a score.");
      setStatusErr(true);
      return false;
    }
    if (!form.class_date.trim()) {
      setStatus(zh ? "请选择上课日期。" : "Please select a class date.");
      setStatusErr(true);
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!teacher || !validate()) return;
    setSaving(true);
    setStatus("");
    setStatusErr(false);
    try {
      const res = await fetch("/api/admin/en-lesson-teacher-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          teacher_id: teacher.id,
          class_date: form.class_date,
          score: parseInt(form.score, 10),
          remark: form.remark.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || (zh ? "保存失败" : "Save failed"));
        setStatusErr(true);
        return;
      }
      setStatus(zh ? "保存成功。" : "Saved.");
      setStatusErr(false);
      resetForm();
      void loadHistory();
      onChanged?.();
    } catch {
      setStatus(zh ? "保存失败" : "Save failed");
      setStatusErr(true);
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (record: EnLessonTeacherReviewRecord) => {
    setForm({
      id: String(record.id),
      class_date: record.class_date,
      score: String(record.score),
      remark: record.remark ?? "",
    });
    setStatus("");
    setStatusErr(false);
  };

  const onDelete = async (id: number) => {
    if (
      !window.confirm(
        zh ? "确认删除该条评价记录吗？" : "Delete this review record?"
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/admin/en-lesson-teacher-review", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setStatus(data.error || (zh ? "删除失败" : "Delete failed"));
        setStatusErr(true);
        return;
      }
      setStatus(zh ? "已删除。" : "Deleted.");
      setStatusErr(false);
      if (form.id === String(id)) resetForm();
      void loadHistory();
      onChanged?.();
    } catch {
      setStatus(zh ? "删除失败" : "Delete failed");
      setStatusErr(true);
    }
  };

  if (!open || !mounted || !teacher) return null;

  return createPortal(
    <div
      className="jp-lesson-teacher-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="jp-lesson-teacher-modal jp-lesson-teacher-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-teacher-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-teacher-header">
          <div>
            <h2 id="jp-lesson-teacher-review-title">
              {zh ? "老师评价" : "Teacher review"}
            </h2>
            <p className="jp-lesson-teacher-modal-lesson">{teacher.name}</p>
          </div>
          <button
            type="button"
            className="jp-lesson-teacher-close"
            aria-label={zh ? "关闭" : "Close"}
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="etr-form jp-lesson-teacher-review-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <input type="hidden" name="id" value={form.id} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="jpl-review-class-date">
                {zh ? "上课日期" : "Class date"}
                <span className="etr-required">*</span>
              </label>
              <input
                id="jpl-review-class-date"
                type="date"
                value={form.class_date}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, class_date: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="jpl-review-score">
                {zh ? "评分" : "Score"}
                <span className="etr-required">*</span>
              </label>
              <select
                id="jpl-review-score"
                value={form.score}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, score: e.target.value }))
                }
              >
                <option value="">
                  {zh ? "请选择评分（0～10 分）" : "Select score (0–10)"}
                </option>
                {scoreOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} {zh ? "分" : "pts"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--span-2 etr-remark-field">
              <label htmlFor="jpl-review-remark">{zh ? "备注" : "Notes"}</label>
              <textarea
                id="jpl-review-remark"
                value={form.remark}
                disabled={saving}
                placeholder={
                  zh
                    ? "可选：记录本次上课体验、优缺点、需改进点等"
                    : "Optional: class experience, pros and cons, etc."
                }
                rows={3}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, remark: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSave();
                  }
                }}
              />
            </div>
          </div>

          <div className="etr-form-actions etr-form-actions--inline">
            <button
              type="submit"
              className="btn-rsi-filter btn-rsi-filter--primary"
              disabled={saving}
            >
              {saving
                ? zh
                  ? "保存中…"
                  : "Saving…"
                : form.id
                  ? zh
                    ? "更新"
                    : "Update"
                  : zh
                    ? "保存"
                    : "Save"}
            </button>
            {form.id ? (
              <button
                type="button"
                className="btn-rsi-filter"
                disabled={saving}
                onClick={resetForm}
              >
                {zh ? "新增评价" : "New review"}
              </button>
            ) : null}
          </div>
        </form>

        {status ? (
          <p
            className={
              statusErr
                ? "telegram-push-result telegram-push-result--err"
                : "hint"
            }
          >
            {status}
          </p>
        ) : null}

        <div className="jp-lesson-teacher-review-history">
          <div className="etr-history-head">
            <h3>{zh ? "评价记录" : "Review history"}</h3>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={loading}
              onClick={() => void loadHistory()}
            >
              {zh ? "刷新" : "Refresh"}
            </button>
          </div>

          {loading && !records.length ? (
            <p className="hint">{zh ? "加载中…" : "Loading…"}</p>
          ) : !records.length ? (
            <p className="hint">{zh ? "暂无评价记录。" : "No reviews yet."}</p>
          ) : (
            <div className="admin-rbac-table-wrap jp-lesson-teacher-review-table-wrap">
              <table className="admin-rbac-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "class_date" ? " is-active" : ""}`}
                        onClick={() => onSort("class_date")}
                      >
                        {zh ? "上课日期" : "Date"}
                        {sortMark("class_date")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "score" ? " is-active" : ""}`}
                        onClick={() => onSort("score")}
                      >
                        {zh ? "评分" : "Score"}
                        {sortMark("score")}
                      </button>
                    </th>
                    <th>{zh ? "备注" : "Notes"}</th>
                    <th>
                      <button
                        type="button"
                        className={`etr-sort-btn${sortField === "updated_at" ? " is-active" : ""}`}
                        onClick={() => onSort("updated_at")}
                      >
                        {zh ? "更新时间" : "Updated"}
                        {sortMark("updated_at")}
                      </button>
                    </th>
                    <th>{zh ? "操作" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.class_date}</td>
                      <td>
                        <span className={`etr-score-badge ${scoreClass(item.score)}`}>
                          {item.score} {zh ? "分" : "pts"}
                        </span>
                      </td>
                      <td className="etr-remark-cell">{item.remark || "—"}</td>
                      <td>{formatBeijingDateTime(item.updated_at)}</td>
                      <td>
                        <div className="etr-form-actions etr-form-actions--inline">
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact"
                            onClick={() => onEdit(item)}
                          >
                            {zh ? "编辑" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--danger btn-rsi-filter--compact"
                            onClick={() => void onDelete(item.id)}
                          >
                            {zh ? "删除" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
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
          width: min(720px, 100%);
          max-height: min(90vh, 860px);
          overflow-y: auto;
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

        .jp-lesson-teacher-review-form {
          margin-bottom: 0.75rem;
        }

        .jp-lesson-teacher-review-history h3 {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
        }

        .jp-lesson-teacher-review-table-wrap {
          margin-top: 0.65rem;
          max-height: min(40vh, 320px);
          overflow: auto;
        }

        .etr-remark-cell {
          max-width: 220px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </div>,
    document.body
  );
}
