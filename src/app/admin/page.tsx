import { AdminDashboardPage } from "@/components/AdminDashboardPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "View visit logs and user feedback submissions.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminDashboardPage />;
}
