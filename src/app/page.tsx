import { ComparePageGate } from "@/components/ComparePageGate";
import { JsonLd } from "@/components/JsonLd";
import { COMPARE_ADMIN_ONLY } from "@/lib/feature-flags";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = COMPARE_ADMIN_ONLY
  ? {
      title: "Sign in | Strategy Compare",
      description: "Sign in to access Strategy Compare.",
      robots: { index: false, follow: false },
    }
  : buildPageMetadata({ locale: "en" });

export default function Page() {
  return (
    <>
      {!COMPARE_ADMIN_ONLY ? <JsonLd locale="en" /> : null}
      <ComparePageGate />
    </>
  );
}
