import { Suspense } from "react";
import { EnLessonNotesPage } from "@/components/EnLessonNotesPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "课堂笔记 · 英语新课",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<p style={{ color: "var(--muted)", padding: "1.5rem" }}>加载中…</p>}>
      <EnLessonNotesPage />
    </Suspense>
  );
}
