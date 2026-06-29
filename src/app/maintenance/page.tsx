import { Suspense } from "react";
import { MaintenancePage } from "@/components/MaintenancePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feature Under Maintenance",
  description: "The feature you're trying to access is under maintenance. Please try again later.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MaintenancePage />
    </Suspense>
  );
}
