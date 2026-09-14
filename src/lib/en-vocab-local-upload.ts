import type { EnVocabUploadInput } from "@/lib/types";

/** fill-meaning 线上来源；保留，不当作 STT 误传释义清掉 */
export function isEnVocabTrustedOnlineMeaningSource(
  source: string | null | undefined
): boolean {
  return (source || "").trim().startsWith("线上");
}

/**
 * STT / Agent 排查时误 POST 的探针/占位词（曾入库 id=634 并进抽查池）。
 * 上传与补全一律拒收，禁止再进英语抽背词库。
 */
export function isEnVocabProbeOrTestLemma(word: string | null | undefined): boolean {
  const w = (word || "").trim();
  if (!w) return false;
  const lower = w.toLowerCase();
  if (lower.includes("stt_probe")) return true;
  if (lower.includes("never_exist")) return true;
  if (
    /^__[\w.-]*(?:probe|canary|placeholder|dummy|test_only)[\w.-]*__$/i.test(w)
  ) {
    return true;
  }
  return false;
}

export function partitionEnVocabUploadWordsAgainstProbes(
  words: EnVocabUploadInput[]
): {
  accepted: EnVocabUploadInput[];
  rejected_probe_words: string[];
} {
  const accepted: EnVocabUploadInput[] = [];
  const rejected: string[] = [];
  const seenRejected = new Set<string>();
  for (const item of words) {
    const raw = (item.word || "").trim();
    if (isEnVocabProbeOrTestLemma(raw)) {
      if (!seenRejected.has(raw)) {
        seenRejected.add(raw);
        rejected.push(raw);
      }
      continue;
    }
    accepted.push(item);
  }
  return { accepted, rejected_probe_words: rejected };
}

/** local-upload / upload API：只推词与分类，不接受客户端释义（由后续 fill-meaning 补全）。 */
export function sanitizeEnVocabLocalUploadInput(
  input: EnVocabUploadInput
): EnVocabUploadInput {
  const { meaning: _meaning, ...rest } = input;
  return rest;
}

export function sanitizeEnVocabLocalUploadInputs(
  words: EnVocabUploadInput[]
): EnVocabUploadInput[] {
  return words.map(sanitizeEnVocabLocalUploadInput);
}
