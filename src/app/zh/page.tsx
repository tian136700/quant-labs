import { ComparePage } from "@/components/ComparePage";
import { JsonLd } from "@/components/JsonLd";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

type PageProps = {
  searchParams: Promise<{ symbol?: string; years?: string }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  return buildPageMetadata({
    locale: "zh",
    symbol: sp.symbol,
    years: sp.years,
  });
}

export default function ZhPage() {
  return (
    <>
      <JsonLd locale="zh" />
      <ComparePage />
    </>
  );
}
