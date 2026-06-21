import { AdminTrendsPage } from "@/components/AdminTrendsPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trend Aggregator",
  description: "Review daily trend fetches and AI prompts.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminTrendsPage />;
}
