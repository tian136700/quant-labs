import { AdminWorkerTrafficPage } from "@/components/AdminWorkerTrafficPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Worker Traffic Monitor",
  description: "Diagnose Cloudflare Workers Error 1027 daily request quota usage.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminWorkerTrafficPage />;
}
