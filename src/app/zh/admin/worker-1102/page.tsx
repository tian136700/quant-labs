import { AdminWorker1102Page } from "@/components/AdminWorker1102Page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "1102 诊断看板",
  description: "定位 Cloudflare Workers Error 1102（单次请求资源顶满）。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminWorker1102Page />;
}
