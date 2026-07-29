"use client";

import { useEffect, useState } from "react";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { WorkerTrafficIpRow } from "@/lib/worker-traffic-db";

type Labels = {
  routeIpsHeading: string;
  ip: string;
  hits: string;
  empty: string;
  loadFailed: string;
  close: string;
  routeIpsHint: string;
};

type Props = {
  open: boolean;
  statDate: string;
  routeKey: string;
  labels: Labels;
  onClose: () => void;
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function AdminWorkerTrafficRouteIpModal({
  open,
  statDate,
  routeKey,
  labels,
  onClose,
}: Props) {
  const [rows, setRows] = useState<WorkerTrafficIpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open || !routeKey) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ date: statDate, route: routeKey });
    void fetch(`/api/analytics/traffic?${params}`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          top_ips?: WorkerTrafficIpRow[];
        };
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error || labels.loadFailed);
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.top_ips) ? data.top_ips : []);
      })
      .catch(() => {
        if (!cancelled) {
          setError(labels.loadFailed);
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, routeKey, statDate, labels.loadFailed]);

  if (!open) return null;

  return (
    <div
      className="admin-traffic-ip-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="admin-traffic-ip-modal"
        role="dialog"
        aria-modal="true"
        aria-label={labels.routeIpsHeading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-traffic-ip-modal-head">
          <h3>{labels.routeIpsHeading}</h3>
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact"
            onClick={onClose}
          >
            {labels.close}
          </button>
        </div>
        <p className="hint admin-traffic-ip-modal-route">{routeKey}</p>
        <p className="hint">{labels.routeIpsHint}</p>
        {error ? (
          <p className="telegram-push-result telegram-push-result--err">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="hint">…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="compare-table etr-table admin-table">
              <thead>
                <tr>
                  <th>{labels.ip}</th>
                  <th>{labels.hits}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={2}>{labels.empty}</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.ip}>
                      <td className="admin-cell-wrap admin-traffic-ip-cell">
                        {row.ip}
                      </td>
                      <td>{formatNumber(row.hit_count)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
