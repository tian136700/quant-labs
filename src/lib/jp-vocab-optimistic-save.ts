import type { JpVocabKind, JpVocabWord } from "@/lib/types";

export function buildOptimisticJpVocabWord(
  base: JpVocabWord,
  patch: Partial<
      Pick<
      JpVocabWord,
      "kind" | "word" | "reading" | "meaning" | "pos" | "class_notes" | "mnemonic" | "example_sentences" | "example_sentences_source"
    >
  >
): JpVocabWord {
  return {
    ...base,
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

export type JpVocabEditSaveHandlers = {
  onSaved: (word: JpVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

export async function syncJpVocabEditResponse(
  res: Response,
  data: { ok?: boolean; word?: JpVocabWord; error?: string },
  locale: "en" | "zh",
  handlers: JpVocabEditSaveHandlers
): Promise<void> {
  if (res.status === 401) {
    handlers.onNeedAuth();
    throw new Error(locale === "zh" ? "请登录后再编辑。" : "Please log in.");
  }
  if (!data.ok || !data.word) {
    throw new Error(data.error || (locale === "zh" ? "保存失败" : "Save failed"));
  }
  handlers.onSaved(data.word);
}
