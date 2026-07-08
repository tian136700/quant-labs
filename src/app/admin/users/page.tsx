import { AdminUsersPage } from "@/components/AdminUsersPage";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User Management",
  description: "Manage user accounts.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminUsersPage />;
}
