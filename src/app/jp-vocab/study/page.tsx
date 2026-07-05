import { JpVocabStudyPage } from "@/components/JpVocabStudyPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今日背单词",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <JpVocabStudyPage />;
}
