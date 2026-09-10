/** 老师端抽查卡「共享」按钮（产品关闭；与日语一致）
 *  false 时：卡片/表不显示共享按钮。
 *  勾选熟悉程度不自动 share；点「下一个」/「完成抽查」时若今日未共享再 POST /share（只一次）。
 *  备注弹窗「共享备注给学生」仍可用。
 */
export const EN_VOCAB_TEACHER_SHARE_ENABLED = false;

/** share fetch 硬超时（防手机弱网永久卡在「同步中」） */
export const EN_VOCAB_SHARE_FETCH_TIMEOUT_MS = 20_000;

/** 超时 / 失败后提示（须清 pending，勿自动死循环重试） */
export const EN_VOCAB_SYNC_ON_NEXT_RETRY_HINT =
  "同步失败或超时，请再点「下一个」重试。";

/** 写库 / share 失败时带回原文，供抽查卡弹窗展示（勿只写「同步失败」） */
export type EnVocabOpFail = { ok: false; detail: string };

/** shareWord / ensureWordSharedBeforeNext：true 成功；busy 写库/同步进行中；失败带 detail */
export type EnVocabShareWordResult = true | "busy" | EnVocabOpFail;

/** 熟悉程度写库：true 成功；失败带 detail（兼容旧 boolean false） */
export type EnVocabReviewSaveResult = true | false | EnVocabOpFail;

export function isEnVocabOpFail(result: unknown): result is EnVocabOpFail {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as EnVocabOpFail).ok === false &&
    typeof (result as EnVocabOpFail).detail === "string"
  );
}

/** 从 share / 写库返回值取出可展示的报错原文；成功 / busy / void → null */
export function enVocabOpFailDetail(result: unknown): string | null {
  if (result === false) return "操作失败（无详细报错）";
  if (isEnVocabOpFail(result)) return result.detail;
  return null;
}

export function enVocabShareWordFailed(
  result: EnVocabShareWordResult
): result is EnVocabOpFail {
  return isEnVocabOpFail(result);
}
