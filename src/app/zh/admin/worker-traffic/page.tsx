import { AdminWorkerTrafficPage } from "@/components/AdminWorkerTrafficPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "流量检测看板",
  description: "定位 Cloudflare Workers Error 1027（日请求顶满）的流量与配额。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminWorkerTrafficPage />;
}
