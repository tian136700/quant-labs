"use client";

import {
  mapJpVocabPitchAccentOntoDisplayText,
  parseJpVocabPitchAccent,
  type JpVocabPitchAccent,
} from "@/lib/jp-vocab-pitch-accent";

type Props = {
  /** OJAD JSON 或已解析对象（只取 L/H/N 拍型，不替换页面文字） */
  pitchAccent: string | JpVocabPitchAccent | null | undefined;
  /**
   * 页面原读音（如「イギリス」）。必须传；横线画在这些字上。
   * 禁止省略——否则会误把 OJAD 平假名当展示文。
   */
  displayText: string;
  className?: string;
};

/** OJAD 式顶横线：字用 displayText，音调用 pitchAccent（L 无 / H 顶线 / N 红核）。 */
export function JpVocabPitchAccentText({
  pitchAccent,
  displayText,
  className,
}: Props) {
  const parsed =
    typeof pitchAccent === "string"
      ? parseJpVocabPitchAccent(pitchAccent)
      : pitchAccent ?? null;
  const displayTrim = (displayText ?? "").trim();
  if (!parsed?.moras?.length || !displayTrim) return null;

  const displayMoras = mapJpVocabPitchAccentOntoDisplayText(parsed, displayTrim);
  if (!displayMoras?.length) return null;

  return (
    <span
      className={`jp-vocab-pitch-accent${className ? ` ${className}` : ""}`}
      aria-label={`音调 ${parsed.pattern}`}
    >
      {displayMoras.map((m, i) => {
        const cls =
          m.p === "H"
            ? "jp-vocab-pitch-accent__mora jp-vocab-pitch-accent__mora--high"
            : m.p === "N"
              ? "jp-vocab-pitch-accent__mora jp-vocab-pitch-accent__mora--nucleus"
              : "jp-vocab-pitch-accent__mora";
        return (
          <span key={`${m.c}-${i}`} className={cls}>
            {m.c}
          </span>
        );
      })}
    </span>
  );
}
