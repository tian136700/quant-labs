/** 浏览器朗读日语词条（Web Speech API，无需后端） */

const SPEAK_LANG = "ja-JP";

export function canSpeakJpVocab(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 优先用假名读音，否则回退到词条表记 */
export function jpVocabSpeakText(word: string, reading?: string | null): string {
  const kana = (reading || "").trim();
  if (kana) return kana;
  return word.trim();
}

export function speakJpVocab(
  word: string,
  reading: string | null | undefined,
  handlers?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): boolean {
  const clean = jpVocabSpeakText(word, reading);
  if (!clean || !canSpeakJpVocab()) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = SPEAK_LANG;
  utter.rate = 0.88;
  if (handlers?.onStart) utter.onstart = handlers.onStart;
  if (handlers?.onEnd) utter.onend = handlers.onEnd;
  if (handlers?.onError) utter.onerror = handlers.onError;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopJpVocabSpeech(): void {
  if (canSpeakJpVocab()) {
    window.speechSynthesis.cancel();
  }
}
