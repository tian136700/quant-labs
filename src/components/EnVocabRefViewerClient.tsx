"use client";

import dynamic from "next/dynamic";
import type { EnVocabRef } from "@/lib/types";

const EnVocabRefViewer = dynamic(
  () =>
    import("@/components/EnVocabRefViewer").then((m) => m.EnVocabRefViewer),
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
  refMeta: EnVocabRef;
  cacheVersion?: string | null;
  downloadFilename?: string;
  cropKind?: "word" | "grammar" | null;
};

/** 参考图查看：ssr:false，避免 jspdf/docx 下载链打进 Worker SSR */
export function EnVocabRefViewerClient(props: Props) {
  return <EnVocabRefViewer {...props} />;
}
