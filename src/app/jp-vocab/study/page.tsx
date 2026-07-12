import { JpVocabStudyPage } from "@/components/JpVocabStudyPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今日日语单词",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JpVocabStudyPage />;
}
