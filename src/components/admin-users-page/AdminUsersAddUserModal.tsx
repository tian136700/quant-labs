"use client";

import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { AdminUserTeacherModulesField } from "@/components/AdminUserTeacherModulesField";
import type { AdminJpLessonTeacherOption } from "@/components/AdminUserEditModal";
import type { Locale } from "@/i18n/messages";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatTeacherLessonDisplayLabel } from "@/lib/jp-lesson-teacher-rate";
import {
  ETR_PASSWORD_MIN_LENGTH,
  ETR_USERNAME_MAX_LENGTH,
  ETR_USERNAME_MIN_LENGTH,
} from "@/lib/etr-auth";
import type { RbacTeacherModules } from "@/lib/rbac";

export type AdminUsersAddUserModalProps = {
  open: boolean;
  mounted: boolean;
  locale: Locale;
  creating: boolean;
  newUsername: string;
  newPassword: string;
  newTeacherModules: RbacTeacherModules;
  newTeacherId: number | null;
  teachers: AdminJpLessonTeacherOption[];
  teachersLoading: boolean;
  addUserModalError: string;
  addUserDisplayedErrors: { username?: string; password?: string };
  onClose: () => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTeacherModulesChange: (value: RbacTeacherModules) => void;
  onTeacherIdChange: (value: number | null) => void;
  onClearModalError: () => void;
  onSubmit: (e: FormEvent) => void;
};

export function AdminUsersAddUserModal({
  open,
  mounted,
  locale,
  creating,
  newUsername,
  newPassword,
  newTeacherModules,
  newTeacherId,
  teachers,
  teachersLoading,
  addUserModalError,
  addUserDisplayedErrors,
  onClose,
  onUsernameChange,
  onPasswordChange,
  onTeacherModulesChange,
  onTeacherIdChange,
  onClearModalError,
  onSubmit,
}: AdminUsersAddUserModalProps) {
  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="admin-users-modal-overlay"
      onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
    >
      <div
        className="admin-users-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-add-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-users-modal-header">
          <div>
            <h2 id="admin-users-add-title" className="admin-users-modal-title">
              {locale === "zh" ? "添加用户" : "Add user"}
            </h2>
            <p className="admin-users-modal-subtitle">
              {locale === "zh"
                ? "新增用户名、密码与角色。"
                : "Create a new account with username, password, and role."}
            </p>
          </div>
          <button
            type="button"
            className="admin-users-modal-close"
            aria-label={locale === "zh" ? "关闭" : "Close"}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="admin-users-modal-body admin-user-add-form"
          autoComplete="off"
          onSubmit={(e) => void onSubmit(e)}
        >
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "用户名" : "Username"}</span>
            <input
              type="text"
              name="admin-user-new-username"
              value={newUsername}
              disabled={creating}
              placeholder={
                locale === "zh"
                  ? `${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} 个字符`
                  : `${ETR_USERNAME_MIN_LENGTH}–${ETR_USERNAME_MAX_LENGTH} characters`
              }
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className={
                addUserDisplayedErrors.username ? "admin-user-add-field--invalid" : undefined
              }
              onChange={(e) => {
                onUsernameChange(e.target.value);
                onClearModalError();
              }}
            />
            {addUserDisplayedErrors.username ? (
              <span className="admin-user-add-field-error">
                {addUserDisplayedErrors.username}
              </span>
            ) : null}
          </label>
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "密码" : "Password"}</span>
            <input
              type="password"
              name="admin-user-new-password"
              value={newPassword}
              disabled={creating}
              placeholder={
                locale === "zh"
                  ? `至少 ${ETR_PASSWORD_MIN_LENGTH} 位`
                  : `Min ${ETR_PASSWORD_MIN_LENGTH} chars`
              }
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              className={
                addUserDisplayedErrors.password ? "admin-user-add-field--invalid" : undefined
              }
              onChange={(e) => {
                onPasswordChange(e.target.value);
                onClearModalError();
              }}
            />
            {addUserDisplayedErrors.password ? (
              <span className="admin-user-add-field-error">
                {addUserDisplayedErrors.password}
              </span>
            ) : null}
          </label>
          <AdminUserTeacherModulesField
            value={newTeacherModules}
            onChange={onTeacherModulesChange}
            locale={locale}
            disabled={creating}
            fieldClassPrefix="admin-user-add"
          />
          <label className="admin-user-add-field">
            <span>{locale === "zh" ? "关联老师" : "Linked teacher"}</span>
            <select
              value={newTeacherId ?? ""}
              disabled={creating || teachersLoading}
              onChange={(e) => {
                const raw = e.target.value;
                onTeacherIdChange(raw ? Number(raw) : null);
              }}
            >
              <option value="">{locale === "zh" ? "— 不关联 —" : "— None —"}</option>
              {teachers.map((teacher) => {
                const baseLabel = formatTeacherLessonDisplayLabel(teacher, locale);
                const linked = teacher.linked_user?.username;
                return (
                  <option key={teacher.id} value={teacher.id}>
                    {linked
                      ? locale === "zh"
                        ? `${baseLabel}（当前关联 ${linked}，保存后改绑）`
                        : `${baseLabel} (now ${linked}; will rebind)`
                      : baseLabel}
                  </option>
                );
              })}
            </select>
          </label>
          {addUserModalError ? (
            <p className="admin-user-add-modal-error">{addUserModalError}</p>
          ) : null}
          <div className="admin-users-modal-footer">
            <p className="hint admin-user-add-hint" style={{ margin: 0 }}>
              {locale === "zh"
                ? "系统保留名 Admin、LiLaoshi、user1 不可重复创建。"
                : "Reserved: Admin, LiLaoshi, user1."}
            </p>
            <button
              type="submit"
              className="btn-rsi-filter btn-rsi-filter--primary admin-user-add-submit"
              disabled={creating}
            >
              {creating
                ? locale === "zh"
                  ? "创建中…"
                  : "Creating…"
                : locale === "zh"
                  ? "添加用户"
                  : "Add user"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
