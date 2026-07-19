import { EnVocabPage } from "@/components/EnVocabPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "英语抽背-管理员端",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <EnVocabPage variant="admin" />;
}
