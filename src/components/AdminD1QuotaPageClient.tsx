"use client";

import dynamic from "next/dynamic";

const AdminD1QuotaPage = dynamic(
  () => import("@/components/AdminD1QuotaPage").then((m) => m.AdminD1QuotaPage),
  {
    ssr: false,
    loading: () => (
      <div className="admin-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </div>
    ),
  }
);

export function AdminD1QuotaPageClient() {
  return <AdminD1QuotaPage />;
}
