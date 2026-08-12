"use client";

import { useEffect, useState } from "react";
import type { JpVocabLevel } from "@/lib/types";

/**
 * 抽查卡熟悉程度：点击立刻本地亮勾，不依赖父级 sessionLevel 重渲染时机。
 * 换词清空；父级回显追上后可对齐全。
 */
export function useJpVocabFlashcardLevelDraft(
  wordId: number | null | undefined,
  parentSelected: JpVocabLevel | undefined
): {
  selected: JpVocabLevel | undefined;
  paintLevel: (level: JpVocabLevel) => void;
} {
  const [draft, setDraft] = useState<JpVocabLevel | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [wordId]);

  useEffect(() => {
    if (draft != null && parentSelected === draft) {
      setDraft(null);
    }
  }, [parentSelected, draft]);

  return {
    selected: draft ?? parentSelected,
    paintLevel: (level: JpVocabLevel) => setDraft(level),
  };
}
