"use client";

import { useEffect, useState } from "react";
import { isJapaneseRecognitionSubdomainHost } from "@/lib/japanese-recognition-host";

export function useJapaneseRecognitionSubdomain(): boolean {
  const [onSubdomain, setOnSubdomain] = useState(
    () =>
      typeof window !== "undefined" &&
      isJapaneseRecognitionSubdomainHost(window.location.hostname)
  );

  useEffect(() => {
    setOnSubdomain(isJapaneseRecognitionSubdomainHost(window.location.hostname));
  }, []);

  return onSubdomain;
}
