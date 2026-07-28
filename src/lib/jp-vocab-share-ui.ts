/** 老师端抽问卡片「发给学生」按钮（产品关闭；学生主路径用 peek）
 *  false 时：卡片不显示「发给学生」；勾选熟悉程度不再自动 shareToStudy。
 *  备注弹窗「共享备注给学生」仍走 POST /api/*/share（手动一次）。
 */
export const JP_VOCAB_TEACHER_SHARE_ENABLED = false;

/** 学生端「请老师发送」+ 老师协助 toast；peek 不依赖此开关 */
export const JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED = false;
