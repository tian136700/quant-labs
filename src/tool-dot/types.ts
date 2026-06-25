export const TOOL_DOT_TYPES = [
  "pdf-to-word",
  "pdf-to-excel",
  "word-to-pdf",
  "any",
] as const;

export type ToolDotType = (typeof TOOL_DOT_TYPES)[number];

export type ToolDotCodeRecord = {
  id: number;
  code: string;
  tool_type: ToolDotType;
  label: string | null;
  consumed_at: string | null;
  consumed_ip: string | null;
  consumed_filename: string | null;
  created_by_admin_id: number | null;
  created_at: string;
};

export type CreateToolDotCodesInput = {
  tool_type: ToolDotType;
  count: number;
  label?: string | null;
  admin_id: number;
};

export type CreateToolDotCodesResult =
  | { ok: true; codes: string[] }
  | { ok: false; error: string };

export type ClaimToolDotCodeResult =
  | { ok: true }
  | { ok: false; error: string };
