# 功能索引（Feature Index）

改功能前**先查本表**：用户粘贴线上 URL、说中文功能名、或描述页面行为时，从这里定位文件，避免全库盲搜。

线上根域名示例：`https://finance.info-quests.com`（路径与下表一致）。

---

## 怎么用

1. 从 URL 取 **path**（去掉域名），如 `/jp-vocab/study`
2. 在下方表格搜 path，或搜中文关键词（如「日语抽问-老师端」「日语抽问-管理员端」「发给学生」「查看老师正在抽查的单词」「今日日语单词」）
3. 按列打开：**页面 → 组件 → API → 数据库/权限**

日语/英语学习模块 URL **不带** `/zh` 前缀（见 `src/lib/locale-path.ts` `isLocaleNeutralPath`）。

> 维护说明：本文档仅作开发索引，修改不影响线上功能。（自动部署钩子验证用）

---

## 日语单词 / 语法抽问（jp-vocab）

| 线上 path | 中文名 | 页面入口 | 主组件 | 关键 API | 数据 / 逻辑 | 权限 |
|-----------|--------|----------|--------|----------|-------------|------|
| `/jp-vocab` | **日语抽问-老师端**（抽查卡片、勾选熟悉程度、发给学生） | `src/app/jp-vocab/page.tsx` | `JpVocabPage variant="teacher"`（未登录 → 全页登录） | `GET/POST /api/jp-vocab`、`/api/jp-vocab/sync`、`/api/jp-vocab/share`（GET 需 `requireJpVocabRead`） | 共用 `jp_vocab_*`；`src/lib/jp-vocab-share-ui.ts` → `JP_VOCAB_TEACHER_SHARE_ENABLED` | 须登录；`jp_vocab:read` 浏览；`jp_vocab:operate` 勾选/发给学生；管理员进此 URL 会 redirect 到 `/jp-vocab/admin` |
| `/jp-vocab/admin` | **日语抽问-管理员端**（全库、设今日抽查数量、导出、预览卡片） | `src/app/jp-vocab/admin/page.tsx` | `JpVocabPage variant="admin"` | 同上（设目标等管理操作用 admin API） | 与老师端**共用同一张表 / 同一套 API**；UX 由 `variant` 区分 | `admin`；非管理员进此 URL 会 redirect 到 `/jp-vocab` |
| `/jp-vocab/study` | 今日日语单词、学生复习；**主路径=peek**；「请老师发送」默认关 | `src/app/jp-vocab/study/page.tsx` | `src/components/JpVocabStudyPage.tsx` | `GET /api/jp-vocab/shared`、`POST /api/jp-vocab/teacher-quiz-live`（peek）；`share-request` 仅当开关开 | 同上 + `jp_vocab_share_request`；开关 `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED=false` | `jp_vocab:study` 学生；`admin` 管理员（老师不可见） |
| `/jp-vocab/review` | **日语复习**（选数量/排序、卡片复习、手动清除进度） | `src/app/jp-vocab/review/page.tsx` | `JpVocabReviewPage.tsx` | `GET/POST /api/jp-vocab/review` | `jp_vocab_review_done`（跨日不清零） | `admin` 管理员 |
| `/jp-vocab/coach` | **课堂带读**（合并队列：「一般」「不熟悉」与未带读去重合并；**今日抽查完成弹窗出现时批量写入**；已带读不拉回；**带读卡片与抽问卡同 UI，熟悉程度只展示不可勾选**；备注与抽问同步；**带读卡片显示例句**；列表有例句列、带读状态与操作列「查看该带读卡片」；**已带读北京时间次日凌晨清空**，未带读不过期） | `src/app/jp-vocab/coach/page.tsx` | `JpVocabCoachPage.tsx` | `GET/POST /api/jp-vocab/coach`（`merge_queue` / `mark_coached`） | `jp_vocab_coach_item`（`word_id` 主键 + `coached_at`）；跨日清理见 `daily-rollover` | **`jp_vocab:coach` 或白名单**（当前 `XinXin`=欣欣；李老师/玉老师默认无）；`admin` 全部；抽查完成入队仍用 `jp_vocab:operate` |
| `/jp-vocab/ref/[refKey]` | 教案/参考资料查看 | `src/app/jp-vocab/ref/[refKey]/page.tsx` | `JpVocabRefViewer` 等 | `/api/jp-vocab/ref/*` | `jp_vocab_ref` | 随单词页；下载名见「日语新课 → 教案下载文件名」 |

### jp-vocab 子功能 → 文件速查

| 功能描述 | 改哪里 |
|----------|--------|
| **老师/管理员入口拆分**（导航名「日语抽问-老师端 / 管理员端」；表共用、组件 `variant` 区分） | `/jp-vocab` vs `/jp-vocab/admin`；`locale-path.ts` → `jpVocabPath()` / `jpVocabAdminPath()`；`messages.ts` → `nav.jpVocab` / `nav.jpVocabAdmin`；规则 `.cursor/rules/jp-vocab-admin-teacher-split.mdc` |
| 老师点「发给学生」、共享进度条（**仅老师端**；开关默认开） | `jp-vocab-share-ui.ts` → `JP_VOCAB_TEACHER_SHARE_ENABLED`；`JpVocabPage.tsx` → `teacherShareUiEnabled` / `shareWord`；`POST /api/jp-vocab/share`；`shareJpVocabWord()`；卡片 `JpVocabTeacherQuizFlashcardModal` |
| 管理员设今日抽查数量（进度条内输入框 + 确认设置；生成老师可见池 `visible_ids` = 当日序号正序 1…N；今日新入库从未抽查词不进池） | **仅管理员端** `/jp-vocab/admin`；`JpVocabDailyQuizProgressBar.tsx`；`JpVocabPage.tsx` → `setDailyQuizTarget`；`POST /api/jp-vocab` `set_daily_quiz_target`；`jp-vocab-db.ts` → `setJpVocabDailyQuizTarget()`；**finance / japanese 共用 D1**，但 **localStorage 按域名隔离**，老师端靠 `/api/jp-vocab/sync` 轮询拉 `teacher_visible_limit`（非 BroadcastChannel） |
| **老师端抽查卡片**（点「抽查」或点词条即开卡片；**模式自动随机选正序或随机**，卡片左上角小字标注「正序/随机」；开始前可弹操作说明；今日可见池内熟悉程度**仅能在卡片内勾选**；卡片内可**发给学生**；已发送后勾选仅更新熟悉程度、不重复同步；**抽查队列 = visible_ids 中未勾选词**（勿用序号 1–N 代替；调高目标后从剩余未抽查起）；刷新/掉线后自动回到**第一个未勾选**词卡片，进行中不展示列表；**进度已完成后关卡片并展示今日已抽列表**；卡片标题旁显示「单词：/语法：」；统计区为**抽查权重**（括号说明：数值越大越应该被抽查）；卡片**右上角计时器**（`00:00` 起计、勾选熟悉程度后停住，仅老师抽查卡）；预览同款 UI） | `JpVocabPage.tsx` → `startTeacherQuizWithRandomMode`、`requestTeacherQuizSession`、`recordLevel(..., "flashcard")`、`shareWord`、`hideTeacherQuizList`、`teacherQuizLocksTable`；**管理员**在列表内直接改熟悉程度，不进抽查流程；操作列「查看抽问卡片」预览同款 UI（`previewMode`）；`JpVocabTeacherQuizIntroModal.tsx`；`JpVocabTeacherQuizFlashcardModal.tsx`（`answerElapsedSec`）；`JpVocabFlashcardWordHero.tsx`；`jp-vocab-teacher-quiz.ts`；`jp-vocab-teacher-visible.ts` → `listJpVocabTeacherQuizPoolWords`、`isJpVocabWordInTeacherVisiblePool`；`jp-vocab-teacher-quiz-storage.ts`；规则 `.cursor/rules/jp-vocab-teacher-quiz-pool.mdc` |
| **老师端列表隐藏不可操作行**（进行中：非管理员老师仅见今日可见池内**尚未勾选**的词条，本会话刚勾选仍可见；**已完成**：展示今日已抽查列表） | `JpVocabPage.tsx` → `hideInoperableRows`、`teacherPendingWords`、`filteredDisplayedWords` |
| **老师端可见池可操作**（仅 `visible_ids` / 今日抽查池内可勾选、发给学生；池=当日序号正序 1…N；今日新课完成同步的从未抽查词次日凌晨置顶后再抽；管理员仍见全库） | `JpVocabPage.tsx` → `isWordInQuizTarget`、`quizTargetWords`；`jp-vocab-teacher-visible.ts` → `isJpVocabWordInTeacherVisiblePool`、`listJpVocabTeacherQuizPoolWords`；`JpVocabDailyQuizProgressBar.tsx`；规则 `jp-vocab-teacher-quiz-pool.mdc` |
| 北京时间跨日清理（释放/共享/今日抽查次数/抽查目标恢复 20/课堂带读已带读） | `POST /api/jp-vocab/daily-rollover`；`jp-vocab-daily-rollover.ts`；`resetJpVocabTeacherVisibleLimit()`；`pruneJpVocabCoachCoachedOlderThanRetention()`；Mac 定时 `scripts/jp-vocab-nightly.sh` |
| **抽完后自动禁用老师账号**（记操作人；普通 +1h / 带读欣欣 +2h） | `jp-vocab-teacher-quiz-day.ts`；`teacher-user-quiz-complete-disable.ts`；见 admin/users 子功能「今日抽查完成后自动禁用」 |
| **读音「待补全」**（Mac 每分钟补 `reading`；助词尾/斜杠异写有 fallback；长句跳过） | `scripts/jp-vocab-fill-reading-nightly.sh` → `jp-vocab-fill-reading-api.py`；`POST /api/jp-vocab/fill-reading`；`jp-vocab-fill-reading.ts`；规则 `.cursor/rules/jp-vocab-fill-reading.mdc` |
| **释义补全**（`list_missing` 拉缺释义单词+`prompt`；`apply` 写回中文释义，多义用「；」最多 3 个；传 `source`；老师卡片显示「释义来源」） | `POST /api/jp-vocab/fill-meaning`；`jp-vocab-fill-meaning.ts` / `jp-vocab-meaning-ai.ts`；`meaning_source`；`scripts/jp-vocab-fill-meaning-api.py`；规则 `.cursor/rules/jp-vocab-fill-meaning.mdc` |
| **例句 / 造句补全**（`list_missing` 拉缺例句+`prompt`；`apply` 写回并传 `source` 例句来源；老师卡片/带读列显示「例句来源」；人手改记为「手动」；**存库仍 `漢字(かな)`，页面用 `JpVocabFuriganaText` 显示汉字正下方小字假名**） | `POST /api/jp-vocab/fill-example-sentences`；`scripts/jp-vocab-fill-example-sentences-api.py`；`example_sentences_source`；`JpVocabFuriganaText`；规则 compose + fill-example-sentences + `jp-vocab-example-furigana-display.mdc` |
| 学生点「请老师发送」按钮（**默认关闭**；peek 不依赖此开关） | `jp-vocab-share-ui.ts` → `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED`；`JpVocabStudyPage.tsx` → `requestTeacherShare`；`POST /api/jp-vocab/share-request` |
| **今日共享列表本地缓存**（打开立刻显示；后台刷新；跨日自动失效） | `jp-vocab-study-cache.ts`；`JpVocabStudyPage.tsx` → `loadShared`；Worker 内短缓存 `listJpVocabSharedToday`（`jp-vocab-db.ts`） |
| 学生点「查看老师正在抽查的单词」、老师卡片提示已自行查看 | `JpVocabStudyPage.tsx` → `peekTeacherQuizWord`；`POST /api/jp-vocab/teacher-quiz-live`（学生自行查看时写入 `jp_vocab_shared`，老师后续勾选不重复发送）；`JpVocabPage.tsx` → `syncTeacherQuizLiveWord`、`studentPeekedCurrentWord`；`JpVocabTeacherQuizFlashcardModal.tsx`；`jp-vocab-db.ts` → `peekJpVocabTeacherQuizLiveWord`、`setJpVocabTeacherQuizLiveWord`；`jp-vocab-teacher-quiz-live.ts` |
| 老师右下角 toast（学生协助请求；**默认关**，随 `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED`） | `JpVocabShareRequestModal.tsx`；`JpVocabPage.tsx` 轮询 `GET /api/jp-vocab/share-request` |
| 今日抽查进度条（老师=待抽查数，不按 1 小时锁定；管理员=全天目标；完成后只显示「已完成」；**有带读权限才显示「进入今日带读」**） / 抽完弹窗 | `JpVocabDailyQuizProgressBar.tsx`、`JpVocabDailyQuizCompleteModal.tsx`、`JpVocabDailyQuizIntroModal.tsx`；`jp-vocab-daily-quiz-progress.ts` → `computeJpVocabDailyQuizProgress()`、`computeJpVocabTeacherPageQuizProgress()`；`JpVocabPage.tsx` → `displayQuizProgress`、`teacherPendingWords`、`showTeacherCoachEntry`；弹窗仅在本会话「未完成→已完成」时显示一次（`jp-vocab-daily-complete-dismiss.ts` 按日期+目标数记录） |
| **导出到课堂带读**（今日「一般」「不熟悉」→ `/jp-vocab/coach`；**抽查完成弹窗出现时批量 `merge_queue` 一次写入**，禁止勾选时单条写；剔除已带读、与未带读去重；备注共用 `class_notes`；带读页可改熟悉程度；**仅 `canAccessJpVocabCoach` 显示「进入今日带读」+ 导航**） | `JpVocabPage.tsx` → `showTeacherCoachEntry` + 完成弹窗 effect + `runCoachExport`；`JpVocabCoachPage.tsx`；权限 `canAccessJpVocabCoach` / `JP_VOCAB_COACH_ALLOWED_USERNAMES`（欣欣）；规则 `.cursor/rules/jp-vocab-coach-access.mdc` |
| 熟悉程度勾选、今日序号 | `JpVocabPage.tsx` → `recordLevel`；`jp-vocab-review.ts`、`jp-vocab-daily-order.ts` |
| **手机端排序 / 操作栏折叠**（表头隐藏时提供「默认顺序 / 抽查优先级 / 当日序号」；操作按钮默认收起，点「展开操作」才显示导出等） | `JpVocabPage.tsx` → `toggleStatSort`、`restoreDailyRowOrder`、`mobileToolbarExpanded`；`mobile.css` |
| **导出 Word**（全部数据 / 今日未掌握；导出序号 1. 2. 3.…、日语、读音、类型单词/语法；词条分块、备注图片三列；图片 ≥4 张独占一页；不含熟悉程度与巧记） | `JpVocabPage.tsx` → `runExport`；`JpVocabExportChoiceModal.tsx`；`jp-vocab-export.ts` → `exportJpVocabToWord` |
| **抽问/带读/学生卡片**（**同 UI**：老师抽问、课堂带读、学生收到自动弹卡、学生 peek；一律 `JpVocabTeacherQuizFlashcardModal`；带读 `mode="coach"` 熟悉程度**展示不可勾选**（勿隐藏）；列表操作「查看该带读卡片」=`previewMode` 与点「带读」同卡；学生 `mode="study"`；有例句都显示；老师已发送则 peek 按钮变灰勿再弹；备注合并勿冲例句） | `JpVocabStudyPage.tsx` → `mode="study"`；`JpVocabCoachPage.tsx` → `mode="coach"` + `openCoachCardPreview`；`JpVocabTeacherQuizFlashcardModal.tsx`；`JpVocabTeacherQuizFlashcardStyles.tsx`；`jp-vocab-example-sentences.ts`；`mergeJpVocabWordAfterClassNotesFetch`；规则 `.cursor/rules/jp-vocab-flashcard-examples-parity.mdc`、`jp-vocab-study-scroll-stable.mdc` |
| 老师端列表、分页、表格样式 | `JpVocabPage.tsx`（编排）；`jp-vocab-page/JpVocabWordTable.tsx`、`JpVocabPagination.tsx`、`JpVocabPageStyles.tsx`；`lib/jp-vocab-page-*.ts`、`lib/vocab-page-shared.ts` |
| **每页条数选择**（10/20/50/100；localStorage 记住；刷新后沿用） | `JpVocabPagination.tsx`；`JpVocabPage.tsx` → `pageSize` / `handlePageSizeChange`；`jp-vocab-page-helpers.ts` → `readStoredJpVocabPageSize` / `writeStoredJpVocabPageSize`；`jp-vocab-page-constants.ts` → `JP_VOCAB_PAGE_SIZE_OPTIONS` |
| **保存/同步橙色进度条**（D1 写入较慢；**改保存 UI 必引**） | `src/components/JpVocabSaveProgressBar.tsx`；`src/lib/jp-vocab-save-progress.ts` → `jpVocabSaveProgressLabel`；`.cursor/rules/save-progress-ui.mdc` |
| **课堂备注、共享备注**（支持粘贴/上传图片；**相同图片内容不可重复粘贴/加入**；抽问/带读卡片内点「保存」询问是否共享给学生，进度条：正在保存→正在共享；**study 页有 `canOperate` 时「查看」进可编辑备注**，学生仍只读） | `JpClassNotesEditModal.tsx`（`sharePromptOnSave`）；`jp-vocab-class-notes.ts` → `collectJpVocabClassNoteImageRefKeys`；`POST /api/jp-vocab/class-notes`、`/api/jp-vocab/class-notes/upload`（内容哈希去重）；`JpVocabStudyPage.tsx` → `openRemarksWord`；规则 `.cursor/rules/jp-vocab-study-notes-edit.mdc` |
| 手动添加 / 编辑词条 | `JpVocabManualAddModal.tsx`、`JpVocabEditModal.tsx`（含**巧记**字段，仅管理员）；`/api/jp-vocab/add`、`/edit`；`jp_vocab_word.mnemonic` |
| **日语复习**（选数量、按序号/抽查优先级排序、卡片上/下一个、清除已复习；**今日已在抽问页抽查的词条显示「已抽问」**） | `JpVocabReviewPage.tsx`；`JpVocabAdminReviewFlashcardModal.tsx`；`jp-vocab-review-plan.ts`、`jp-vocab-review-session.ts`、`jp-vocab-daily-check.ts` → `isJpVocabWordQuizzedToday`；`POST /api/jp-vocab/review`；`jp_vocab_review_done` |
| 导航菜单文案 | `src/i18n/messages.ts` → `nav.jpVocab`（老师端）、`nav.jpVocabAdmin`（管理员端）、`nav.jpVocabStudy`、`nav.jpVocabReview`、`nav.jpVocabCoach` |
| 路径常量 | `src/lib/locale-path.ts` → `jpVocabPath()`、`jpVocabAdminPath()`、`jpVocabStudyPath()`、`jpVocabReviewPath()`、`jpVocabCoachPath()` |
| 权限定义 | `src/lib/rbac.ts` → `jp_vocab:teacher`（老师端）、`jp_vocab:admin`（管理员端）、`jp_vocab:study`（学生端）；默认：`jp_vocab` 角色含 teacher；`user` 角色仅 study；`admin` 全部；校验 `src/lib/jp-vocab-auth.ts`、`src/lib/etr-auth.ts` |
| 未登录访问 `/jp-vocab` | `JpVocabPage.tsx` → `TeacherReviewAuth` 全页登录；`GET /api/jp-vocab`、`/api/jp-vocab/sync` → `requireJpVocabRead` |
| 共享后刷新复习页 | `src/lib/jp-vocab-shared-notify.ts`（同浏览器多标签） |
| **微信小程序 · 日语复习** | `wechat-jp-vocab-review/`（独立目录；对接同上 API；见该目录 `README.md`） |

#### 症状 / 关键词速查（老师端 `/jp-vocab`）

| 用户描述或页面文案 | 优先打开 |
|--------------------|----------|
| 今日抽查进度、30/40、剩余 10 | `jp-vocab-daily-quiz-progress.ts`、`JpVocabDailyQuizProgressBar.tsx`（**管理员**看全天目标；**老师**看待抽查数，剩 10 就显示总分 10，完成后只显示「已完成」） |
| 共 X 条、从未抽查、本轮未勾选 | `JpVocabPage.tsx`：管理员端显示「共 X 条 / 从未抽查 / 今日抽查 / 本轮未勾选」；**老师端不显示**「共 X 条 / 从未抽查」（`neverQuizzedCount` 仅 admin）；`unmarkedCount` 统计可见池未勾选 |
| 不在今日可见池不可勾选；还剩 N 个但点完成抽查无反应；从未抽查词抽不到 | `isJpVocabWordInTeacherVisiblePool` / `listJpVocabTeacherQuizPoolWords`；`finishTeacherQuiz`；规则 `jp-vocab-teacher-quiz-pool.mdc` |
| 管理员设抽查数量后老师列表不对 | `jp-vocab-db.ts` → `setJpVocabDailyQuizTarget`；`JpVocabPage.tsx` → `quizTarget` |
| 调高目标后老师勾选词条消失 | 老师列表只显示未勾选，管理员仍见全库 |
| 调高抽查数量后开始抽查仍从序号 1 起、已抽过的还出现在卡片 | `jp-vocab-teacher-quiz.ts` → `filterJpVocabTeacherQuizUncheckedWords`；`JpVocabPage.tsx` → `requestTeacherQuizSession`（队列仅未勾选） |
| 抽了 N 个但序号勾选只连到中间某号（如 62）、后面没勾 | 旧 bug：池按从未抽查插队；现应为正序 1…N。查 `visible_ids` 是否等于序号前 N；今日新词应在末尾且不进池，见 `jp-vocab-teacher-quiz-pool.mdc` |
| 今天刚「已完成」的新课词被马上抽到 / 插到序号最前 | 应次日凌晨才置顶；`created_at` 北京日 ≥ 今日则 `isJpVocabWordSameDayNewNeverQuizzed`；重排见 `sortJpVocabWordsForDailyOrder` |
| 下午老师看到 3/13（其实只剩 10 没抽） | `teacherPendingWords`：只计未勾选，不按 1 小时锁定 |
| 老师搜索 | `JpVocabPage.tsx` → `searchMatchedWords` 扫全库，`filteredDisplayedWords` 老师端再滤掉不可操作行 |
| 今日抽查次数列、北京时间 0 点归零 | `jp-vocab-daily-check.ts`；`jp-vocab-review.ts` |

---

## 英语单词 / 语法抽问（en-vocab）

| 线上 path | 中文名 | 页面 | 主组件 | 说明 |
|-----------|--------|------|--------|------|
| `/en-vocab` | 英语抽背 | `src/app/en-vocab/page.tsx` | `EnVocabPage.tsx` | 与 jp-vocab 结构对称，改日语时可对照 |
| `/en-vocab/study` | 今日英语单词 | `src/app/en-vocab/study/page.tsx` | `EnVocabStudyPage.tsx` | |
| `/en-vocab/ref/[refKey]` | 英语教案 | `src/app/en-vocab/ref/[refKey]/page.tsx` | `EnVocabRefViewer`；下载名见「英语新课 → 教案下载文件名」；API：`src/app/api/en-vocab/*`，库：`en_vocab_*` |

---

## 日语新课（jp-lesson）

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/jp-lesson` | 日语新课 | `src/app/jp-lesson/page.tsx` | `JpLessonPage.tsx` |
| `/jp-lesson/notes` | 课堂笔记（按知识点；**支持粘贴/上传图片**；已完成新课保存后同步到日语抽问 `class_notes`，文字+图片） | `src/app/jp-lesson/notes/page.tsx` | `JpLessonNotesPage.tsx` |
| `/jp-lesson/schedule` | **统一日程管理**（日语 + 英语新课 + 手动日程） | `src/app/jp-lesson/schedule/page.tsx` | `JpLessonSchedulePage.tsx` |
| `/admin/jp-lesson-teachers` | **人员管理 / 上课老师管理**（默认日语；`?subject=en` 英语老师 + 评价；**搜索跨日语+英语模糊匹配**，不必先选类型） | `src/app/admin/jp-lesson-teachers/page.tsx` | `AdminJpLessonTeachersPage.tsx`；搜索 `lesson-teacher-search.ts` |

日程详情右侧「老师」名称可点击，跳转 `/admin/jp-lesson-teachers?teacher={id}`（英语课加 `&subject=en`）并自动滚动定位。路径常量：`adminJpLessonTeachersPath()`、`jpLessonSchedulePath()` in `locale-path.ts`。

逻辑：`src/lib/jp-lesson-db.ts`；API：`src/app/api/jp-lesson/*`；手动日程表 `jp_lesson_manual_schedule`（英语课事件来自 `en_lesson` + `en_lesson_class_schedule`，日程页合并展示）

| 功能描述 | 改哪里 |
|----------|--------|
| **API 上传新课**（`content` + 可选 `meanings` / **`example_sentences`**；`|||` 分隔各词例句；单项「日语 + 译文：」，每词最多 10 条；已完成同步释义与例句到 `/jp-vocab`） | `POST /api/jp-lesson/upload`；`jp-lesson-db.ts` → `createJpLesson`、`syncLessonToVocab`；`jp-lesson-shared.ts` → `parseLessonMeanings`、`normalizeLessonExampleSentencesForStorage` |
| **教案下载文件名**（原图 / 分页 PDF / Word：`{id}、单词学习|语法学习 (词1, 词2, …)`；新课列表下载与「查看」页一致） | `jp-vocab-ref-shared.ts` → `jpLessonRefDownloadFilename`；`JpLessonPage.tsx`；`JpVocabRefViewer` + `jp-vocab/ref/[refKey]/page.tsx`；`GET /api/jp-vocab/ref/[refKey]?download=1`；`getJpLessonByRefKey` |
| 设置上课老师弹窗、按上课频次排序 | `JpLessonTeacherEditModal.tsx`；`jp-lesson-teacher-db.ts` → `getJpLessonTeacherLessonCounts()`；`jp-lesson-teacher-rate.ts` → `sortJpLessonTeachersByLessonCount()` |
| **学习中 + 开课 18h 内 → 立即启用老师账号**（设老师 / 上课时间 / 状态为「学习中」后；与每日 05:00、开课前 2h 定时互补；`admin` / `user1` / `test` 不自动启） | `teacher-user-schedule-enable.ts` → `maybeEnableTeacherUsersForLearningLesson`；`POST /api/jp-lesson`（`set_teacher` / `set_class_schedules` / `set_next_class_at` / `progress_status`）；规则 `.cursor/rules/teacher-lesson-learning-auto-enable.mdc` |
| **课堂笔记图片**（粘贴/上传；格式与抽问备注相同；已完成新课保存后同步到词条 `class_notes`） | `JpLessonNotesPage.tsx`；`POST /api/jp-vocab/class-notes/upload`（`jp_vocab` 或 `jp_lesson:operate`）；`jp-vocab-class-notes.ts`；规则 `.cursor/rules/jp-vocab-notes-hide-image-url.mdc` |
| 统一日程（日语/英语/手动；**「学习中」+「已完成」进日程**，未上课不同步；上完不消失） | `JpLessonSchedulePage.tsx`；`jp-lesson-shared.ts` / `en-lesson-shared.ts` → `build*LessonScheduleEvents` / `*LessonProgressAppearsOnSchedule`；`jp-lesson-manual-schedule.ts` → `LessonScheduleSubject` |
| **日程同步到网易日历（CalDAV，已停用）** | 默认 `SCHEDULE_CALDAV_DISABLED=1`；Mac launchd 已卸；改用下方 ICS。脚本仍保留：`scripts/schedule-caldav-sync.py` |
| **日程订阅到 iPhone / Mac 系统日历（ICS，推荐）** | `GET /api/admin/schedule.ics?token=`（同 `JP_REVIEW_UPLOAD_TOKEN`）；开课前 10 分钟 `VALARM`；`buildScheduleIcs()`；手机：日历 → 添加订阅日历；Mac：日历 → 文件 → 新建日历订阅 |
| **开课前 Bark 推送（线上 Cron）**（Worker 每分钟；Mac 关机也能推；北京时间触发；10/5/1 持续铃响；通知泰国时间；本机 launchd 默认关） | `cloudflare-worker.ts` + `POST /api/admin/schedule-class-bark-remind`；`src/lib/schedule-class-bark-remind.ts`；Secret `BARK_DEVICE_KEY`；规则 `.cursor/rules/bark-deploy-failure-notify.mdc` |
| **部署成功/失败通知**（本机维护中心：Bark → iPhone + Mac 通知中心并行；成功有提示音；标题带项目名+改动文件） | `scripts/maintenance_center/bark_notify.py`、`mac_notify.py`；`hub._finish`；密钥 `~/.config/bark/env`；跨项目说明 `docs/bark-cross-project-howto.txt`；开关见 `.env.deploy.local.example`；规则同上 |
| 英语老师管理 / 评价（合并）；**不建登录账号** | `AdminJpLessonTeachersPage.tsx`；`?subject=en`；`/admin/en-lesson-teachers` 重定向至此；`POST /api/admin/en-lesson-teachers` **不再** `provisionEnLessonTeacherUser` |
| **人员管理模糊搜索**（日语/英语一起搜；候选标科目；点选或仅另一科命中时自动切 `?subject=`） | `AdminJpLessonTeachersPage.tsx` → `loadOtherSubjectTeachers` / `searchSuggestions` / `applySearch`；`lesson-teacher-search.ts` → `lessonTeacherSubjectSearchLabels`；规则 `.cursor/rules/admin-teacher-cross-search.mdc` |

---

## 英语新课（en-lesson）

| path | 页面 | 主组件 |
|------|------|--------|
| `/en-lesson` | `src/app/en-lesson/page.tsx` | `EnLessonPage.tsx` |
| `/en-lesson/notes` | `src/app/en-lesson/notes/page.tsx` | `EnLessonNotesPage.tsx` |
| `/en-lesson/schedule` | **重定向** → `/jp-lesson/schedule` | |
| `/english-teacher-review` | **重定向** → `/admin/jp-lesson-teachers?subject=en`（评价已合并） | |

| 功能描述 | 改哪里 |
|----------|--------|
| 设置上课老师弹窗（弹窗内新增老师并保存） | `EnLessonTeacherEditModal.tsx`（添加行右侧「保存」）；`EnLessonPage.tsx` → `addLessonTeacher` / `setLessonTeachers`（合并老师列表，勿用旧闭包覆盖刚添加的老师）；API：`/api/admin/en-lesson-teachers`、`POST /api/en-lesson` `set_teacher` |
| **教案下载文件名**（英文：`{id}. Word Learn|Grammar Learn (word1, word2, …)`，空格保留；列表与「查看」页一致；供菲律宾等英语老师识别） | `en-vocab-ref-shared.ts` → `enLessonRefDownloadFilename`；`EnLessonPage.tsx`；`EnVocabRefViewer` + `en-vocab/ref/[refKey]/page.tsx`；`GET /api/en-vocab/ref/[refKey]?download=1`；`getEnLessonByRefKey` |
| **教案下载格式**（整图 PDF：整张图嵌入一页、不拆分；另保留分页 PDF / Word；管理员可下原图） | `EnVocabRefDownloadMenu.tsx`；`en-vocab-ref-pdf-export.ts` → `exportEnVocabRefFullImagePdf` / `exportEnVocabRefPaginatedPdf` |
| **复制菜单**（带模板 / 仅链接 / **仅文字**：助教话术，自动填入上课老师名，无链接；教材 PDF 另行下载发送） | `EnLessonCopyMenu.tsx` → `buildEnLessonTextOnlyCopy`；`EnLessonPage.tsx` |

---

## 其他常用页面

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/`、`/zh` | 策略对比 | `src/app/page.tsx`、`zh/page.tsx` | `ComparePage.tsx` |
| `/english-teacher-review` | 英语老师评价（**已重定向**至上课老师管理） | `english-teacher-review/page.tsx` | |
| `/jp-review` | 日语口语复习 | `jp-review/page.tsx` | |
| `/about` | 关于与反馈 | `about/page.tsx` | `AboutPage.tsx` |
| `/admin` | 后台管理 | `admin/page.tsx` | `AdminDashboardPage.tsx` |
| `/admin/rbac` | 角色权限 | `admin/rbac/page.tsx` | `AdminRbacPage.tsx` |
| `/admin/users` | 用户管理 | `admin/users/page.tsx` | `AdminUsersPage.tsx` |
| `/store-review` | 外卖评价 | `store-review/page.tsx` | |

### admin/users 子功能

| 功能描述 | 改哪里 |
|----------|--------|
| 用户列表、**无对应老师时「绑定老师」/ 已绑定时「更改」**（点开下拉选择并绑定或改绑；一位老师最多绑一个账号）、添加/编辑亦可改关联、创建/禁用/登录链接 | `AdminUsersPage.tsx`、`AdminUserBindTeacherModal.tsx`、`AdminUserEditModal.tsx`；`GET/POST/PATCH /api/admin/users`（`jp_lesson_teacher_id`）；`setUserJpLessonTeacherLink` |
| **列表排序**（ID / 最近登录 / **状态**正常↔已禁用；手机端排序按钮同字段） | `AdminUsersPage.tsx` → `sortUsers`、`toggleSort`、`UserSortField` |
| **手机端用户卡片**（&lt; lg 显示卡片 + 排序；桌面端表格） | `AdminUsersPage.tsx` → `admin-cards` / `admin-table-wrap`；`mobile.css` |
| **复制账号密码**（含日语子域名 `/jp-vocab` 入口；密码来自本机缓存；**李老师 / user1 等保留账号无缓存时禁止一键随机重置**，须「编辑」填写） | `AdminUsersPage.tsx` → `copyUserCredentials`；`resetUserPasswordByAdmin`（`cannot_reset_bootstrap`）；`admin-user-credentials.ts` → `formatAdminUserCredentials`（`JP_SITE_URL` + `jpVocabPath()`）；规则 `.cursor/rules/bootstrap-account-password.mdc` |
| 创建/登录时间显示为**北京时间** | `AdminUsersPage.tsx` → `formatBeijingDateTime`；`src/lib/format-datetime.ts` |
| **最后登录 IP 折叠**（长 IPv6 默认收起 +「展开/收起」；IPv4 一行展示；禁止每行 N 字符强折） | `AdminUsersPage.tsx` → `AdminUserIpDisplay`；规则 `.cursor/rules/admin-users-ip-collapse.mdc` |
| **今日有课老师账号自动启用**（北京时间 05:00；仅日语新课排课 + 手动日程；**不含英语课/英语老师**——英语老师不建登录账号；`admin` / `user1` / `test` 不受控） | `src/lib/teacher-user-schedule-enable.ts`；`POST /api/admin/teacher-user-schedule-enable`；Mac 定时 `scripts/teacher-user-schedule-enable.sh` + `setup-teacher-user-schedule-enable-mac.sh` |
| **开课前 2 小时自动启用**（每 10 分钟；已禁用→可用；`dirlock` 防重叠；与 05:00 / 学习中 18h 互补；抽完禁用在临近课窗口跳过） | `runTeacherUserPreClassEnable`；`POST /api/admin/teacher-user-pre-class-enable`；Mac `scripts/setup-teacher-user-pre-class-enable-mac.sh`（`StartInterval=600`）；规则 `.cursor/rules/teacher-pre-class-auto-enable.mdc` |
| **学习中 + 开课 18h 内立即启用**（管理员在 `/jp-lesson` 设好老师+时间并标「学习中」时，不必等 05:00） | 同上 `maybeEnableTeacherUsersForLearningLesson`；挂钩 `POST /api/jp-lesson`；规则 `teacher-lesson-learning-auto-enable.mdc` |
| **今日抽查完成后自动禁用**（记操作人到 `jp_vocab_teacher_quiz_day`，**不写词条表**；普通老师抽完 +1h，带读账号如欣欣 +2h；临近开课前后 2h **跳过禁用**；`admin` / `user1` / `test` 不受控） | `src/lib/jp-vocab-teacher-quiz-day.ts`（勾选时写入）；`src/lib/teacher-user-quiz-complete-disable.ts`；`POST /api/admin/teacher-user-quiz-complete-disable`；Mac 定时 `scripts/teacher-user-quiz-complete-disable.sh` + `setup-teacher-user-quiz-complete-disable-mac.sh`（每 15 分钟）；规则 `.cursor/rules/teacher-quiz-complete-auto-disable.mdc` |

---

## 全局横切

| 用途 | 文件 |
|------|------|
| 登录 / 会话 / 前端权限 | `src/contexts/EtrAuthProvider.tsx`、`src/lib/etr-auth.ts`、`src/app/api/english-teacher-review/auth/route.ts` |
| RBAC 权限表 | `src/lib/rbac.ts`、`src/lib/rbac-db.ts`、`schema.sql` → `etr_role_permissions` |
| 站点导航（顶栏：管理员端固定最左；其余按使用频次；溢出→「更多」） | `src/hooks/useSiteNavSplit.ts`、`src/lib/site-nav-config.ts`（`PINNED_PRIMARY_NAV_ID`）、`src/hooks/useSiteNavItems.ts`、`src/components/SiteNav.tsx`、`src/components/AppShell.tsx`；规则 `.cursor/rules/site-nav-pin-freq.mdc` |
| 全站样式 / 红涨绿跌 | `src/app/globals.css`、`src/app/mobile.css`；规则见 `.cursor/rules/red-rise-green-fall.mdc`（父仓库） |
| 数据库 schema | `schema.sql`（部署迁移；运行时补表见各 `*-db.ts` 内 `ensure*Schema`） |
| **自动部署**（维护中心 `http://127.0.0.1:17823/`；Cursor `stop` hook 触发；**fingerprint 仅成功 POST 后写入**；忙时入队勿跳过；完成后 Bark + Mac 桌面通知） | `.cursor/hooks/auto-publish-mode1.sh`；`scripts/maintenance_center/server.py`；`bark_notify.py` / `mac_notify.py`；规则 `.cursor/rules/auto-publish-fingerprint.mdc`、`bark-deploy-failure-notify.mdc`；回归 `scripts/check_auto_publish_fingerprint.py` |

---

## 维护说明

- 新增页面或改 URL 时，请同步更新本文件对应行。
- 线上 URL 只需 path 部分即可索引，例如用户发 `https://finance.info-quests.com/jp-vocab/study` → 查 `/jp-vocab/study`。
