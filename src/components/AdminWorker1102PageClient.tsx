"use client";

import dynamic from "next/dynamic";

const AdminWorker1102Page = dynamic(
  () =>
    import("@/components/AdminWorker1102Page").then((m) => m.AdminWorker1102Page),
  {
    ssr: false,
    loading: () => (
      <div className="admin-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </div>
    ),
  }
);

export function AdminWorker1102PageClient() {
  return <AdminWorker1102Page />;
}
