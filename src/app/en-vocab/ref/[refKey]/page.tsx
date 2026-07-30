import { notFound } from "next/navigation";
import { EnVocabRefViewerClient } from "@/components/EnVocabRefViewerClient";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getEnLessonByRefKey } from "@/lib/en-lesson-db";
import { getEnVocabRef } from "@/lib/en-vocab-db";
import { enLessonRefDownloadFilename } from "@/lib/en-vocab-ref-shared";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ refKey: string }>;
}): Promise<Metadata> {
  const { refKey } = await params;
  const env = await getCloudflareEnv();
  const ref = await getEnVocabRef(env.DB, refKey);
  return {
    title: ref?.title?.trim() || refKey || "教案",
    robots: { index: false, follow: false },
  };
}

export default async function EnVocabRefViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ refKey: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { refKey } = await params;
  const { v } = await searchParams;
  const env = await getCloudflareEnv();
  const ref = await getEnVocabRef(env.DB, refKey);
  if (!ref) notFound();

  const lesson = await getEnLessonByRefKey(env.DB, refKey);
  const downloadFilename = lesson
    ? enLessonRefDownloadFilename(lesson, ref.media_type)
    : undefined;

  return (
    <EnVocabRefViewerClient
      refMeta={ref}
      cacheVersion={v ?? null}
      downloadFilename={downloadFilename}
      cropKind={lesson?.kind ?? null}
    />
  );
}
