"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import type { AdminJpLessonTeacherOption } from "@/components/AdminUserEditModal";

export type AdminUserBindTeacherTarget = {
  id: number;
  username: string;
  jp_lesson_teacher_id?: number | null;
  jp_lesson_teacher_name?: string | null;
};

type Props = {
  open: boolean;
  user: AdminUserBindTeacherTarget | null;
  locale: "en" | "zh";
  teachers: AdminJpLessonTeacherOption[];
  teachersLoading?: boolean;
  onClose: () => void;
  onBound: (user: {
    id: number;
    jp_lesson_teacher_id: number | null;
    jp_lesson_teacher_name: string | null;
  }) => void;
};

export function AdminUserBindTeacherModal({
  open,
  user,
  locale,
  teachers,
  teachersLoading = false,
  onClose,
  onBound,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isRebind = Boolean(user?.jp_lesson_teacher_id);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const currentId = user?.jp_lesson_teacher_id;
      setTeacherId(
        currentId != null && Number.isInteger(currentId) && currentId > 0
          ? currentId
          : ""
      );
      setError("");
      setSaving(false);
    }
    wasOpenRef.current = open;
  }, [open, user?.jp_lesson_teacher_id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || saving) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!user || teacherId === "" || saving) return;

    const selected = teachers.find((t) => t.id === teacherId);
    if (!selected) {
      setError(locale === "zh" ? "请选择老师。" : "Please select a teacher.");
      return;
    }

    const currentId = user.jp_lesson_teacher_id ?? null;
    if (currentId != null && selected.id === currentId) {
      onClose();
      return;
    }

    setError("");
    setSaving(true);
    const snapshotUserId = user.id;
    const optimisticName = selected.name.trim();
    const failLabel = isRebind
      ? locale === "zh"
        ? "更改绑定失败"
        : "Change binding failed"
      : locale === "zh"
        ? "绑定失败"
        : "Bind failed";

    void (async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: snapshotUserId,
            jp_lesson_teacher_id: selected.id,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          user?: {
            id: number;
            jp_lesson_teacher_id?: number | null;
            jp_lesson_teacher_name?: string | null;
          };
          error?: string;
        };
        if (!data.ok || !data.user) {
          throw new Error(String(data.error || failLabel));
        }
        onBound({
          id: data.user.id,
          jp_lesson_teacher_id: data.user.jp_lesson_teacher_id ?? selected.id,
          jp_lesson_teacher_name:
            data.user.jp_lesson_teacher_name?.trim() || optimisticName,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : failLabel);
      } finally {
        setSaving(false);
      }
    })();
  };

  if (!mounted || !open || !user) return null;

  return createPortal(
    <div
      className="admin-user-bind-overlay"
      onMouseDown={(e) => {
        if (saving) return;
        closeModalOnBackdropMouseDown(e, onClose);
      }}
    >
      <div
        className="admin-user-bind-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-bind-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-user-bind-header">
          <div>
            <h2 id="admin-user-bind-title" className="admin-user-bind-title">
              {isRebind
                ? locale === "zh"
                  ? "更改绑定老师"
                  : "Change teacher binding"
                : locale === "zh"
                  ? "绑定对应老师"
                  : "Bind teacher"}
            </h2>
            <p className="admin-user-bind-subtitle">
              {isRebind
                ? locale === "zh"
                  ? `为账号「${user.username}」更换日语上课老师（当前：${user.jp_lesson_teacher_name?.trim() || "—"}）。一位老师只能绑一个账号。`
                  : `Change the JP lesson teacher for “${user.username}” (now: ${user.jp_lesson_teacher_name?.trim() || "—"}). One teacher maps to one account.`
                : locale === "zh"
                  ? `为账号「${user.username}」选择日语上课老师。一位老师只能绑一个账号。`
                  : `Link a JP lesson teacher to “${user.username}”. One teacher maps to one account.`}
            </p>
          </div>
          <button
            type="button"
            className="admin-user-bind-close"
            aria-label={locale === "zh" ? "关闭" : "Close"}
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="admin-user-bind-body" onSubmit={save}>
          <label className="admin-user-bind-field">
            <span>{locale === "zh" ? "老师" : "Teacher"}</span>
            <select
              value={teacherId === "" ? "" : String(teacherId)}
              disabled={teachersLoading || saving}
              autoFocus
              onChange={(e) => {
                const raw = e.target.value;
                setTeacherId(raw ? Number(raw) : "");
                setError("");
              }}
            >
              <option value="">
                {teachersLoading
                  ? locale === "zh"
                    ? "加载老师列表…"
                    : "Loading teachers…"
                  : locale === "zh"
                    ? "请选择老师"
                    : "Select a teacher"}
              </option>
              {teachers.map((teacher) => {
                const linked = teacher.linked_user?.username;
                const linkedToSelf =
                  linked != null &&
                  linked.trim().toLowerCase() === user.username.trim().toLowerCase();
                let label = teacher.name;
                if (linkedToSelf) {
                  label =
                    locale === "zh"
                      ? `${teacher.name}（当前）`
                      : `${teacher.name} (current)`;
                } else if (linked) {
                  label =
                    locale === "zh"
                      ? `${teacher.name}（当前关联 ${linked}，保存后改绑）`
                      : `${teacher.name} (now ${linked}; will rebind)`;
                }
                return (
                  <option key={teacher.id} value={teacher.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          {error ? <p className="admin-user-bind-error">{error}</p> : null}

          <div className="admin-user-bind-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={saving}
              onClick={onClose}
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              disabled={saving || teacherId === "" || teachersLoading}
            >
              {saving
                ? locale === "zh"
                  ? isRebind
                    ? "保存中…"
                    : "绑定中…"
                  : isRebind
                    ? "Saving…"
                    : "Binding…"
                : isRebind
                  ? locale === "zh"
                    ? "保存更改"
                    : "Save"
                  : locale === "zh"
                    ? "绑定"
                    : "Bind"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .admin-user-bind-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
        }
        .admin-user-bind-modal {
          width: min(400px, 100%);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .admin-user-bind-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }
        .admin-user-bind-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }
        .admin-user-bind-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          line-height: 1.45;
          color: var(--muted);
        }
        .admin-user-bind-close {
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
        .admin-user-bind-close:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .admin-user-bind-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .admin-user-bind-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-user-bind-field select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
        }
        .admin-user-bind-error {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }
        .admin-user-bind-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding-top: 0.25rem;
        }
      `}</style>
    </div>,
    document.body
  );
}
