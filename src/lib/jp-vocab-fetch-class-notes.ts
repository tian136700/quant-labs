import { readApiJson } from "@/lib/api-json";
import {
  mergeJpVocabWordAfterClassNotesFetch,
} from "@/lib/jp-vocab-class-notes";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabWord } from "@/lib/types";

/**
 * 按需 GET 单条课堂备注正文（含贴图）。禁止定时轮询；仅点击「拉取实时备注」等手动路径调用。
 */
export async function fetchJpVocabClassNotesWord(
  base: JpVocabWord,
  locale: "zh" | "en"
): Promise<{ ok: true; word: JpVocabWord } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(base.id))}`,
      {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      }
    );
    const parsed = await readApiJson<{
      ok: boolean;
      word?: JpVocabWord;
      error?: string;
    }>(res);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error || "fetch_failed" };
    }
    if (!parsed.data.ok || !parsed.data.word) {
      return {
        ok: false,
        error: parsed.data.error || "fetch_failed",
      };
    }
    return {
      ok: true,
      word: mergeJpVocabWordAfterClassNotesFetch(base, parsed.data.word),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message || "fetch_failed" };
  }
}
