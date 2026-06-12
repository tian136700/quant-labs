import { AdminDashboardPage } from "@/components/AdminDashboardPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "后台管理",
  description: "查看访问日志与用户反馈。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminDashboardPage />;
}
