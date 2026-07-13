"use client";

import dynamic from "next/dynamic";
import type { ToolDotDefinition } from "@/tool-dot/tools";

const ToolDotConverterPage = dynamic(
  () =>
    import("@/tool-dot/components/ToolDotConverterPage").then((m) => m.ToolDotConverterPage),
  { ssr: false }
);

type Props = {
  tool: ToolDotDefinition;
};

export function ToolDotConverterClient({ tool }: Props) {
  return <ToolDotConverterPage tool={tool} />;
}
