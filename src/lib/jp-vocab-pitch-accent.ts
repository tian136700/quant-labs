/** OJAD-style pitch accent: mora-level L/H/N pattern stored as JSON text. */

export type JpVocabPitchMora = {
  /** Mora kana (may be 2 chars for 拗音 e.g. きょ) */
  c: string;
  /** L = low, H = high, N = nucleus (drop after) */
  p: "L" | "H" | "N";
};

export type JpVocabPitchAccent = {
  kana: string;
  pattern: string;
  moras: JpVocabPitchMora[];
};

const MORA_PITCH = /^[LHN]$/;

export function parseJpVocabPitchAccent(raw: string | null | undefined): JpVocabPitchAccent | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    const kana = String(obj.kana ?? "").trim();
    const pattern = String(obj.pattern ?? "").trim();
    const morasRaw = obj.moras;
    if (!kana || !Array.isArray(morasRaw) || morasRaw.length === 0) return null;
    const moras: JpVocabPitchMora[] = [];
    for (const item of morasRaw) {
      if (!item || typeof item !== "object") return null;
      const m = item as Record<string, unknown>;
      const c = String(m.c ?? "").trim();
      const p = String(m.p ?? "").trim();
      if (!c || !MORA_PITCH.test(p)) return null;
      moras.push({ c, p: p as JpVocabPitchMora["p"] });
    }
    const builtPattern = moras.map((m) => m.p).join("");
    return {
      kana,
      pattern: pattern || builtPattern,
      moras,
    };
  } catch {
    return null;
  }
}

export function serializeJpVocabPitchAccent(data: JpVocabPitchAccent): string {
  return JSON.stringify({
    kana: data.kana,
    pattern: data.pattern,
    moras: data.moras.map((m) => ({ c: m.c, p: m.p })),
  });
}

/** 存库 kana 须与卡片读音一致（平/片假名等价），否则不展示。 */
export function normalizeKanaForPitchCompare(text: string): string {
  return text.replace(/\s/g, "").replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function jpVocabPitchAccentMatchesReading(
  pitchAccent: string | JpVocabPitchAccent | null | undefined,
  reading: string | null | undefined
): JpVocabPitchAccent | null {
  const parsed =
    typeof pitchAccent === "string"
      ? parseJpVocabPitchAccent(pitchAccent)
      : pitchAccent ?? null;
  if (!parsed) return null;
  const readingNorm = normalizeKanaForPitchCompare(reading ?? "");
  const kanaNorm = normalizeKanaForPitchCompare(parsed.kana);
  if (!readingNorm || kanaNorm !== readingNorm) return null;
  return parsed;
}

/** 单词：读音或词条假名与 OJAD kana 一致时返回可展示音调（平/片假名等价）。 */
export function resolveJpVocabPitchAccentForWord(
  pitchAccent: string | JpVocabPitchAccent | null | undefined,
  reading: string | null | undefined,
  word: string | null | undefined,
  kind: "word" | "grammar" | null | undefined
): JpVocabPitchAccent | null {
  if (kind !== "word") return null;
  const readingTrim = (reading ?? "").trim();
  const wordTrim = (word ?? "").trim();
  return (
    jpVocabPitchAccentMatchesReading(pitchAccent, readingTrim) ??
    jpVocabPitchAccentMatchesReading(pitchAccent, wordTrim)
  );
}

/**
 * 读音区展示：词条 word 保持原文；读音可显示平假名，音调横线只标在读音上。
 * DB 读音与词条同形（如片假名 イギリス）且有 OJAD 时，读音区用 pitch.kana（平假名）画线。
 */
export function resolveJpVocabReadingPitchDisplay(
  pitchAccent: string | JpVocabPitchAccent | null | undefined,
  reading: string | null | undefined,
  word: string | null | undefined,
  kind: "word" | "grammar" | null | undefined
): { readingText: string; pitch: JpVocabPitchAccent | null } {
  const readingTrim = (reading ?? "").trim();
  const wordTrim = (word ?? "").trim();

  if (kind !== "word") {
    return { readingText: readingTrim, pitch: null };
  }

  const pitch = resolveJpVocabPitchAccentForWord(
    pitchAccent,
    readingTrim,
    wordTrim,
    kind
  );
  if (!pitch) {
    return { readingText: readingTrim, pitch: null };
  }

  if (!readingTrim) {
    return { readingText: pitch.kana, pitch };
  }

  if (
    normalizeKanaForPitchCompare(readingTrim) !== normalizeKanaForPitchCompare(pitch.kana)
  ) {
    return { readingText: readingTrim, pitch: null };
  }

  const readingSameAsWord =
    readingTrim === wordTrim ||
    (wordTrim &&
      normalizeKanaForPitchCompare(readingTrim) ===
        normalizeKanaForPitchCompare(wordTrim));

  return {
    readingText: readingSameAsWord ? pitch.kana : readingTrim,
    pitch,
  };
}

/**
 * 把 OJAD 各拍音调套到读音展示文字上（读音区可为平假名；词条 word 字段不在此处理）。
 * 长度或读音对不上则返回 null（调用方回退为纯读音文字）。
 */
export function mapJpVocabPitchAccentOntoDisplayText(
  pitchAccent: JpVocabPitchAccent,
  displayText: string
): JpVocabPitchMora[] | null {
  const text = (displayText ?? "").replace(/\s/g, "");
  if (!text || !pitchAccent.moras.length) return null;
  if (normalizeKanaForPitchCompare(text) !== normalizeKanaForPitchCompare(pitchAccent.kana)) {
    return null;
  }
  const expectedLen = pitchAccent.moras.reduce((n, m) => n + m.c.length, 0);
  if (text.length !== expectedLen) return null;
  let i = 0;
  const out: JpVocabPitchMora[] = [];
  for (const m of pitchAccent.moras) {
    out.push({ c: text.slice(i, i + m.c.length), p: m.p });
    i += m.c.length;
  }
  return out;
}

export function validateJpVocabPitchAccentPayload(
  payload: unknown
): { ok: true; data: JpVocabPitchAccent } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid_payload" };
  }
  const parsed = parseJpVocabPitchAccent(
    serializeJpVocabPitchAccent(payload as JpVocabPitchAccent)
  );
  if (!parsed) return { ok: false, reason: "invalid_moras" };
  const obj = payload as JpVocabPitchAccent;
  if (!obj.moras?.length) return { ok: false, reason: "empty_moras" };
  return { ok: true, data: parsed };
}
