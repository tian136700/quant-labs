import { notFound } from "next/navigation";
import { JpVocabRefViewerClient } from "@/components/JpVocabRefViewerClient";
import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { getJpLessonByRefKey } from "@/lib/jp-lesson-db";
import { jpLessonCropKind, parseLessonContent } from "@/lib/jp-lesson-shared";
import { getJpVocabRef } from "@/lib/jp-vocab-db";
import { jpLessonRefDownloadFilename } from "@/lib/jp-vocab-ref-shared";
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

  const lesson = await getJpLessonByRefKey(env.DB, refKey);
  const downloadFilename = lesson
    ? jpLessonRefDownloadFilename(lesson, ref.media_type)
    : undefined;
  const cropKind = lesson ? jpLessonCropKind(lesson.kind) : null;
  const wordCount =
    lesson && cropKind === "word"
      ? parseLessonContent(lesson.content).length
      : null;

  return (
    <JpVocabRefViewerClient
      refMeta={ref}
      cacheVersion={v ?? null}
      downloadFilename={downloadFilename}
      cropKind={cropKind}
      wordCount={wordCount}
    />
  );
}
