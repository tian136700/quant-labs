import { EnVocabStudyPageClient } from "@/components/EnVocabStudyPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今日背英语单词",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <EnVocabStudyPageClient />;
}
