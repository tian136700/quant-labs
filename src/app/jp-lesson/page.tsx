import { JpLessonPageClient } from "@/components/JpLessonPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日语新课",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <JpLessonPageClient />;
}
