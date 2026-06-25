import { AdminToolCodesPage } from "@/components/AdminToolCodesPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "工具兑换码",
  description: "为在线文档转换工具生成一次性兑换码。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminToolCodesPage />;
}
