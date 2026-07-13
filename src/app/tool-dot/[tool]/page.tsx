import { notFound } from "next/navigation";
import { ToolDotConverterClient } from "@/tool-dot/components/ToolDotConverterClient";
import { getToolDefinition } from "@/tool-dot/tools";
import type { Metadata } from "next";

type Props = { params: Promise<{ tool: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = getToolDefinition(slug);
  if (!tool) return { title: "Tool" };
  const titles: Record<string, string> = {
    "pdf-to-word": "PDF to Word",
    "pdf-to-excel": "PDF to Excel",
    "word-to-pdf": "Word to PDF",
  };
  return { title: titles[tool.id] ?? "Tool" };
}

export default async function Page({ params }: Props) {
  const { tool: slug } = await params;
  const tool = getToolDefinition(slug);
  if (!tool) notFound();
  return <ToolDotConverterClient tool={tool} />;
}
