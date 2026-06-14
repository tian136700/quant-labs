import type { Metadata } from "next";
import { JAPANESE_RECOGNITION_SITE_URL } from "@/lib/japanese-recognition-host";

export function buildJapaneseRecognitionMetadata(): Metadata {
  const base =
    JAPANESE_RECOGNITION_SITE_URL || "https://ja.info-quests.com";
  const title = "日語聽寫 — 實時語音識別 · ja-JP";
  const description =
    "免費日語實時語音聽寫工具：Chrome 瀏覽器 Web Speech API 識別日語，支持複製與導出 TXT / PDF / Word。";

  return {
    title,
    description,
    keywords: [
      "日語聽寫",
      "日語語音識別",
      "日语语音识别",
      "Japanese speech recognition",
      "ja-JP dictation",
      "Web Speech API",
    ],
    alternates: { canonical: `${base}/` },
    openGraph: {
      title,
      description,
      url: `${base}/`,
      siteName: "日語聽寫",
      locale: "zh_TW",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export function japaneseRecognitionSitemapEntries(): {
  url: string;
  lastModified: Date;
  priority: number;
}[] {
  const base =
    JAPANESE_RECOGNITION_SITE_URL || "https://ja.info-quests.com";
  return [{ url: `${base}/`, lastModified: new Date(), priority: 1 }];
}
