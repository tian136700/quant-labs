"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

export type AdminUserEditRow = {
  id: number;
  username: string;
  role: string;
  role_label: string;
};

type Props = {
  open: boolean;
  user: AdminUserEditRow | null;
  locale: "en" | "zh";
  onClose: () => void;
  onSaved: (user: AdminUserEditRow) => void;
};

export function AdminUserEditModal({
  open,
  user,
  locale,
  onClose,
  onSaved,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "jp_vocab">("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpenRef.current && user) {
      setUsername(user.username);
      setPassword("");
      setRole(user.role === "jp_vocab" ? "jp_vocab" : "user");
      setError("");
    }
    wasOpenRef.current = open;
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || submitting || e.isComposing) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          username: username.trim(),
          role,
          ...(password ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.user) {
        setError(String(data.error || (locale === "zh" ? "保存失败" : "Save failed")));
        return;
      }
      onSaved(data.user as AdminUserEditRow);
      onClose();
    } catch {
      setError(locale === "zh" ? "保存失败" : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || !open || !user) return null;

  return createPortal(
    <div
      className="admin-user-edit-overlay"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget || submitting) return;
        onClose();
      }}
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
            disabled={submitting}
            aria-label={locale === "zh" ? "关闭" : "Close"}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="admin-user-edit-body"
          autoComplete="off"
          onSubmit={(e) => void save(e)}
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
              disabled={submitting}
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
              disabled={submitting}
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
              disabled={submitting}
              onChange={(e) => setRole(e.target.value as "user" | "jp_vocab")}
            >
              <option value="user">{locale === "zh" ? "普通用户" : "Regular user"}</option>
              <option value="jp_vocab">
                {locale === "zh" ? "日语教师（可编辑单词等）" : "Japanese teacher"}
              </option>
            </select>
          </label>

          {error ? <p className="admin-user-edit-error">{error}</p> : null}

          <div className="admin-user-edit-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={submitting}
              onClick={onClose}
            >
              {locale === "zh" ? "取消" : "Cancel"}
            </button>
            <button
              type="submit"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              disabled={submitting || !username.trim()}
            >
              {submitting
                ? locale === "zh"
                  ? "保存中…"
                  : "Saving…"
                : locale === "zh"
                  ? "保存"
                  : "Save"}
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
