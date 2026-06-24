import { AdminRbacPage } from "@/components/AdminRbacPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Role Permissions",
  description: "Manage role-based access control.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminRbacPage />;
}
