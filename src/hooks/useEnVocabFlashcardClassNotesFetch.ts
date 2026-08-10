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
  const onWordUpdatedRef = useRef(onWordUpdated);
  onWordUpdatedRef.current = onWordUpdated;
  const wordRef = useRef(word);
  wordRef.current = word;

  const wordId = word?.id ?? null;
  const notesPresent = word?.class_notes_present === true;
  const hasNotesBody = Boolean(word?.class_notes);

  useEffect(() => {
    if (!open || !word || wordId == null) {
      setNotesWord(null);
      setNotesLoading(false);
      return;
    }
    setNotesWord(word);
  }, [open, wordId]);

  useEffect(() => {
    if (!open || wordId == null) {
      setNotesLoading(false);
      return;
    }
    const latest = wordRef.current;
    if (!latest || latest.id !== wordId) {
      setNotesLoading(false);
      return;
    }
    if (!latest.class_notes_present || latest.class_notes) {
      setNotesLoading(false);
      return;
    }

    let cancelled = false;
    setNotesLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/en-vocab/class-notes?word_id=${encodeURIComponent(String(wordId))}`,
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
        // 必须用最新 wordRef（可能已含按需拉到的 usage），禁止闭包里无用法的旧 base
        const base = wordRef.current?.id === wordId ? wordRef.current : latest;
        const merged = mergeEnVocabWordAfterClassNotesFetch(
          base,
          parsed.data.word
        );
        setNotesWord(merged);
        onWordUpdatedRef.current?.(merged);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, wordId, notesPresent, hasNotesBody, locale]);

  return { notesWord, setNotesWord, notesLoading };
}
