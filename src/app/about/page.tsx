import { AboutPage } from "@/components/AboutPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About & Feedback",
  description:
    "Share suggestions for Strategy Compare and English Teacher Review.",
};

export default function Page() {
  return <AboutPage />;
}
