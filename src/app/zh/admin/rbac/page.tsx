import { AdminRbacPage } from "@/components/AdminRbacPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "角色权限管理",
  description: "配置各角色的功能权限。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminRbacPage />;
}
