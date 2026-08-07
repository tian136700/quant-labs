/** Browser TTS for Japanese vocabulary (Web Speech API). */

export function canSpeakJpVocab(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakJpVocabText(
  text: string,
  callbacks: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  } = {}
): boolean {
  if (!canSpeakJpVocab()) return false;
  const clean = text.trim();
  if (!clean) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "ja-JP";
  utter.rate = 0.92;
  utter.onstart = () => callbacks.onStart?.();
  utter.onend = () => callbacks.onEnd?.();
  utter.onerror = () => callbacks.onError?.();

  const voices = window.speechSynthesis.getVoices();
  const jaVoice =
    voices.find((v) => v.lang.startsWith("ja")) ??
    voices.find((v) => /japan/i.test(v.name));
  if (jaVoice) utter.voice = jaVoice;

  window.speechSynthesis.speak(utter);
  return true;
}

export function stopJpVocabSpeech(): void {
  if (canSpeakJpVocab()) window.speechSynthesis.cancel();
}
