"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  enVocabWordNeedsContentBlobFetch,
  mergeEnVocabWordAfterContentFetch,
} from "@/lib/en-vocab-word-content";
import type { EnVocabWord } from "@/lib/types";

/**
 * 列表省略 usage/例句/接序后：打开弹窗/抽查卡按需 GET /api/en-vocab?word_id=
 */
export function useEnVocabWordContentFetch(opts: {
  open: boolean;
  word: EnVocabWord | null | undefined;
  locale: "zh" | "en";
  onWordUpdated?: (word: EnVocabWord) => void;
}): {
  contentWord: EnVocabWord | null;
  setContentWord: Dispatch<SetStateAction<EnVocabWord | null>>;
  contentLoading: boolean;
} {
  const { open, word, locale, onWordUpdated } = opts;
  const [contentWord, setContentWord] = useState<EnVocabWord | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!open || !word) {
      setContentWord(null);
      setContentLoading(false);
      return;
    }
    setContentWord(word);
  }, [open, word?.id, word?.updated_at, word]);

  useEffect(() => {
    if (!open || !word) {
      setContentLoading(false);
      return;
    }
    if (!enVocabWordNeedsContentBlobFetch(word)) {
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const parsed = await readApiJson<{ ok: boolean; word?: EnVocabWord }>(
          res
        );
        if (cancelled || !parsed.ok || !parsed.data.ok || !parsed.data.word) {
          return;
        }
        const merged = mergeEnVocabWordAfterContentFetch(word, parsed.data.word);
        setContentWord(merged);
        onWordUpdated?.(merged);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    word?.id,
    word?.usage_present,
    word?.example_sentences_present,
    word?.connection_present,
    word?.usage,
    word?.example_sentences,
    word?.connection,
    locale,
    onWordUpdated,
    word,
  ]);

  return { contentWord, setContentWord, contentLoading };
}
