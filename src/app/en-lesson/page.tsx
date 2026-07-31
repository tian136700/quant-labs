import { EnLessonPageClient } from "@/components/EnLessonPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语新课",
  robots: { index: false, follow: false },
};

/** 纯客户端壳：须静态 HTML，禁止 force-dynamic（每次 SSR 易 Worker 1102） */
export const dynamic = "force-static";

export default function Page() {
  return <EnLessonPageClient />;
}
