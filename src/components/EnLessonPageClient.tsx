"use client";

import dynamic from "next/dynamic";

const EnLessonPage = dynamic(
  () => import("@/components/EnLessonPage").then((m) => m.EnLessonPage),
  {
    ssr: false,
    loading: () => (
      <main className="en-lesson-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

/** 英语新课：ssr:false，避免 pdfjs/jspdf 随手画链打进 Worker SSR */
export function EnLessonPageClient() {
  return <EnLessonPage />;
}
