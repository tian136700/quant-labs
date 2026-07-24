"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { jpVocabFlashcardCopyText } from "@/lib/jp-vocab-flashcard-copy";
import { pickRandomJpVocabWord } from "@/lib/jp-vocab-page-helpers";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";
import type { Locale } from "@/i18n/messages";

export function useJpVocabPageWordHandlers(options: {
  locale: Locale;
  canOperate: boolean;
  words: JpVocabWord[];
  refs: Record<string, JpVocabRef>;
  displayOrderRef: MutableRefObject<JpVocabDailyDisplayOrder>;
  editingRemarksIdRef: MutableRefObject<number | null>;
  quizTargetWords: JpVocabWord[];
  sessionReviewAt: Record<number, number>;
  highlightId: number | null;
  filteredDisplayedWords: JpVocabWord[];
  pageSize: number;
  isWordReviewLocked: (word: JpVocabWord, sessionReviewAtMs?: number) => boolean;
  setWords: Dispatch<SetStateAction<JpVocabWord[]>>;
  setRefs: Dispatch<SetStateAction<Record<string, JpVocabRef>>>;
  setDisplayOrder: Dispatch<SetStateAction<JpVocabDailyDisplayOrder>>;
  setEditingRemarksWord: Dispatch<SetStateAction<JpVocabWord | null>>;
  setViewingRemarksWord: Dispatch<SetStateAction<JpVocabWord | null>>;
  setPreviewRef: Dispatch<
    SetStateAction<{ ref: JpVocabRef; cacheVersion?: string | null } | null>
  >;
  setHighlightId: Dispatch<SetStateAction<number | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setStatus: (message: string) => void;
  setCopyToast: Dispatch<SetStateAction<string | null>>;
  persistCache: (
    words: JpVocabWord[],
    refs: Record<string, JpVocabRef>,
    display_order: JpVocabDailyDisplayOrder
  ) => void;
  scrollToHighlightRef: MutableRefObject<boolean>;
}) {
  const {
    locale,
    canOperate,
    words,
    refs,
    displayOrderRef,
    editingRemarksIdRef,
    quizTargetWords,
    sessionReviewAt,
    highlightId,
    filteredDisplayedWords,
    pageSize,
    isWordReviewLocked,
    setWords,
    setRefs,
    setDisplayOrder,
    setEditingRemarksWord,
    setViewingRemarksWord,
    setPreviewRef,
    setHighlightId,
    setPage,
    setStatus,
    setCopyToast,
    persistCache,
    scrollToHighlightRef,
  } = options;

  const openRemarksWord = useCallback(
    (word: JpVocabWord) => {
      if (canOperate) setEditingRemarksWord(word);
      else setViewingRemarksWord(word);
    },
    [canOperate, setEditingRemarksWord, setViewingRemarksWord]
  );

  const showReadingCopyToast = useCallback(
    (readingTrim: string, wordTrim: string) => {
      const text = jpVocabFlashcardCopyText(readingTrim, wordTrim);
      if (!text) return;
      void copyTextToClipboard(text).then((ok) =>
        setCopyToast(
          ok
            ? locale === "zh"
              ? "复制成功"
              : "Copied"
            : locale === "zh"
              ? "复制失败"
              : "Copy failed"
        )
      );
    },
    [locale, setCopyToast]
  );

  const pickNext = useCallback(() => {
    const pool = quizTargetWords.filter(
      (w) => !isWordReviewLocked(w, sessionReviewAt[w.id])
    );
    const next = pickRandomJpVocabWord(pool, highlightId ?? undefined);
    if (!next) return;
    const idx = filteredDisplayedWords.findIndex((w) => w.id === next.id);
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize) + 1);
    }
    scrollToHighlightRef.current = true;
    setHighlightId(next.id);
  }, [
    quizTargetWords,
    isWordReviewLocked,
    sessionReviewAt,
    highlightId,
    filteredDisplayedWords,
    pageSize,
    setPage,
    setHighlightId,
    scrollToHighlightRef,
  ]);

  const handleWordAdded = useCallback(
    (added: JpVocabWord, ref?: JpVocabRef, refDeduped?: boolean) => {
      const nextWords = [...words, added];
      const nextRefs = ref
        ? { ...refs, [ref.ref_key]: { ...refs[ref.ref_key], ...ref } }
        : refs;
      const nextDisplayOrder: JpVocabDailyDisplayOrder = displayOrderRef.current.ids.includes(
        added.id
      )
        ? displayOrderRef.current
        : { ...displayOrderRef.current, ids: [...displayOrderRef.current.ids, added.id] };
      setWords(nextWords);
      setRefs(nextRefs);
      setDisplayOrder(nextDisplayOrder);
      persistCache(nextWords, nextRefs, nextDisplayOrder);
      setStatus(`已添加：${added.word}${refDeduped ? "（共用教案链接）" : ""}`);
    },
    [words, refs, displayOrderRef, setWords, setRefs, setDisplayOrder, persistCache, setStatus]
  );

  const handleWordSaved = useCallback(
    (word: JpVocabWord) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === word.id ? word : w));
        persistCache(next, refs, displayOrderRef.current);
        return next;
      });
      setEditingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      setViewingRemarksWord((prev) => (prev?.id === word.id ? word : prev));
      if (editingRemarksIdRef.current !== word.id) {
        setStatus("词条已保存。");
      }
    },
    [refs, persistCache, setWords, setEditingRemarksWord, setViewingRemarksWord, setStatus, editingRemarksIdRef, displayOrderRef]
  );

  const handleWordSaveFailed = useCallback(
    (wordId: number, snapshot: JpVocabWord, message: string) => {
      setWords((prev) => {
        const next = prev.map((w) => (w.id === wordId ? snapshot : w));
        persistCache(next, refs, displayOrderRef.current);
        return next;
      });
      setStatus(message);
    },
    [refs, persistCache, setWords, setStatus, displayOrderRef]
  );

  const openRefPreview = useCallback(
    (refKey: string, ref?: JpVocabRef) => {
      const meta = resolveJpVocabRefForPreview(refKey, refs, ref);
      setPreviewRef({
        ref: meta,
        cacheVersion: ref?.updated_at ?? refs[refKey]?.updated_at,
      });
    },
    [refs, setPreviewRef]
  );

  return {
    openRemarksWord,
    showReadingCopyToast,
    pickNext,
    handleWordAdded,
    handleWordSaved,
    handleWordSaveFailed,
    openRefPreview,
  };
}
