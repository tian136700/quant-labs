import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { hasJpReviewBucket, readJpReviewMeta } from "@/lib/jp-review";
import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "日语口语复习 PDF",
  robots: { index: false, follow: false },
};

function downloadHref(): string {
  const key = process.env.JP_REVIEW_DOWNLOAD_KEY?.trim();
  const base = "/api/jp-review/latest";
  if (!key) return base;
  return `${base}?key=${encodeURIComponent(key)}`;
}

async function loadLastUpdated(): Promise<string | null> {
  const env = await getCloudflareEnv();
  if (!hasJpReviewBucket(env)) return null;
  const meta = await readJpReviewMeta(env.JP_REVIEW);
  if (!meta?.updated_at) return null;
  return formatBeijingDateTime(meta.updated_at);
}

export default async function JpReviewPage() {
  const href = downloadHref();
  const lastUpdated = await loadLastUpdated();

  return (
    <main className="page-wrap" style={{ maxWidth: "640px", paddingTop: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>日语口语复习</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        下载最新一课复习 PDF（由 Mac 每日自动同步）。
      </p>
      {lastUpdated ? (
        <p style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.875rem" }}>
          最近一次更新时间：{lastUpdated}
        </p>
      ) : null}
      <a
        href={href}
        className="btn-rsi-filter btn-rsi-filter--primary"
        style={{ display: "inline-flex", minHeight: "var(--touch-min)" }}
      >
        下载最新 PDF
      </a>
      <p style={{ color: "var(--muted)", marginTop: "1.5rem", fontSize: "0.875rem" }}>
        固定链接：
        <br />
        <code>{SITE_URL}/jp-review</code>
      </p>
    </main>
  );
}
