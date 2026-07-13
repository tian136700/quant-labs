import { JpVocabCoachPage } from "@/components/JpVocabCoachPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "课堂带读",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JpVocabCoachPage />;
}
