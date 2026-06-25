import { AdminToolCodesPage } from "@/components/AdminToolCodesPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tool Redemption Codes",
  description: "Generate one-time codes for online document tools.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminToolCodesPage />;
}
