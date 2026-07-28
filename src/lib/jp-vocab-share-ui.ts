/** 老师端抽问卡片「发给学生」按钮（产品关闭；学生主路径：勾选熟悉程度自动同步 + peek）
 *  false 时：卡片不显示「发给学生」。
 *  勾选熟悉程度仍会 shareToStudy（整卡到今日单词）；备注弹窗「共享备注给学生」仍可用。
 */
export const JP_VOCAB_TEACHER_SHARE_ENABLED = false;

/** 学生端「请老师发送」+ 老师协助 toast；peek 不依赖此开关 */
export const JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED = false;
