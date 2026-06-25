import { ToolDotHomePage } from "@/tool-dot/components/ToolDotHomePage";
import { buildToolDotMetadata } from "@/lib/tool-dot-seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildToolDotMetadata("zh");

export default function Page() {
  return <ToolDotHomePage />;
}
