import { JpVocabStudyPageClient } from "@/components/JpVocabStudyPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今日日语单词",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <JpVocabStudyPageClient />;
}
