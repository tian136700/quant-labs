"use client";

import dynamic from "next/dynamic";

const EnVocabPage = dynamic(
  () => import("@/components/EnVocabPage").then((m) => m.EnVocabPage),
  {
    ssr: false,
    loading: () => (
      <main className="jp-vocab-page">
        <p style={{ padding: "1.25rem", color: "var(--muted)" }}>加载中…</p>
      </main>
    ),
  }
);

type EnVocabPageClientProps = {
  variant: "teacher" | "admin";
};

/** 老师/管理员入口壳：禁止在 route 上 force-dynamic（文档 SSR 易 1102） */
export function EnVocabPageClient({ variant }: EnVocabPageClientProps) {
  return <EnVocabPage variant={variant} />;
}
