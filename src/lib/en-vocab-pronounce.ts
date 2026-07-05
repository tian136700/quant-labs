/** 浏览器朗读英语单词/短语（Web Speech API，无需后端） */

const SPEAK_LANG = "en-US";

export function canSpeakEnVocab(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakEnVocabText(
  text: string,
  handlers?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): boolean {
  const clean = text.trim();
  if (!clean || !canSpeakEnVocab()) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = SPEAK_LANG;
  utter.rate = 0.92;
  if (handlers?.onStart) utter.onstart = handlers.onStart;
  if (handlers?.onEnd) utter.onend = handlers.onEnd;
  if (handlers?.onError) utter.onerror = handlers.onError;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopEnVocabSpeech(): void {
  if (canSpeakEnVocab()) {
    window.speechSynthesis.cancel();
  }
}
