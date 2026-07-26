"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { ipKey } from "@/lib/client-ip";

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
  geo_loading?: boolean;
};

type Props = {
  open: boolean;
  user: AdminUserLoginHistoryTarget | null;
  locale: "en" | "zh";
  onClose: () => void;
};

/** 客户端补全间隔：与服务端 IP9_MIN_INTERVAL_MS 对齐，禁止并行 */
const GEO_ENRICH_GAP_MS = 1600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function regionCellText(row: HistoryRow, locale: "en" | "zh"): string {
  if (row.geo_loading) {
    return locale === "zh" ? "查询中…" : "Looking up…";
  }
  const label = (row.region_label ?? "").trim();
  if (label) {
    const isp = (row.isp ?? "").trim();
    return isp ? `${label} · ${isp}` : label;
  }
  if (row.geo_pending) {
    return locale === "zh" ? "排队查询…" : "Queued…";
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
  const [enrichStatus, setEnrichStatus] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setRows([]);
    setEnrichStatus("");
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

  // 串行补全归属地：同一时刻只查一个 IP，间隔 ≥ 1.6s
  useEffect(() => {
    if (!open || loading || error || rows.length === 0) return;

    const pendingKeys: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = ipKey(row.login_ip);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (row.geo_pending && !(row.region_label ?? "").trim()) {
        pendingKeys.push(key);
      }
    }
    if (pendingKeys.length === 0) {
      setEnrichStatus("");
      return;
    }

    let cancelled = false;
    void (async () => {
      for (let i = 0; i < pendingKeys.length; i++) {
        if (cancelled) return;
        const key = pendingKeys[i];
        setEnrichStatus(
          locale === "zh"
            ? `正在查询归属地 ${i + 1}/${pendingKeys.length}（逐个请求，避免封 IP）…`
            : `Looking up region ${i + 1}/${pendingKeys.length} (one at a time)…`
        );
        setRows((prev) =>
          prev.map((row) =>
            ipKey(row.login_ip) === key
              ? { ...row, geo_loading: true }
              : row
          )
        );

        try {
          const res = await fetch(
            `/api/admin/users/ip-geo?ip=${encodeURIComponent(key)}`,
            { credentials: "include" }
          );
          const data = (await res.json()) as {
            ok?: boolean;
            geo?: {
              region_label?: string | null;
              area?: string | null;
              isp?: string | null;
              ok?: boolean;
            } | null;
          };
          if (cancelled) return;
          const geo = data.ok ? data.geo : null;
          const label =
            geo?.ok && geo.region_label?.trim() ? geo.region_label.trim() : "";
          setRows((prev) =>
            prev.map((row) =>
              ipKey(row.login_ip) === key
                ? {
                    ...row,
                    region_label: label || null,
                    area: geo?.ok ? geo.area ?? null : null,
                    isp: geo?.ok ? geo.isp ?? null : null,
                    geo_pending: false,
                    geo_loading: false,
                  }
                : row
            )
          );
        } catch {
          if (cancelled) return;
          setRows((prev) =>
            prev.map((row) =>
              ipKey(row.login_ip) === key
                ? { ...row, geo_pending: false, geo_loading: false }
                : row
            )
          );
        }

        if (i < pendingKeys.length - 1 && !cancelled) {
          await sleep(GEO_ENRICH_GAP_MS);
        }
      }
      if (!cancelled) setEnrichStatus("");
    })();

    return () => {
      cancelled = true;
    };
    // 仅在列表首次就绪 / 打开时跑；不要因 geo 字段更新重入
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot enrich per load
  }, [open, loading, error, rows.length, user?.id, locale]);

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
                ? `账号「${user.username}」每次登录的 IP 与归属地（新→旧，最多 100 条；区县来自 ip9）`
                : `Each login IP + region for “${user.username}” (newest first, up to 100; county via ip9)`}
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
              {enrichStatus ? (
                <p className="hint admin-user-login-history-enrich" aria-live="polite">
                  {enrichStatus}
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
