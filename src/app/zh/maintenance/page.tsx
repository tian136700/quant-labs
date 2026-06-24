import { MaintenancePage } from "@/components/MaintenancePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "你所访问的功能正在维护中",
  description: "你所访问的功能正在维护中，请稍后再试。",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MaintenancePage />;
}
