import { EnVocabReviewPage } from "@/components/EnVocabReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语复习",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <EnVocabReviewPage />;
}
