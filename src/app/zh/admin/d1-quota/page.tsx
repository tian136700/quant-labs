import { AdminD1QuotaPageClient } from "@/components/AdminD1QuotaPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "D1 额度检测",
  description: "排查 Cloudflare D1 日读/写行数配额是否顶满。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

export default function Page() {
  return <AdminD1QuotaPageClient />;
}
