"use client";

type Props = {
  /** 来源文案，如「Qwen本地」「DeepSeek」「手动」 */
  source?: string | null;
  /** 前缀，默认「来源」；释义列可用「释义来源」 */
  label?: string;
  className?: string;
};

/** 字段旁的小号来源标记（老师端排查模型用） */
export function JpVocabSourceLabel({
  source,
  label = "来源",
  className,
}: Props) {
  const text = (source || "").trim();
  if (!text) return null;
  return (
    <span
      className={["jp-vocab-source-label", className].filter(Boolean).join(" ")}
      title={`${label}：${text}`}
    >
      {label}：{text}
    </span>
  );
}
