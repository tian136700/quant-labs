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
  region_label?: string | null;
  area?: string | null;
  isp?: string | null;
  geo_pending?: boolean;
};

type Props = {
  open: boolean;
  user: AdminUserLoginHistoryTarget | null;
  locale: "en" | "zh";
  onClose: () => void;
};

/** 弹窗只软刷新列表；归属地由 30s 定时队列查 ip9，禁止在此打免费接口 */
const SOFT_REFRESH_MS = 30_000;

function regionCellText(row: HistoryRow, locale: "en" | "zh"): string {
  const label = (row.region_label ?? "").trim();
  if (label) {
    const isp = (row.isp ?? "").trim();
    return isp ? `${label} · ${isp}` : label;
  }
  if (row.geo_pending) {
    return locale === "zh"
      ? "排队中（约每 30 秒查一个新 IP）…"
      : "Queued (≈30s per new IP)…";
  }
  return "—";
}

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
  const [refreshHint, setRefreshHint] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;

    const load = async (soft: boolean) => {
      if (!soft) {
        setLoading(true);
        setError("");
        setRows([]);
      }
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
        const next = Array.isArray(data.history) ? data.history : [];
        setRows(next);
        const pending = next.filter((r) => r.geo_pending).length;
        setRefreshHint(
          pending > 0
            ? locale === "zh"
              ? `有 ${pending} 条归属地排队中，定时任务约每 30 秒查一个新 IP（已查过的直接复用）`
              : `${pending} region(s) queued; cron looks up ~1 new IP / 30s`
            : ""
        );
      } catch (err) {
        if (cancelled || soft) return;
        setError(
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "加载失败"
              : "Failed to load"
        );
      } finally {
        if (!cancelled && !soft) setLoading(false);
      }
    };

    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, SOFT_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
                ? `账号「${user.username}」每次登录的 IP 与归属地（新→旧；同 IP 只查一次 ip9，精确到区县）`
                : `Each login IP + region for “${user.username}” (newest first; same IP looked up once via ip9)`}
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
            <>
              {refreshHint ? (
                <p
                  className="hint admin-user-login-history-enrich"
                  aria-live="polite"
                >
                  {refreshHint}
                </p>
              ) : null}
              <div className="admin-user-login-history-table-wrap">
                <table className="admin-user-login-history-table">
                  <thead>
                    <tr>
                      <th>
                        {locale === "zh"
                          ? "登录时间（北京）"
                          : "Login time (Beijing)"}
                      </th>
                      <th>{locale === "zh" ? "登录 IP" : "Login IP"}</th>
                      <th>
                        {locale === "zh"
                          ? "归属地（省/市/区县）"
                          : "Region (prov/city/county)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatBeijingDateTime(row.login_at)}</td>
                        <td className="admin-user-login-history-ip">
                          {row.login_ip_display || "—"}
                        </td>
                        <td className="admin-user-login-history-region">
                          {regionCellText(row, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
