"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { JpLessonTeacher, JpLessonTeacherReviewRecord } from "@/lib/types";

type FormState = {
  id: string;
  class_date: string;
  score: string;
  remark: string;
};

type Props = {
  open: boolean;
  teacher: JpLessonTeacher | null;
  locale: "zh" | "en";
  onClose: () => void;
  onChanged?: () => void;
};

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultForm(): FormState {
  return {
    id: "",
    class_date: todayYmd(),
    score: "",
    remark: "",
  };
}

function recordToForm(record: JpLessonTeacherReviewRecord): FormState {
  return {
    id: String(record.id),
    class_date: record.class_date,
    score: String(record.score),
    remark: record.remark ?? "",
  };
}

export function JpLessonTeacherReviewModal({
  open,
  teacher,
  locale,
  onClose,
  onChanged,
}: Props) {
  const zh = locale === "zh";
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [statusErr, setStatusErr] = useState(false);

  const scoreOptions = Array.from({ length: 11 }, (_, i) => i);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadReview = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    setStatus("");
    setStatusErr(false);
    try {
      const params = new URLSearchParams({
        teacher_id: String(teacher.id),
        sort: "updated_at",
        order: "desc",
        limit: "1",
        _: String(Date.now()),
      });
      const res = await fetch(`/api/admin/jp-lesson-teacher-review?${params}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        data?: JpLessonTeacherReviewRecord[];
        error?: string;
      };
      if (!data.ok) {
        setStatus(data.error || (zh ? "加载失败" : "Load failed"));
        setStatusErr(true);
        setForm(defaultForm());
        return;
      }
      const record = data.data?.[0];
      setForm(record ? recordToForm(record) : defaultForm());
    } catch {
      setStatus(zh ? "加载失败" : "Load failed");
      setStatusErr(true);
      setForm(defaultForm());
    } finally {
      setLoading(false);
    }
  }, [teacher, zh]);

  useEffect(() => {
    if (!open || !teacher) return;
    void loadReview();
  }, [open, teacher, loadReview]);

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
      const res = await fetch("/api/admin/jp-lesson-teacher-review", {
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
      onChanged?.();
      onClose();
    } catch {
      setStatus(zh ? "保存失败" : "Save failed");
      setStatusErr(true);
    } finally {
      setSaving(false);
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

        {loading ? (
          <p className="hint">{zh ? "加载中…" : "Loading…"}</p>
        ) : (
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
                      ? "可选：记录上课体验、优缺点、需改进点等"
                      : "Optional: class experience, pros and cons, etc."
                  }
                  rows={4}
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
                type="button"
                className="btn-rsi-filter"
                disabled={saving}
                onClick={onClose}
              >
                {zh ? "取消" : "Cancel"}
              </button>
              <button
                type="submit"
                className="btn-rsi-filter btn-rsi-filter--primary"
                disabled={saving}
              >
                {saving ? (zh ? "保存中…" : "Saving…") : zh ? "保存" : "Save"}
              </button>
            </div>
          </form>
        )}

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
          width: min(520px, 100%);
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
          margin-bottom: 0.25rem;
        }
      `}</style>
    </div>,
    document.body
  );
}
