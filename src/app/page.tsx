import { ComparePage } from "@/components/ComparePage";
import { JsonLd } from "@/components/JsonLd";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-static";

export const metadata = buildPageMetadata({ locale: "en" });

export default function Page() {
  return (
    <>
      <JsonLd locale="en" />
      <ComparePage />
    </>
  );
}
