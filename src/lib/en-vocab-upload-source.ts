/**
 * 英语词条「上传类型」：词条如何进入英语抽背库。
 * 存库用稳定码；页面展示中文标签。
 */

export const EN_VOCAB_UPLOAD_SOURCE_LESSON = "en_lesson" as const;
export const EN_VOCAB_UPLOAD_SOURCE_API = "api" as const;
export const EN_VOCAB_UPLOAD_SOURCE_MANUAL = "manual" as const;

export type EnVocabUploadSource =
  | typeof EN_VOCAB_UPLOAD_SOURCE_LESSON
  | typeof EN_VOCAB_UPLOAD_SOURCE_API
  | typeof EN_VOCAB_UPLOAD_SOURCE_MANUAL;

/** 存量 / 新课同步默认 */
export const EN_VOCAB_DEFAULT_UPLOAD_SOURCE: EnVocabUploadSource =
  EN_VOCAB_UPLOAD_SOURCE_LESSON;

export const EN_VOCAB_UPLOAD_SOURCE_LABELS: Record<EnVocabUploadSource, string> =
  {
    [EN_VOCAB_UPLOAD_SOURCE_LESSON]: "由英语新课模块同步",
    [EN_VOCAB_UPLOAD_SOURCE_API]: "通过API接口上传",
    [EN_VOCAB_UPLOAD_SOURCE_MANUAL]: "手动添加",
  };

const SOURCE_ALIASES: Record<string, EnVocabUploadSource> = {
  en_lesson: EN_VOCAB_UPLOAD_SOURCE_LESSON,
  lesson: EN_VOCAB_UPLOAD_SOURCE_LESSON,
  新课: EN_VOCAB_UPLOAD_SOURCE_LESSON,
  英语新课: EN_VOCAB_UPLOAD_SOURCE_LESSON,
  由英语新课模块同步: EN_VOCAB_UPLOAD_SOURCE_LESSON,
  api: EN_VOCAB_UPLOAD_SOURCE_API,
  local: EN_VOCAB_UPLOAD_SOURCE_API,
  local_api: EN_VOCAB_UPLOAD_SOURCE_API,
  本地接口: EN_VOCAB_UPLOAD_SOURCE_API,
  通过api接口上传: EN_VOCAB_UPLOAD_SOURCE_API,
  通过api接口传: EN_VOCAB_UPLOAD_SOURCE_API,
  manual: EN_VOCAB_UPLOAD_SOURCE_MANUAL,
  手动: EN_VOCAB_UPLOAD_SOURCE_MANUAL,
  手动添加: EN_VOCAB_UPLOAD_SOURCE_MANUAL,
};

export function normalizeEnVocabUploadSource(
  raw?: string | null
): EnVocabUploadSource {
  const t = (raw || "").trim();
  if (!t) return EN_VOCAB_DEFAULT_UPLOAD_SOURCE;
  const mapped = SOURCE_ALIASES[t.toLowerCase()] ?? SOURCE_ALIASES[t];
  return mapped ?? EN_VOCAB_DEFAULT_UPLOAD_SOURCE;
}

export function displayEnVocabUploadSource(raw?: string | null): string {
  const code = normalizeEnVocabUploadSource(raw);
  return EN_VOCAB_UPLOAD_SOURCE_LABELS[code];
}
