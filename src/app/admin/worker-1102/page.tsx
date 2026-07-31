import { AdminWorker1102Page } from "@/components/AdminWorker1102Page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Worker 1102 Monitor",
  description:
    "Diagnose Cloudflare Workers Error 1102 (resource limits) risk factors.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminWorker1102Page />;
}
