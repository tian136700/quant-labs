"use client";

import dynamic from "next/dynamic";

const JpLessonPage = dynamic(
  () => import("@/components/JpLessonPage").then((m) => m.JpLessonPage),
  {
    ssr: false,
    loading: () => (
      <main className="jp-lesson-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

/** 日语新课：ssr:false，避免 pdfjs/jspdf 随手画链打进 Worker SSR */
export function JpLessonPageClient() {
  return <JpLessonPage />;
}
