import { KoPronSelectPage } from "@/components/KoPronSelectPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "韩语发音勾选",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <KoPronSelectPage />;
}
