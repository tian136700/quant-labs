import { JpVocabPage } from "@/components/JpVocabPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日语单词 / 语法抽问",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JpVocabPage />;
}
