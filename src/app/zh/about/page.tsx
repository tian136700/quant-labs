import { AboutPage } from "@/components/AboutPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于与反馈",
  description: "对本站提出建议，帮助我们改进策略对比与英语老师评价等功能。",
};

export default function Page() {
  return <AboutPage />;
}
