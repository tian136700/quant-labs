import { JpVocabPage } from "@/components/JpVocabPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日语抽问-管理员端",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <JpVocabPage variant="admin" />;
}
