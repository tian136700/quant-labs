"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { RBAC_ROLE_LABELS } from "@/lib/rbac";
import type { EtrUserRole } from "@/lib/etr-auth";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";

export type AdminUserEditRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
  disabled?: boolean;
  created_at?: string;
};

type Props = {
  open: boolean;
  user: AdminUserEditRow | null;
  locale: "en" | "zh";
  onClose: () => void;
  onSaved: (user: AdminUserEditRow) => void;
  onSaveFailed: (userId: number, snapshot: AdminUserEditRow, message: string) => void;
  onCredentialsStored?: (userId: number, password: string) => void;
};

type AdminUserRole = "user" | "jp_vocab" | "en_vocab";

function adminUserRoleLabel(role: AdminUserRole, locale: "en" | "zh"): string {
  const item = RBAC_ROLE_LABELS[role as EtrUserRole];
  return locale === "zh" ? item.zh : item.en;
}

function buildOptimisticAdminUser(
  base: AdminUserEditRow,
  username: string,
  role: AdminUserRole,
  locale: "en" | "zh"
): AdminUserEditRow {
  return {
    ...base,
    username,
    role,
    role_label: adminUserRoleLabel(role, locale),
  };
}

export function AdminUserEditModal({
  open,
  user,
  locale,
  onClose,
  onSaved,
  onSaveFailed,
  onCredentialsStored,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminUserRole>("user");
  const [error, setError] = useState("");
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current && user) {
      setUsername(user.username);
      setPassword("");
      setRole(
        user.role === "jp_vocab"
          ? "jp_vocab"
          : user.role === "en_vocab"
            ? "en_vocab"
            : "user"
      );
      setError("");
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
    if (!trimmedUsername) {
      setError(locale === "zh" ? "请填写用户名。" : "Username is required.");
      return;
    }

    setError("");
    const snapshot = user;
    const optimistic = buildOptimisticAdminUser(
      snapshot,
      trimmedUsername,
      role,
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
            role,
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
                ? "修改用户名、角色或密码。留空密码表示不修改。"
                : "Update username, role, or password. Leave password blank to keep current."}
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
              readOnly
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              onChange={(e) => setUsername(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="admin-user-edit-field">
            <span>{locale === "zh" ? "角色" : "Role"}</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminUserRole)}
            >
              <option value="user">{locale === "zh" ? "普通用户" : "Regular user"}</option>
              <option value="jp_vocab">
                {locale === "zh" ? "日语教师（可编辑单词等）" : "Japanese teacher"}
              </option>
              <option value="en_vocab">
                {locale === "zh" ? "英语教师（抽背与今日单词）" : "English teacher"}
              </option>
            </select>
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
              disabled={!username.trim()}
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
