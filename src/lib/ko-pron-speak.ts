/**
 * 韩语字母发音：浏览器 Web Speech（ko-KR）。
 * 优先读「读音」里的韩文名（如 기역 / g·k → 기역），单字母 ㄱ 多数引擎读不准。
 */

/** 从 reading「기역 / g·k」取出可朗读的韩文名；无则回退字母本身 */
export function koPronSpeakText(
  letter: string,
  reading?: string | null
): string {
  const glyph = (letter || "").trim();
  const raw = (reading || "").trim();
  if (raw) {
    const hangulName = raw.split("/")[0]?.trim() ?? "";
    if (hangulName && /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(hangulName)) {
      return hangulName;
    }
  }
  return glyph;
}

export function canUseKoPronSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

function pickKoVoice(): SpeechSynthesisVoice | null {
  if (!canUseKoPronSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const exact =
    voices.find((v) => v.lang === "ko-KR") ||
    voices.find((v) => v.lang.toLowerCase().startsWith("ko"));
  return exact ?? null;
}

/** 朗读字母；不支持或空文本时返回 false */
export function speakKoPronLetter(
  letter: string,
  reading?: string | null
): boolean {
  if (!canUseKoPronSpeech()) return false;
  const text = koPronSpeakText(letter, reading);
  if (!text) return false;

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ko-KR";
  utter.rate = 0.85;
  const voice = pickKoVoice();
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
  return true;
}
