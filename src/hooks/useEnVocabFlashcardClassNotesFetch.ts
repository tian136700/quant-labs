"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { mergeEnVocabWordAfterClassNotesFetch } from "@/lib/en-vocab-teacher-quiz";
import type { EnVocabWord } from "@/lib/types";

/** 英语抽查/学生卡：备注正文（含贴图）按当前词异步拉；拉期间显示「正在拉取备注…」。 */
export function useEnVocabFlashcardClassNotesFetch(opts: {
  open: boolean;
  word: EnVocabWord | null | undefined;
  locale: "zh" | "en";
  onWordUpdated?: (word: EnVocabWord) => void;
}): {
  notesWord: EnVocabWord | null;
  setNotesWord: Dispatch<SetStateAction<EnVocabWord | null>>;
  notesLoading: boolean;
} {
  const { open, word, locale, onWordUpdated } = opts;
  const [notesWord, setNotesWord] = useState<EnVocabWord | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    if (!open || !word) {
      setNotesWord(null);
      setNotesLoading(false);
      return;
    }
    setNotesWord(word);
  }, [open, word?.id, word?.updated_at, word]);

  useEffect(() => {
    if (!open || !word) {
      setNotesLoading(false);
      return;
    }
    if (!word.class_notes_present || word.class_notes) {
      setNotesLoading(false);
      return;
    }

    let cancelled = false;
    setNotesLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const parsed = await readApiJson<{ ok: boolean; word?: EnVocabWord }>(res);
        if (cancelled || !parsed.ok || !parsed.data.ok || !parsed.data.word) return;
        const merged = mergeEnVocabWordAfterClassNotesFetch(word, parsed.data.word);
        setNotesWord(merged);
        onWordUpdated?.(merged);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    word?.id,
    word?.class_notes_present,
    word?.class_notes,
    locale,
    onWordUpdated,
    word,
  ]);

  return { notesWord, setNotesWord, notesLoading };
}
