import type { Metadata } from "next";
import { JapaneseRecognitionApp } from "@/japanese-recognition/components/JapaneseRecognitionApp";
import { buildJapaneseRecognitionMetadata } from "@/lib/japanese-recognition-seo";

export const metadata: Metadata = buildJapaneseRecognitionMetadata();

export default function Page() {
  return <JapaneseRecognitionApp />;
}
