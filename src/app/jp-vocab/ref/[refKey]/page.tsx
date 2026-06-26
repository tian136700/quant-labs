import { notFound } from "next/navigation";
import { JpVocabRefViewer } from "@/components/JpVocabRefViewer";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getJpVocabRef } from "@/lib/jp-vocab-db";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ refKey: string }>;
}): Promise<Metadata> {
  const { refKey } = await params;
  const env = await getCloudflareEnv();
  const ref = await getJpVocabRef(env.DB, refKey);
  return {
    title: ref?.title?.trim() || refKey || "教案",
    robots: { index: false, follow: false },
  };
}

export default async function JpVocabRefViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ refKey: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { refKey } = await params;
  const { v } = await searchParams;
  const env = await getCloudflareEnv();
  const ref = await getJpVocabRef(env.DB, refKey);
  if (!ref) notFound();

  return <JpVocabRefViewer ref={ref} cacheVersion={v ?? null} />;
}
