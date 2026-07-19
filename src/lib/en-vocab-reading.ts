/** 英语音标（IPA）规范化与校验；存库形态：/…/ */

const IPA_WRAPPED = /^([\[\/])(.+)([\]\/])$/;

export function normalizeEnVocabIpa(text: string | null | undefined): string | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const m = IPA_WRAPPED.exec(raw);
  if (!m) return null;
  const open = m[1];
  const body = m[2].trim();
  const close = m[3];
  if ((open === "/" && close !== "/") || (open === "[" && close !== "]") || !body) {
    return null;
  }
  return `/${body}/`;
}

export function validateEnVocabIpa(
  raw: string
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = normalizeEnVocabIpa(raw);
  if (!text) return { ok: false, reason: "invalid_ipa" };
  if (text.length > 80) return { ok: false, reason: "too_long" };
  return { ok: true, text };
}

export function normalizeEnVocabReadingSource(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  return t || null;
}
