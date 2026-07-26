"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatBeijingDateTime } from "@/lib/format-datetime";

export type AdminUserLoginHistoryTarget = {
  id: number;
  username: string;
};

type HistoryRow = {
  id: number;
  login_at: string;
  login_ip: string | null;
  login_ip_display: string;
};

type Props = {
  open: boolean;
  user: AdminUserLoginHistoryTarget | null;
  locale: "en" | "zh";
  onClose: () => void;
};

export function AdminUserLoginHistoryModal({
  open,
  user,
  locale,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/users/login-history?user_id=${user.id}`,
          { credentials: "include" }
        );
        const data = (await res.json()) as {
          ok?: boolean;
          history?: HistoryRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!data.ok) {
          throw new Error(
            String(
              data.error ||
                (locale === "zh" ? "加载失败" : "Failed to load")
            )
          );
        }
        setRows(Array.isArray(data.history) ? data.history : []);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "加载失败"
              : "Failed to load"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, locale]);

  // Body scroll: AdminUsersPage anyModalOpen → lockBodyScroll (do not nest here).

  if (!mounted || !open || !user) return null;

  return createPortal(
    <div
      className="admin-users-modal-overlay"
      onMouseDown={(e) => {
        closeModalOnBackdropMouseDown(e, onClose);
      }}
    >
      <div
        className="admin-users-modal admin-user-login-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-login-history-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-users-modal-header">
          <div>
            <h2
              id="admin-user-login-history-title"
              className="admin-users-modal-title"
            >
              {locale === "zh" ? "历史登录 IP" : "Login IP history"}
            </h2>
            <p className="admin-users-modal-subtitle">
              {locale === "zh"
                ? `账号「${user.username}」每次登录的 IP（新→旧，最多 100 条）`
                : `Each login IP for “${user.username}” (newest first, up to 100)`}
            </p>
          </div>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={onClose}
          >
            {locale === "zh" ? "关闭" : "Close"}
          </button>
        </div>

        <div className="admin-users-modal-body admin-user-login-history-body">
          {loading ? (
            <p className="hint">
              {locale === "zh" ? "加载中…" : "Loading…"}
            </p>
          ) : error ? (
            <p className="telegram-push-result telegram-push-result--err">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="hint">
              {locale === "zh"
                ? "暂无登录记录。用户下次登录后会出现在这里。"
                : "No login history yet. Entries appear after the next login."}
            </p>
          ) : (
            <div className="admin-user-login-history-table-wrap">
              <table className="admin-user-login-history-table">
                <thead>
                  <tr>
                    <th>{locale === "zh" ? "登录时间（北京）" : "Login time (Beijing)"}</th>
                    <th>{locale === "zh" ? "登录 IP" : "Login IP"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatBeijingDateTime(row.login_at)}</td>
                      <td className="admin-user-login-history-ip">
                        {row.login_ip_display || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
