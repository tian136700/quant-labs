import { KoPronPage } from "@/components/KoPronPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "韩语发音抽问-老师端",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KoPronPage variant="teacher" />;
}
