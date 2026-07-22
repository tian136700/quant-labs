import { KoPronStudyPage } from "@/components/KoPronStudyPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今日韩语发音",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KoPronStudyPage />;
}
