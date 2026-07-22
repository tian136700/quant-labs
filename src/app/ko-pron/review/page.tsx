import { KoPronReviewPage } from "@/components/KoPronReviewPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "韩语发音复习",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KoPronReviewPage />;
}
