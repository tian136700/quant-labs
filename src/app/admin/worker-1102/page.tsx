import { AdminWorker1102PageClient } from "@/components/AdminWorker1102PageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Worker 1102 Monitor",
  description:
    "Diagnose Cloudflare Workers Error 1102 (resource limits) risk factors.",
  robots: { index: false, follow: false },
};

/** 纯客户端壳：须静态 HTML，禁止 force-dynamic（每次 SSR 易 Worker 1102） */
export const dynamic = "force-static";

export default function Page() {
  return <AdminWorker1102PageClient />;
}
