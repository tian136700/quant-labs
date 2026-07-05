import { EnVocabPage } from "@/components/EnVocabPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语单词 / 语法抽问",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <EnVocabPage />;
}
