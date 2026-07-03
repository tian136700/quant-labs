import { JpLessonSchedulePage } from "@/components/JpLessonSchedulePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日程管理 · 日语新课",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <JpLessonSchedulePage />;
}
