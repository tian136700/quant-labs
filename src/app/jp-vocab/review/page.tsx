import { JpVocabReviewPage } from "@/components/JpVocabReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日语复习",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JpVocabReviewPage />;
}
