"use client";

import dynamic from "next/dynamic";

const JpVocabStudyPage = dynamic(
  () =>
    import("@/components/JpVocabStudyPage").then((m) => m.JpVocabStudyPage),
  {
    ssr: false,
    loading: () => (
      <main className="jp-vocab-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

export function JpVocabStudyPageClient() {
  return <JpVocabStudyPage />;
}
