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

/** shareWord / ensureWordSharedBeforeNext：true 成功；false 失败；busy 写库/同步进行中 */
export type EnVocabShareWordResult = true | false | "busy";
