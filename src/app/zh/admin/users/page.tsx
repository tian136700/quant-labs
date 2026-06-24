import { AdminUsersPage } from "@/components/AdminUsersPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "用户管理",
  description: "管理用户账号。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminUsersPage />;
}
