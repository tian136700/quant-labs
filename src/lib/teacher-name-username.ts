import { pinyin } from "pinyin-pro";

const TEACHER_SUFFIX = "老师";
const DASH_PATTERN = /[-－—]/;

/** 取横杠前的老师称呼，如「周老师-备注」→「周老师」 */
export function extractTeacherNameBeforeDash(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(DASH_PATTERN);
  if (!match || match.index == null) return trimmed;
  return trimmed.slice(0, match.index).trim();
}

function capitalizePinyinSyllable(syllable: string): string {
  if (!syllable) return "";
  return syllable.charAt(0).toUpperCase() + syllable.slice(1).toLowerCase();
}

function chineseToPascalPinyin(text: string): string {
  const syllables = pinyin(text, { toneType: "none", type: "array" }) as string[];
  return syllables.map(capitalizePinyinSyllable).join("");
}

function asciiToPascalUsername(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/** 将老师称呼转为登录用户名，如「李老师」→ LiLaoshi、「周老师」→ ZhouLaoshi */
export function teacherNameToUsername(displayName: string): string {
  const name = extractTeacherNameBeforeDash(displayName);
  if (!name) return "";

  if (/^[\x00-\x7F]+$/.test(name)) {
    if (name.toLowerCase().endsWith("laoshi") && name.length > 6) {
      return asciiToPascalUsername(name);
    }
    if (/teacher$/i.test(name)) {
      return asciiToPascalUsername(name);
    }
    const withLaoshi = name.toLowerCase().endsWith("laoshi")
      ? name
      : `${name}Laoshi`;
    return asciiToPascalUsername(withLaoshi);
  }

  if (name.endsWith(TEACHER_SUFFIX) && name.length > TEACHER_SUFFIX.length) {
    const prefix = name.slice(0, -TEACHER_SUFFIX.length);
    const prefixPinyin = chineseToPascalPinyin(prefix);
    if (!prefixPinyin) return "";
    return `${prefixPinyin}Laoshi`;
  }

  return chineseToPascalPinyin(name);
}
