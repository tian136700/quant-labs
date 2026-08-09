"use client";

import dynamic from "next/dynamic";
import type { JpVocabRef } from "@/lib/types";

const JpVocabRefViewer = dynamic(
  () =>
    import("@/components/JpVocabRefViewer").then((m) => m.JpVocabRefViewer),
  {
    ssr: false,
    loading: () => (
      <main className="jp-vocab-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

type Props = {
  refMeta: JpVocabRef;
  cacheVersion?: string | null;
  downloadFilename?: string;
  cropKind?: "word" | "grammar" | null;
  wordCount?: number | null;
};

/** 参考图查看：ssr:false，避免 jspdf/docx 下载链打进 Worker SSR */
export function JpVocabRefViewerClient(props: Props) {
  return <JpVocabRefViewer {...props} />;
}
