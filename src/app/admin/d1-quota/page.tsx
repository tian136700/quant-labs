import { AdminD1QuotaPageClient } from "@/components/AdminD1QuotaPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "D1 Quota Monitor",
  description:
    "Diagnose Cloudflare D1 daily row read/write quota exhaustion.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

export default function Page() {
  return <AdminD1QuotaPageClient />;
}
