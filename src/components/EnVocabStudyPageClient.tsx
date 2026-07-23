"use client";

import dynamic from "next/dynamic";

const EnVocabStudyPage = dynamic(
  () =>
    import("@/components/EnVocabStudyPage").then((m) => m.EnVocabStudyPage),
  {
    ssr: false,
    loading: () => (
      <main className="jp-vocab-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

export function EnVocabStudyPageClient() {
  return <EnVocabStudyPage />;
}
