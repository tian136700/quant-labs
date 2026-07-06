import { ComparePageGate } from "@/components/ComparePageGate";
import { JsonLd } from "@/components/JsonLd";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = COMPARE_ADMIN_ONLY
  ? {
      title: "登录 · 策略对比",
      description: "登录后访问策略对比功能。",
      robots: { index: false, follow: false },
    }
  : buildPageMetadata({ locale: "zh" });

export default function ZhPage() {
  return (
    <>
      {!COMPARE_ADMIN_ONLY ? <JsonLd locale="zh" /> : null}
      <ComparePageGate />
    </>
  );
}
