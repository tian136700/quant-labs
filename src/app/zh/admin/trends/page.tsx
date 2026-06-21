import { AdminTrendsPage } from "@/components/AdminTrendsPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "趋势抓取",
  description: "查看每日趋势抓取与 AI 提示词。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminTrendsPage />;
}
