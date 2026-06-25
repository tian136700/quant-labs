import type { ToolDotType } from "./types";

export type ToolDotDefinition = {
  id: Exclude<ToolDotType, "any">;
  icon: string;
  accept: string;
  ext: string;
  maxMb: number;
};

export const TOOL_DOT_DEFINITIONS: ToolDotDefinition[] = [
  {
    id: "pdf-to-word",
    icon: "📄→📝",
    accept: ".pdf,application/pdf",
    ext: "docx",
    maxMb: 20,
  },
  {
    id: "pdf-to-excel",
    icon: "📄→📊",
    accept: ".pdf,application/pdf",
    ext: "xlsx",
    maxMb: 20,
  },
  {
    id: "word-to-pdf",
    icon: "📝→📄",
    accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "pdf",
    maxMb: 20,
  },
];

export function getToolDefinition(id: string): ToolDotDefinition | null {
  return TOOL_DOT_DEFINITIONS.find((t) => t.id === id) ?? null;
}

export function toolMatchesCode(toolType: ToolDotType, codeToolType: ToolDotType): boolean {
  if (codeToolType === "any") return true;
  return toolType === codeToolType;
}
