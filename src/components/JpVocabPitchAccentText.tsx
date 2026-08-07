"use client";

import {
  parseJpVocabPitchAccent,
  type JpVocabPitchAccent,
} from "@/lib/jp-vocab-pitch-accent";

type Props = {
  /** DB JSON string or parsed object */
  pitchAccent: string | JpVocabPitchAccent | null | undefined;
  className?: string;
};

/** OJAD-style top bar on each mora (L=no bar, H=black bar, N=red bar). */
export function JpVocabPitchAccentText({ pitchAccent, className }: Props) {
  const parsed =
    typeof pitchAccent === "string"
      ? parseJpVocabPitchAccent(pitchAccent)
      : pitchAccent ?? null;
  if (!parsed?.moras?.length) return null;

  return (
    <span
      className={`jp-vocab-pitch-accent${className ? ` ${className}` : ""}`}
      aria-label={`音调 ${parsed.pattern}`}
    >
      {parsed.moras.map((m, i) => {
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
