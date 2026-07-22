"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AdminUserTeacherModulesField } from "@/components/AdminUserTeacherModulesField";
import {
  detectTeacherModules,
  emptyTeacherModules,
  formatTeacherModulesLabel,
  teacherModulesToRoleAndExtras,
  type RbacTeacherModules,
} from "@/lib/rbac";
import {
  adminUserFieldErrors,
} from "@/lib/admin-user-validation";
import {
  ETR_DEFAULT_ADMIN_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USER1_USERNAME,
  ETR_DEFAULT_JP_VOCAB_USERNAME,
  isReservedUsername,
} from "@/lib/etr-auth";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatTeacherLessonDisplayLabel } from "@/lib/jp-lesson-teacher-rate";

export type AdminUserEditRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
  teacher_modules?: RbacTeacherModules | null;
  jp_lesson_teacher_id?: number | null;
  jp_lesson_teacher_name?: string | null;
  disabled?: boolean;
  created_at?: string;
  last_login_at?: string | null;
  last_login_ip?: string | null;
};

export type AdminJpLessonTeacherOption = {
  id: number;
  name: string;
  hourly_rate?: number | null;
  lesson_minutes?: number | null;
  linked_user?: { id: number; username: string } | null;
};

type Props = {
  open: boolean;
  user: AdminUserEditRow | null;
  locale: "en" | "zh";
  teachers: AdminJpLessonTeacherOption[];
  teachersLoading?: boolean;
  onClose: () => void;
  onSaved: (user: AdminUserEditRow) => void;
  onSaveFailed: (userId: number, snapshot: AdminUserEditRow, message: string) => void;
  onCredentialsStored?: (userId: number, password: string) => void;
};

function buildOptimisticAdminUser(
  base: AdminUserEditRow,
  username: string,
  modules: RbacTeacherModules,
  teacherId: number | null,
  teachers: AdminJpLessonTeacherOption[],
  locale: "en" | "zh"
): AdminUserEditRow {
  const { role } = teacherModulesToRoleAndExtras(modules);
  const teacherName =
    teacherId == null
      ? null
      : teachers.find((t) => t.id === teacherId)?.name?.trim() ||
        base.jp_lesson_teacher_name ||
        null;
  return {
    ...base,
    username,
    role,
    role_label: formatTeacherModulesLabel(modules, locale),
    teacher_modules: modules,
    jp_lesson_teacher_id: teacherId,
    jp_lesson_teacher_name: teacherName,
  };
}

export function AdminUserEditModal({
  open,
  user,
  locale,
  teachers,
  teachersLoading = false,
  onClose,
  onSaved,
  onSaveFailed,
  onCredentialsStored,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [teacherModules, setTeacherModules] =
    useState<RbacTeacherModules>(emptyTeacherModules());
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const wasOpenRef = useRef(false);

  const passwordErrors = useMemo(
    () => adminUserFieldErrors(user?.username ?? "", password, locale),
    [locale, password, user?.username]
  );
  const passwordSubmitErrors = useMemo(
    () =>
      adminUserFieldErrors(user?.username ?? "", password, locale, { requireFilled: false }),
    [locale, password, user?.username]
  );
  const displayedPasswordError = submitAttempted
    ? passwordSubmitErrors.password
    : passwordErrors.password;

  const usernameLocked = isReservedUsername(
    user?.username ?? "",
    ETR_DEFAULT_ADMIN_USERNAME,
    ETR_DEFAULT_JP_VOCAB_USERNAME,
    ETR_DEFAULT_JP_VOCAB_USER1_USERNAME
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current && user) {
      setUsername(user.username);
      setPassword("");
      setTeacherModules(
        user.teacher_modules ?? detectTeacherModules(user.role)
      );
      setTeacherId(
        typeof user.jp_lesson_teacher_id === "number" && user.jp_lesson_teacher_id > 0
          ? user.jp_lesson_teacher_id
          : null
      );
      setError("");
      setSubmitAttempted(false);
    }
    wasOpenRef.current = open;
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    if (!user) return;

    const trimmedUsername = username.trim();
    setSubmitAttempted(true);
    if (!trimmedUsername) {
      setError(locale === "zh" ? "请填写用户名。" : "Username is required.");
      return;
    }
    if (password && passwordSubmitErrors.password) {
      setError(passwordSubmitErrors.password);
      return;
    }

    setError("");
    const snapshot = user;
    const optimistic = buildOptimisticAdminUser(
      snapshot,
      trimmedUsername,
      teacherModules,
      teacherId,
      teachers,
      locale
    );

    onSaved(optimistic);
    onClose();
    if (password.trim()) {
      onCredentialsStored?.(snapshot.id, password);
    }

    void (async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: snapshot.id,
            username: trimmedUsername,
            teacher_modules: teacherModules,
            jp_lesson_teacher_id: teacherId,
            ...(password ? { password } : {}),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          user?: AdminUserEditRow;
          error?: string;
        };
        if (!data.ok || !data.user) {
          throw new Error(
            String(data.error || (locale === "zh" ? "保存失败" : "Save failed"))
          );
        }
        onSaved(data.user);
      } catch (err) {
        onSaveFailed(
          snapshot.id,
          snapshot,
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "保存失败"
              : "Save failed"
        );
      }
    })();
  };

  if (!mounted || !open || !user) return null;

  return createPortal(
    <div
      className="admin-user-edit-overlay"
      onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
    >
      <div
        className="admin-user-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-user-edit-header">
          <div>
            <h2 id="admin-user-edit-title" className="admin-user-edit-title">
              {locale === "zh" ? "编辑用户" : "Edit user"}
            </h2>
            <p className="admin-user-edit-subtitle">
              {locale === "zh"
                ? usernameLocked
                  ? "系统保留账号不可改用户名。可填写新密码恢复登录；留空表示不改密码。老师身份可多选（日语+韩语等）。"
                  : "修改用户名、老师身份（可多选）、关联老师或密码。留空密码表示不修改。"
                : usernameLocked
                  ? "System account username is locked. Teacher roles are multi-select (JP+KO etc)."
                  : "Update username, multi-select teacher roles, linked teacher, or password."}
            </p>
          </div>
          <button
            type="button"
            className="admin-user-edit-close"
            aria-label={locale === "zh" ? "关闭" : "Close"}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="admin-user-edit-body"
          autoComplete="off"
          onSubmit={save}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === "INPUT" || tag === "SELECT") e.preventDefault();
          }}
        >
          <label className="admin-user-edit-field">
            <span>{locale === "zh" ? "用户名" : "Username"}</span>
            <input
              type="text"
              name="admin-user-edit-username"
              value={username}
              readOnly={usernameLocked || undefined}
              disabled={usernameLocked}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              onFocus={(e) => {
                if (usernameLocked) return;
                e.currentTarget.removeAttribute("readonly");
              }}
              onChange={(e) => {
                if (usernameLocked) return;
                setUsername(e.target.value);
              }}
            />
          </label>
          <label className="admin-user-edit-field">
            <span>{locale === "zh" ? "新密码（可选）" : "New password (optional)"}</span>
            <input
              type="password"
              name="admin-user-edit-password"
              value={password}
              placeholder={locale === "zh" ? "不修改请留空" : "Leave blank to keep"}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              className={
                displayedPasswordError ? "admin-user-edit-field--invalid" : undefined
              }
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
            {displayedPasswordError ? (
              <span className="admin-user-edit-field-error">{displayedPasswordError}</span>
            ) : null}
          </label>
          <AdminUserTeacherModulesField
            value={teacherModules}
            onChange={setTeacherModules}
            locale={locale}
            fieldClassPrefix="admin-user-edit"
          />
          <label className="admin-user-edit-field">
            <span>{locale === "zh" ? "关联老师" : "Linked teacher"}</span>
            <select
              value={teacherId ?? ""}
              disabled={teachersLoading}
              onChange={(e) => {
                const raw = e.target.value;
                setTeacherId(raw ? Number(raw) : null);
              }}
            >
              <option value="">
                {locale === "zh" ? "— 不关联 —" : "— None —"}
              </option>
              {teachers.map((teacher) => {
                const baseLabel = formatTeacherLessonDisplayLabel(teacher, locale);
                const linkedOther =
                  teacher.linked_user &&
                  teacher.linked_user.id !== user.id
                    ? teacher.linked_user.username
                    : null;
                return (
                  <option key={teacher.id} value={teacher.id}>
                    {linkedOther
                      ? locale === "zh"
                        ? `${baseLabel}（当前关联 ${linkedOther}，保存后改绑到本账号）`
                        : `${baseLabel} (now ${linkedOther}; will rebind)`
                      : baseLabel}
                  </option>
                );
              })}
            </select>
            <span className="admin-user-edit-field-hint">
              {locale === "zh"
                ? "对应日语新课「上课老师」。用于有课时自动启用账号等。"
                : "Maps to JP lesson teachers. Used for auto-enable on class days."}
            </span>
          </label>

          {error ? <p className="admin-user-edit-error">{error}</p> : null}

          <div className="admin-user-edit-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={onClose}
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              disabled={!username.trim() || Boolean(password && passwordErrors.password)}
            >
              {locale === "zh" ? "保存" : "Save"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .admin-user-edit-overlay {
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
        .admin-user-edit-modal {
          width: min(420px, 100%);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }
        .admin-user-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }
        .admin-user-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }
        .admin-user-edit-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          line-height: 1.45;
          color: var(--muted);
        }
        .admin-user-edit-close {
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
        .admin-user-edit-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .admin-user-edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .admin-user-edit-field input,
        .admin-user-edit-field select {
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
        .admin-user-edit-field input.admin-user-edit-field--invalid {
          border-color: var(--rise);
        }
        .admin-user-edit-field-error {
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--rise);
        }
        .admin-user-edit-field-hint {
          font-size: 0.7rem;
          line-height: 1.4;
          color: var(--muted);
        }
        .admin-user-edit-error {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }
        .admin-user-edit-footer {
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
