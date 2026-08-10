import { AdminWorker1102PageClient } from "@/components/AdminWorker1102PageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "1102 诊断看板",
  description: "定位 Cloudflare Workers Error 1102（单次请求资源顶满）。",
  robots: { index: false, follow: false },
};

/** 纯客户端壳：须静态 HTML，禁止 force-dynamic（每次 SSR 易 Worker 1102） */
export const dynamic = "force-static";

export default function Page() {
  return <AdminWorker1102PageClient />;
}
