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
