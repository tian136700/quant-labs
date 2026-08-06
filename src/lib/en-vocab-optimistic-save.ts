import type { EnVocabKind, EnVocabWord } from "@/lib/types";

export function buildOptimisticEnVocabWord(
  base: EnVocabWord,
  patch: Partial<
    Pick<
      EnVocabWord,
      | "kind"
      | "word"
      | "reading"
      | "meaning"
      | "pos"
      | "category"
      | "class_notes"
      | "mnemonic"
      | "usage"
      | "connection"
      | "connection_source"
      | "example_sentences"
      | "example_sentences_source"
    >
  >
): EnVocabWord {
  return {
    ...base,
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

export type EnVocabEditSaveHandlers = {
  onSaved: (word: EnVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: EnVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

export async function syncEnVocabEditResponse(
  res: Response,
  data: { ok?: boolean; word?: EnVocabWord; error?: string },
  locale: "en" | "zh",
  handlers: EnVocabEditSaveHandlers
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
