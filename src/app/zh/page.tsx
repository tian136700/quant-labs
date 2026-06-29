import { ComparePage } from "@/components/ComparePage";
import { JsonLd } from "@/components/JsonLd";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-static";

export const metadata = buildPageMetadata({ locale: "zh" });

export default function ZhPage() {
  return (
    <>
      <JsonLd locale="zh" />
      <ComparePage />
    </>
  );
}
