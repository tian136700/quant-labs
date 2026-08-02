"use client";

import dynamic from "next/dynamic";

const KoPronStudyPage = dynamic(
  () =>
    import("@/components/KoPronStudyPage").then((m) => m.KoPronStudyPage),
  {
    ssr: false,
    loading: () => (
      <main className="jp-vocab-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

export function KoPronStudyPageClient() {
  return <KoPronStudyPage />;
}
