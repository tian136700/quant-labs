/** 老师端抽问卡片「发给学生」（产品关闭：学生改走 peek，不靠老师主动发送）
 *  false 时：UI 隐藏按钮；勾选熟悉程度不再 shareToStudy；POST /share 拒绝。
 */
export const JP_VOCAB_TEACHER_SHARE_ENABLED = false;

/** 学生端「请老师发送」+ 老师协助 toast；peek 不依赖此开关 */
export const JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED = false;
