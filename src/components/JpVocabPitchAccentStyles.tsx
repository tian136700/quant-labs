"use client";

/** OJAD 音调顶横线：卡片与词表共用；H 用 currentColor 以适配深/浅主题。 */
export function JpVocabPitchAccentStyles() {
  return (
    <style jsx global>{`
      :global(.jp-vocab-pitch-accent) {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: flex-end;
        letter-spacing: 0.04em;
        font-weight: inherit;
        color: inherit;
      }
      :global(.jp-vocab-pitch-accent--hero) {
        font-size: clamp(1.85rem, 7vw, 2.35rem);
        font-weight: 700;
        line-height: 1.2;
      }
      :global(.jp-vocab-pitch-accent--table) {
        font-size: inherit;
        font-weight: inherit;
        line-height: 1.45;
      }
      :global(.jp-vocab-pitch-accent--pos) {
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.35;
        color: var(--text);
      }
      :global(.jp-vocab-pitch-accent--pos .jp-vocab-pitch-accent__mora) {
        padding-top: 0.18em;
        min-width: 1em;
      }
      :global(.jp-vocab-pitch-accent__mora) {
        display: inline-block;
        min-width: 1.05em;
        text-align: center;
        padding-top: 0.22em;
        box-sizing: border-box;
      }
      :global(.jp-vocab-pitch-accent__mora--high) {
        border-top: 2px solid currentColor;
      }
      :global(.jp-vocab-pitch-accent__mora--nucleus) {
        color: var(--rise, #e85d6f);
        border-top: 2px solid var(--rise, #e85d6f);
      }
    `}</style>
  );
}
