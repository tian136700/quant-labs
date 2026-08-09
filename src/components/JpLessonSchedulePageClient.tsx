"use client";

import dynamic from "next/dynamic";

const JpLessonSchedulePage = dynamic(
  () =>
    import("@/components/JpLessonSchedulePage").then(
      (m) => m.JpLessonSchedulePage
    ),
  {
    ssr: false,
    loading: () => (
      <main className="admin-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

/** 日程管理：ssr:false，避免重客户端页在 Worker 上 SSR 触发 Error 1102 */
export function JpLessonSchedulePageClient() {
  return <JpLessonSchedulePage />;
}
