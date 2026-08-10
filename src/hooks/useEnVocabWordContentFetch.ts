"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  enVocabWordNeedsContentBlobFetch,
  mergeEnVocabWordAfterContentFetch,
  mergeEnVocabWordPreserveContentBlobs,
} from "@/lib/en-vocab-word-content";
import type { EnVocabWord } from "@/lib/types";

/**
 * 列表省略 usage/例句/接序后：打开弹窗/抽查卡按需 GET /api/en-vocab?word_id=
 * - 同会话按 word_id 缓存，避免「上一个/下一个」再闪
 * - 禁止整词 word / 不稳定 onWordUpdated 进 effect 依赖（会二次请求、冲掉已显用法）
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
  const onWordUpdatedRef = useRef(onWordUpdated);
  onWordUpdatedRef.current = onWordUpdated;
  const cacheRef = useRef<Map<number, EnVocabWord>>(new Map());
  const wordRef = useRef(word);
  wordRef.current = word;

  const wordId = word?.id ?? null;
  const needsFetch = Boolean(word && enVocabWordNeedsContentBlobFetch(word));
  const usagePresent = word?.usage_present === true;
  const examplesPresent = word?.example_sentences_present === true;
  const connectionPresent = word?.connection_present === true;

  useEffect(() => {
    if (!open || !word || wordId == null) {
      setContentWord(null);
      setContentLoading(false);
      return;
    }
    const cached = cacheRef.current.get(wordId);
    setContentWord((prev) => {
      const base =
        prev?.id === wordId
          ? mergeEnVocabWordPreserveContentBlobs(word, prev)
          : word;
      if (cached) {
        return mergeEnVocabWordAfterContentFetch(base, cached);
      }
      return base;
    });
  }, [open, wordId]);

  useEffect(() => {
    if (!open || wordId == null) {
      setContentLoading(false);
      return;
    }
    const latest = wordRef.current;
    if (!latest || latest.id !== wordId) {
      setContentLoading(false);
      return;
    }

    const cached = cacheRef.current.get(wordId);
    if (cached && !enVocabWordNeedsContentBlobFetch(
      mergeEnVocabWordAfterContentFetch(latest, cached)
    )) {
      const merged = mergeEnVocabWordAfterContentFetch(latest, cached);
      setContentWord(merged);
      setContentLoading(false);
      return;
    }

    if (!enVocabWordNeedsContentBlobFetch(latest)) {
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab?word_id=${encodeURIComponent(String(wordId))}`,
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
        const base = wordRef.current?.id === wordId ? wordRef.current : latest;
        const merged = mergeEnVocabWordAfterContentFetch(
          base,
          parsed.data.word
        );
        cacheRef.current.set(wordId, merged);
        setContentWord(merged);
        onWordUpdatedRef.current?.(merged);
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
    wordId,
    needsFetch,
    usagePresent,
    examplesPresent,
    connectionPresent,
    locale,
  ]);

  return { contentWord, setContentWord, contentLoading };
}
