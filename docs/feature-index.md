# 功能索引（Feature Index）

改功能前**先查本表**：用户粘贴线上 URL、说中文功能名、或描述页面行为时，从这里定位文件，避免全库盲搜。

线上根域名示例：`https://finance.info-quests.com`（路径与下表一致）。

| 子域名 | 用途 |
|--------|------|
| `finance.info-quests.com` | 主站（金融等） |
| `japanese.info-quests.com` | 日语模块对外（老师登录链接、`/jp-vocab` 等；与 finance **同一 Worker / 同一 D1**） |
| `english.info-quests.com` | 英语模块对外（英文老师登录链接、`/en-vocab` 等；与 finance / japanese **同一 Worker / 同一 D1**） |
| `korean.info-quests.com` | 韩语模块对外（韩语老师登录链接、`/ko-pron` 等；与 finance / japanese / english **同一 Worker / 同一 D1**） |
| `blog.info-quests.com` / `food.info-quests.com` | 博客 / 外卖（见 wrangler.toml） |

配置入口：`wrangler.toml` → `[[routes]]` + `NEXT_PUBLIC_JP_SITE_*` / `NEXT_PUBLIC_EN_SITE_*` / `NEXT_PUBLIC_KO_SITE_*`；代码：`src/lib/jp-site-host.ts`、`src/lib/en-site-host.ts`、`src/lib/ko-site-host.ts`。

**给其它项目复制的接口说明**：总目录 `docs/external-apis-for-copy.txt`；单接口 `docs/*-api.txt`（改 API 必须更新，规则 `api-call-docs-txt.mdc`）。

---

## 怎么用

1. 从 URL 取 **path**（去掉域名），如 `/jp-vocab/study`
2. 在下方表格搜 path，或搜中文关键词（如「日语抽问-老师端」「日语抽问-管理员端」「发给学生」「查看老师正在抽查的单词」「今日日语单词」）
3. 按列打开：**页面 → 组件 → API → 数据库/权限**

日语/英语/韩语学习模块 URL **不带** `/zh` 前缀（见 `src/lib/locale-path.ts` `isLocaleNeutralPath`）。

> 维护说明：本文档仅作开发索引，修改不影响线上功能。（自动部署钩子验证用）

---

## 日语单词 / 语法抽问（jp-vocab）

| 线上 path | 中文名 | 页面入口 | 主组件 | 关键 API | 数据 / 逻辑 | 权限 |
|-----------|--------|----------|--------|----------|-------------|------|
| `/jp-vocab` | **日语抽问-老师端**（抽查卡片、勾选熟悉程度、发给学生） | `src/app/jp-vocab/page.tsx` | `JpVocabPage variant="teacher"`（未登录 → 全页登录） | `GET/POST /api/jp-vocab`、`/api/jp-vocab/sync`、`/api/jp-vocab/share`（GET 需 `requireJpVocabRead`） | 共用 `jp_vocab_*`；`src/lib/jp-vocab-share-ui.ts` → `JP_VOCAB_TEACHER_SHARE_ENABLED` | 须登录；`jp_vocab:read` 浏览；`jp_vocab:operate` 勾选/发给学生；管理员进此 URL 会 redirect 到 `/jp-vocab/admin` |
| `/jp-vocab/admin` | **日语抽问-管理员端**（全库、设今日抽查数量、导出、预览卡片） | `src/app/jp-vocab/admin/page.tsx` | `JpVocabPage variant="admin"` | 同上（设目标等管理操作用 admin API） | 与老师端**共用同一张表 / 同一套 API**；UX 由 `variant` 区分 | `admin`；非管理员进此 URL 会 redirect 到 `/jp-vocab` |
| `/jp-vocab/study` | 今日日语单词、学生复习；**主路径=peek**；「请老师发送」默认关 | `src/app/jp-vocab/study/page.tsx` | `JpVocabStudyPageClient.tsx`（`ssr:false` 壳）→ `JpVocabStudyPage.tsx` | `GET /api/jp-vocab/shared`、`POST /api/jp-vocab/teacher-quiz-live`（peek）；`share-request` 仅当开关开 | 同上 + `jp_vocab_share_request`；开关 `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED=false` | `jp_vocab:study` 学生；`admin` 管理员（老师不可见） |
| `/jp-vocab/review` | **日语复习**（选数量/排序、卡片复习、手动清除进度；卡面同抽问、无熟悉程度；未展开只露汉字） | `src/app/jp-vocab/review/page.tsx` | `JpVocabReviewPage.tsx` | `GET/POST /api/jp-vocab/review` | `jp_vocab_review_done`（跨日不清零） | `admin` 管理员 |
| `/jp-vocab/coach` | **课堂带读**（合并队列：「一般」「不熟悉」与未带读去重合并；**今日抽查完成弹窗出现时批量写入**；已带读不拉回；**带读卡片与抽问卡同 UI，熟悉程度只展示不可勾选**；备注与抽问同步；**带读卡片显示例句**；列表有例句列、带读状态与操作列「查看该带读卡片」；**已带读北京时间次日凌晨清空**，未带读不过期） | `src/app/jp-vocab/coach/page.tsx` | `JpVocabCoachPage.tsx` | `GET/POST /api/jp-vocab/coach`（`merge_queue` / `mark_coached`） | `jp_vocab_coach_item`（`word_id` 主键 + `coached_at`）；跨日清理见 `daily-rollover` | **`jp_vocab:coach` 或白名单**（当前 `XinXin`=欣欣；李老师/玉老师默认无）；`admin` 全部；抽查完成入队仍用 `jp_vocab:operate` |
| `/jp-vocab/ref/[refKey]` | 教案/参考资料查看（**手机长按 /「保存图片」→ 系统分享「存储图像」进相册**；缩放层会拦系统长按菜单） | `src/app/jp-vocab/ref/[refKey]/page.tsx` | `JpVocabRefViewer` + `VocabRefImageZoom` + `vocab-ref-save-image.ts` | `/api/jp-vocab/ref/*` | `jp_vocab_ref` | 随单词页；下载名见「日语新课 → 教案下载文件名」；规则 `.cursor/rules/vocab-ref-save-image.mdc` |

### jp-vocab 子功能 → 文件速查

| 功能描述 | 改哪里 |
|----------|--------|
| **老师/管理员入口拆分**（导航名「日语抽问-老师端 / 管理员端」；表共用、组件 `variant` 区分） | `/jp-vocab` vs `/jp-vocab/admin`；`locale-path.ts` → `jpVocabPath()` / `jpVocabAdminPath()`；`messages.ts` → `nav.jpVocab` / `nav.jpVocabAdmin`；规则 `.cursor/rules/jp-vocab-admin-teacher-split.mdc` |
| 老师点「发给学生」、共享进度条（**仅老师端**；开关**默认关**） | `jp-vocab-share-ui.ts` → `JP_VOCAB_TEACHER_SHARE_ENABLED`；`JpVocabPage.tsx` → `teacherShareUiEnabled` / `shareWord`；`POST /api/jp-vocab/share`；`shareJpVocabWord()`；卡片 `JpVocabTeacherQuizFlashcardModal` |
| 管理员设今日抽查数量（进度条内输入框 + 确认设置；生成老师可见池 `visible_ids` = 当日序号正序 1…N；今日新入库从未抽查词不进池） | **仅管理员端** `/jp-vocab/admin`；`JpVocabDailyQuizProgressBar.tsx`；`JpVocabPage.tsx` → `setDailyQuizTarget`；`POST /api/jp-vocab` `set_daily_quiz_target`；`jp-vocab-db.ts` → `setJpVocabDailyQuizTarget()`；**finance / japanese 共用 D1**，但 **localStorage 按域名隔离**，老师端靠 `/api/jp-vocab/sync` 轮询拉 `teacher_visible_limit`（非 BroadcastChannel） |
| **最终抽问得分 / 久未复习抬升**（`final_score = priority + days × 0.1`；**从未抽查不算分、日序默认置顶**；已抽查日序主依据为 **SRS 到期日**，`final_score` 仅同档打平；权重固定 0.1，**无管理员调节 UI**） | `jpVocabAppliesFinalQuizScore` / `jpVocabFinalQuizScoreOrNull`；`sortJpVocabWordsForDailyOrder`；`getJpVocabQuizTimeWeight`（恒返回默认）；规则 `.cursor/rules/jp-vocab-quiz-time-weight.mdc`、`.cursor/rules/jp-vocab-srs.mdc`；回归 `scripts/check_jp_vocab_quiz_score.py`、`scripts/check_jp_vocab_srs.py` |
| **间隔重复 SRS**（勾选熟悉程度写 `srs_interval_days` / `srs_due_date`；非常熟悉 10→20→30→…；不熟悉 1 天；今日池仍 1…N；从未抽查最前，其后已到期优先） | `jp-vocab-srs.ts`；`applyJpVocabReview`；`jp-vocab-db/helpers.ts` schema；规则 `.cursor/rules/jp-vocab-srs.mdc`；回归 `scripts/check_jp_vocab_srs.py` |
| **老师端抽查卡片**（点「抽查」或点词条即开卡片；**模式固定随机**（禁止正序，避免学生背顺序；卡片左上角标「随机」）；开始前可弹操作说明；今日可见池内熟悉程度**仅能在卡片内勾选**；卡片内可**发给学生**；已发送后勾选仅更新熟悉程度、不重复同步；**抽查队列 = visible_ids 中未勾选词**（勿用序号 1–N 代替；调高目标后从剩余未抽查起）；刷新/掉线后自动回到**第一个未勾选**词卡片，进行中不展示列表；**进度已完成后关卡片并展示今日已抽列表**；卡片标题旁显示「单词：/语法：」；统计区为**抽查权重**（括号说明：数值越大越应该被抽查）；卡片**右上角计时器**（`00:00` 起计、勾选熟悉程度后停住，仅老师抽查卡）；预览同款 UI） | `JpVocabPage.tsx` → `startTeacherQuizWithRandomMode`、`requestTeacherQuizSession`、`recordLevel(..., "flashcard")`、`shareWord`、`hideTeacherQuizList`、`teacherQuizLocksTable`；**管理员**在列表内直接改熟悉程度，不进抽查流程；操作列「查看抽问卡片」预览同款 UI（`previewMode`）；`JpVocabTeacherQuizIntroModal.tsx`；`JpVocabTeacherQuizFlashcardModal.tsx`（`answerElapsedSec`）；`JpVocabFlashcardWordHero.tsx`；`jp-vocab-teacher-quiz.ts`；`jp-vocab-teacher-visible.ts` → `listJpVocabTeacherQuizPoolWords`、`isJpVocabWordInTeacherVisiblePool`；`jp-vocab-teacher-quiz-storage.ts`；规则 `.cursor/rules/jp-vocab-teacher-quiz-pool.mdc`、`.cursor/rules/vocab-teacher-quiz-random-only.mdc` |
| **老师端列表隐藏不可操作行**（进行中：非管理员老师仅见今日可见池内**尚未勾选**的词条，本会话刚勾选仍可见；**已完成**：展示今日已抽查列表） | `JpVocabPage.tsx` → `hideInoperableRows`、`teacherPendingWords`、`filteredDisplayedWords` |
| **老师端可见池可操作**（仅 `visible_ids` / 今日抽查池内可勾选、发给学生；池=当日序号正序 1…N；今日新课完成同步的从未抽查词次日凌晨置顶后再抽；管理员仍见全库） | `JpVocabPage.tsx` → `isWordInQuizTarget`、`quizTargetWords`；`jp-vocab-teacher-visible.ts` → `isJpVocabWordInTeacherVisiblePool`、`listJpVocabTeacherQuizPoolWords`；`JpVocabDailyQuizProgressBar.tsx`；规则 `jp-vocab-teacher-quiz-pool.mdc` |
| 北京时间跨日清理（释放/共享/今日抽查次数/抽查目标恢复 20/课堂带读已带读） | `POST /api/jp-vocab/daily-rollover`；`jp-vocab-daily-rollover.ts`；`resetJpVocabTeacherVisibleLimit()`；`pruneJpVocabCoachCoachedOlderThanRetention()`；Mac **独立** launchd `com.infoquests.jp-vocab-daily-rollover`（`jp-vocab-daily-rollover-nightly.sh`：**RunAtLoad 开机补跑**，同北京日已成功则 skip）；安装 `setup-jp-vocab-daily-rollover-mac.sh`（fill-reading setup 联装）；**读音补全不会顺带重置**；规则 `.cursor/rules/jp-vocab-daily-rollover-catchup.mdc` |
| **抽完后自动禁用老师账号**（记操作人；普通 +1h / 带读欣欣 +2h） | `jp-vocab-teacher-quiz-day.ts`；`teacher-user-quiz-complete-disable.ts`；见 admin/users 子功能「今日抽查完成后自动禁用」 |
| **读音「待补全」**（Mac 每分钟补 `reading`；助词尾/斜杠异写有 fallback；长句跳过） | `scripts/jp-vocab-fill-reading-nightly.sh` → `jp-vocab-fill-reading-api.py`；`POST /api/jp-vocab/fill-reading`；`jp-vocab-fill-reading.ts`；规则 `.cursor/rules/jp-vocab-fill-reading.mdc` |
| **释义补全**（`list_missing` / `apply` / **`clear_all`**；多义用「；」最多 3、常用在前；缺释义时若同时缺**词性/例句**则同一次 Cloud 一并补（`need_pos`/`need_examples`，例句只要常用用法）；**无本机 Ollama 定时**；**tokken Anthropic** 与英语线上同套，硬限流 ≥1s/条、前一任务未完则等待；**仅单词**缺释义才拉；**语法类释义从新课「已完成」同步**，不走本接口） | `POST /api/jp-vocab/fill-meaning`；`jp-vocab-fill-meaning.ts` / `jp-vocab-meaning-ai.ts`；`meaning_source`；`scripts/jp-vocab-fill-meaning-api.py` + `scripts/lib/paid_anthropic_client.py`；规则 `.cursor/rules/jp-vocab-fill-meaning.mdc` |
| **例句 / 造句补全**（`list_missing` 拉缺例句+`prompt`；`apply` 写回并传 `source`；老师卡片显示「例句来源」；人手改记为「手动」；**Mac 定时静默=今日最后抽查后再等 1h**，见 `fill-schedule-gate`；**存库仍 `漢字(かな)`，页面用 `JpVocabFuriganaText`**；**な形容词「〜だ」用词干造句**见 `jp-vocab-na-adj.ts`；**语法须先有 `usage`，例句与用法 1:1**；**管理员卡片「手动补全例句」**调线上 tokken 覆盖写回用法+例句，老师不可见） | `POST /api/jp-vocab/fill-example-sentences`；`POST /api/jp-vocab/manual-fill-examples`（`requireAdmin`）；`jp-vocab-manual-fill-examples.ts`；`JpVocabFlashcardManualFillExamples`；`POST /api/jp-vocab/fill-schedule-gate`；规则 compose + fill-example-sentences |
| **语法用法补全**（仅 `kind=grammar`；编号中文用法 N5～N2 常用度降序；卡片「用法 / 例句」配对展示；**同一次输出末尾【接序】**（接续形态，不写进用法正文）；tokken 付费串行 ≥1s/条；可 `clear_grammar_examples` 只清语法例句；**同一 word_id 调 3 次仍未搞定 → 熔断停掉全部日语+英语 fill 定时**，见 `vocab_fill_circuit_breaker`） | `POST /api/jp-vocab/fill-usage`；`jp-vocab-usage-ai.ts` / `jp-vocab-fill-usage.ts` / `jp-vocab-connection-ai.ts`；`JpVocabUsageExamplesPairedContent`；卡片 `JpVocabConnectionSection`；`scripts/jp-vocab-fill-grammar-usage-examples-api.py`；规则 `.cursor/rules/jp-vocab-grammar-usage.mdc`、`.cursor/rules/vocab-fill-circuit-breaker.mdc` |
| **词条存在性检测 API**（给外部项目上传/提取前去重；传单词/语法返回 1 或 0；**单词**会算上日语新课「学习中/未完成」里的词，与 download-all 同集合） | `GET /api/jp-vocab/exists?word=...&kind=word\|grammar\|any`；实现 `src/app/api/jp-vocab/exists/route.ts`，`existsJpVocabLemmaForExternalCompare`；说明文档 `docs/jp-vocab-exists-api.txt` |
| **一键下载全部词条 API**（给外部项目整库比对；已有词不做教案；仅 id/word/kind；**单词**=词库+未完成新课单词去重，**语法**=仅词库、暂不合并新课语法；仅新课有的 id=0） | `GET /api/jp-vocab/download-all?kind=word\|grammar\|any&format=json\|txt`；实现 `src/app/api/jp-vocab/download-all/route.ts`，DB `listJpVocabLemmasForDownload` + `listIncompleteJpLessonWordLemmas`；说明文档 `docs/jp-vocab-download-all-api.txt`；回归 `scripts/check_jp_vocab_download_all_incomplete_lessons.py` |
| **接序**（单词/语法：动词哪一形、一类·二类形容词、名词如何接；**有编号用法时接续贴在每条「N.用法」正下方「接续：」**，不再单独一块；`用法1:/用法2:` 自动换行对应；无编号用法时仍用 `JpVocabConnectionSection`；标题旁「复制」；**「动词辞书形/動詞辞書形」一律带「（动词原形）」**；与用法/例句同次补全；**用法正文禁止夹接续**） | 列 `connection` / `connection_source`；`jp-vocab-connection-ai.ts`（`parseJpVocabConnectionDisplayParts` / `jpVocabConnectionShownInlineWithUsage`）；展示 `JpVocabUsageExamplesPairedContent`；回退 `JpVocabConnectionSection`；编辑 `JpVocabEditConnectionField`；回归 `scripts/check_jp_vocab_connection_inline_with_usage.py`、`check_jp_vocab_dongci_jishokei_label.py` |
| 学生点「请老师发送」按钮（**默认关闭**；peek 不依赖此开关） | `jp-vocab-share-ui.ts` → `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED`；`JpVocabStudyPage.tsx` → `requestTeacherShare`；`POST /api/jp-vocab/share-request` |
| **今日共享列表本地缓存**（打开立刻显示；后台刷新；跨日自动失效） | `jp-vocab-study-cache.ts`；`JpVocabStudyPage.tsx` → `loadShared`；Worker 内短缓存 `listJpVocabSharedToday`（`jp-vocab-db.ts`） |
| **学生端轻量轮询 shared**（老师勾选后跨设备约 ≤5s 弹卡；同浏览器靠 BroadcastChannel 立刻；凌晨/test 降频） | `useVocabStudySharedPoll.ts`；`JP_VOCAB_STUDY_POLL_MS=5s`；规则 `shared-list-no-notes-blob.mdc`；回归 `scripts/check_vocab_study_shared_poll.py` |
| 学生点「查看老师正在抽查的单词」、老师卡片提示已自行查看；**获取不到 / 很慢**（老师 live 未同步成功）；**peek 后老师已切词按钮仍灰**（须用 shared 的 `teacher_live_word_id` 刷新，勿钉上次 peek） | `JpVocabStudyPage.tsx` → `peekTeacherQuizWord` / `applyTeacherLiveWordId`；`GET /api/jp-vocab/shared` → `teacher_live_word_id`；`POST /api/jp-vocab/teacher-quiz-live`；`useJpVocabTeacherQuiz.ts` → `syncTeacherQuizLiveWord`；规则 `.cursor/rules/vocab-study-peek-button-live.mdc`、`vocab-teacher-quiz-live-sync.mdc`；回归 `scripts/check_vocab_study_peek_live_refresh.py`、`check_vocab_teacher_quiz_live_sync.py` |
| 老师右下角 toast（学生协助请求；**默认关**，随 `JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED`） | `JpVocabShareRequestModal.tsx`；`JpVocabPage.tsx` 轮询 `GET /api/jp-vocab/share-request` |
| **客户端轮询降频**（北京 **00:00–08:00** 且今日日程无课 → 5/15min；当日有课不降；账号 `test`/`user1` 白天 1/3min；日语/英语/韩语老师+学生 sync） | `src/lib/vocab-poll-throttle.ts` + `vocab-poll-today-has-class.ts`；`GET /api/schedule/today-has-class`；规则 `.cursor/rules/vocab-poll-quiet-hours.mdc`；回归 `scripts/check_vocab_poll_quiet_hours.py` |
| 今日抽查进度条（老师=待抽查数，不按 1 小时锁定；管理员=全天目标；完成后只显示「已完成」；**有带读权限才显示「进入今日带读」**） / 抽完弹窗 | `JpVocabDailyQuizProgressBar.tsx`、`JpVocabDailyQuizCompleteModal.tsx`、`JpVocabDailyQuizIntroModal.tsx`；`jp-vocab-daily-quiz-progress.ts` → `computeJpVocabDailyQuizProgress()`、`computeJpVocabTeacherPageQuizProgress()`、**`computeJpVocabStudyPageQuizProgress()`**；`JpVocabPage.tsx` → `displayQuizProgress`；**学生端** `JpVocabStudyPage`：分子=今日共享列表条数、分母=管理员今日抽查数量（自算，勿用全库 today_check）；规则 `.cursor/rules/jp-vocab-study-quiz-progress.mdc` |
| **学生端老师抽查进度**（列表有 2 条、目标 10 → 显示 2/10；peek 入列表即计入） | `computeJpVocabStudyPageQuizProgress`；`getJpVocabStudyQuizProgressTarget`（shared API 只回分母）；`JpVocabStudyPage.tsx`；回归 `scripts/check_jp_vocab_study_quiz_progress.py` |
| **导出到课堂带读**（今日「一般」「不熟悉」→ `/jp-vocab/coach`；**抽查完成弹窗出现时批量 `merge_queue` 一次写入**，禁止勾选时单条写；剔除已带读、与未带读去重；备注共用 `class_notes`；带读页可改熟悉程度；**仅 `canAccessJpVocabCoach` 显示「进入今日带读」+ 导航**） | `JpVocabPage.tsx` → `showTeacherCoachEntry` + 完成弹窗 effect + `runCoachExport`；`JpVocabCoachPage.tsx`；权限 `canAccessJpVocabCoach` / `JP_VOCAB_COACH_ALLOWED_USERNAMES`（欣欣）；规则 `.cursor/rules/jp-vocab-coach-access.mdc` |
| 熟悉程度勾选、今日序号 | `JpVocabPage.tsx` → `recordLevel`；`jp-vocab-review.ts`、`jp-vocab-daily-order.ts` |
| **手机端排序 / 操作栏折叠**（表头隐藏时提供「默认顺序 / 抽查优先级 / 当日序号」；操作按钮默认收起，点「展开操作」才显示导出等） | `JpVocabPage.tsx` → `toggleStatSort`、`restoreDailyRowOrder`、`mobileToolbarExpanded`；`mobile.css` |
| **表头全列可排序**（除操作；序号·类型·单词·读音·释义·词性·巧记·优先级·熟悉程度·复习次数·今日次数·备注；点表头升/降；老师端/管理员端同表） | `JpVocabWordTable` `JpVocabThSortButton`；`jp-vocab-shared.ts` → `JpVocabStatSortKey` + `sortJpVocabWordsByStat`；`JpVocabPage` `toggleStatSort`；规则 `.cursor/rules/jp-vocab-admin-all-columns-sortable.mdc`；回归 `scripts/check_jp_vocab_admin_all_columns_sortable.py` |
| **导出 Word**（全部数据 / 今日未掌握；导出序号 1. 2. 3.…、日语、读音、类型单词/语法；词条分块、备注图片三列；图片 ≥4 张独占一页；不含熟悉程度与巧记） | `JpVocabPage.tsx` → `runExport`；`JpVocabExportChoiceModal.tsx`；`jp-vocab-export.ts` → `exportJpVocabToWord` |
| **导出 Excel（复习次数）**（管理员端；**第一张表「规则说明」**含 priority + final_score 与时间权重；第二张表：ID、名字、三项次数、基础优先级、距上次抽问天数、最终抽问得分） | `JpVocabPage.tsx` → `runExportExcel`；`JpVocabExportChoiceModal.tsx`；`jp-vocab-excel-export.ts` → `exportJpVocabReviewStatsToExcel`（动态 `import("xlsx")`） |
| **抽问/带读/学生/复习卡片**（**同 UI**：老师抽问、课堂带读、学生收到自动弹卡、学生 peek；一律 `JpVocabTeacherQuizFlashcardModal`；带读 `mode="coach"` 熟悉程度**展示不可勾选**（勿隐藏）；列表操作「查看该带读卡片」=`previewMode` 与点「带读」同卡；学生 `mode="study"`；有例句都显示；**单词/语法统一「用法 / 例句」配对展示**（无用法则只显示带序号例句；**有编号用法时例句用二级圈号 ①②**，多余例句挂末条用法下）；**老师/管理员「用法 / 例句」旁「编辑用法/例句」**（打开编辑弹窗改用法+例句+假名）；**管理员「手动补全例句」**；**例句标题旁「复制全部」**；**当前** live 词已在列表则 peek 按钮变灰（live id 随 shared 刷新）；备注合并勿冲例句；**备注下方展示「标注」**（口语常用 / 考试常用 / 口语考试都常用，有则显示）；**统计区后靠后弱标签展示教材课次**（`course_label`，如「标日初级上册第23课」，新课完成同步）；**复习卡** `JpVocabAdminReviewFlashcardModal` 同样式，无熟悉程度，未展开只露汉字；例句汉字须有下方小字假名，见 `jp-vocab-example-furigana-edit.mdc`） | `JpVocabStudyPage.tsx` → `mode="study"`；`JpVocabCoachPage.tsx` → `mode="coach"` + `openCoachCardPreview`；`JpVocabTeacherQuizFlashcardModal.tsx`；`JpVocabAdminReviewFlashcardModal.tsx`；`JpVocabAnnotationSection.tsx`；`JpVocabCourseLabelSection.tsx`；`jp-vocab-annotation.ts`；`JpVocabExampleSentenceCopyButton.tsx`；`jpVocabExampleSentencesCopyText`；`jp-vocab-usage-examples-display.ts`（`jpVocabCircledExampleIndex`）；`JpVocabTeacherQuizFlashcardStyles.tsx`；`jp-vocab-example-sentences.ts`；`mergeJpVocabWordAfterClassNotesFetch`；规则 `.cursor/rules/jp-vocab-flashcard-examples-parity.mdc`、`jp-vocab-annotation.mdc`、`jp-vocab-course-label.mdc`、`jp-vocab-study-scroll-stable.mdc`、`vocab-study-peek-button-live.mdc`、`jp-vocab-example-furigana-edit.mdc`；回归 `scripts/check_jp_vocab_usage_circled_example_index.py`、`scripts/check_jp_vocab_annotation.py`、`scripts/check_jp_vocab_course_label.py` |
| 老师端列表、分页、表格样式 | `JpVocabPage.tsx`（编排）；`jp-vocab-page/JpVocabWordTable.tsx`、`JpVocabPagination.tsx`、`JpVocabPageStyles.tsx`；`lib/jp-vocab-page-*.ts`、`lib/vocab-page-shared.ts` |
| **每页条数选择**（10/20/50/100；localStorage 记住；刷新后沿用） | `JpVocabPagination.tsx`；`JpVocabPage.tsx` → `pageSize` / `handlePageSizeChange`；`jp-vocab-page-helpers.ts` → `readStoredJpVocabPageSize` / `writeStoredJpVocabPageSize`；`jp-vocab-page-constants.ts` → `JP_VOCAB_PAGE_SIZE_OPTIONS` |
| **搜索记住 + 最近记录**（当前关键词/类型筛选 localStorage 持久化，刷新仍在，点「清除」才空；点搜索框弹出最近最多 8 条，可单条删或清全部；**有关键词时防抖强制 `loadWords({ force: true })` 拉最新，不滤过期 SWR 缓存**） | `JpVocabPageSearch.tsx`；`useJpVocabSearchFreshLoad.ts`；`jp-vocab-page-helpers.ts` → `read/writeStoredJpVocabSearchQuery`、`pushJpVocabSearchHistory`；`jp-vocab-page-constants.ts` → `JP_VOCAB_SEARCH_*`；回归 `scripts/check_jp_vocab_search_persist.py` |
| **保存/同步橙色进度条**（D1 写入较慢；**改保存 UI 必引**） | `src/components/JpVocabSaveProgressBar.tsx`；`src/lib/jp-vocab-save-progress.ts` → `jpVocabSaveProgressLabel`；`.cursor/rules/save-progress-ui.mdc` |
| **课堂备注、共享备注**（支持粘贴/上传图片；**相同图片内容不可重复粘贴/加入**；抽问/带读卡片内点「保存」询问是否共享给学生，进度条：正在保存→正在共享；**study 页有 `canOperate` 时「查看」进可编辑备注**，学生仍只读） | `JpClassNotesEditModal.tsx`（`sharePromptOnSave`）；`jp-vocab-class-notes.ts` → `collectJpVocabClassNoteImageRefKeys`；`POST /api/jp-vocab/class-notes`、`/api/jp-vocab/class-notes/upload`（内容哈希去重）；`JpVocabStudyPage.tsx` → `openRemarksWord`；规则 `.cursor/rules/jp-vocab-study-notes-edit.mdc` |
| 手动添加 / 编辑词条 | `JpVocabManualAddModal.tsx`（备注可多图上传/粘贴，与修改备注同格式）、`JpVocabEditModal.tsx`（含**巧记**字段，仅管理员；**备注可多图上传/粘贴**，展示与 `JpClassNotesEditModal` 同：居中、去重）；`/api/jp-vocab/add`、`/edit`；`jp_vocab_word.mnemonic` |
| **明日优先抽查**（管理员操作列；点击后**次日**按点击顺序 1、2、3… 置顶；不清历史抽查统计；其后才是从未抽查 + **final_score**） | `JpVocabWordTable.tsx` → `onBoostQuizPriority`；`JpVocabPage.tsx` → `boostQuizPriority`；`POST /api/jp-vocab` `boost_quiz_priority`；`jp-vocab-quiz-priority-boost.ts`；`sortJpVocabWordsForDailyOrder`；规则 `.cursor/rules/jp-vocab-quiz-priority-boost.mdc`、`jp-vocab-quiz-time-weight.mdc` |
| **日语复习**（选数量、按序号/抽查优先级排序、卡片上/下一个、清除已复习；**点「下一个」乐观计入 + `jpVocabReviewSaveQueue` 后台串行写库**；**今日已在抽问页抽查的词条显示「已抽问」**；**复习卡与老师抽问卡同 UI**（例句/释义/备注/统计），**无熟悉程度勾选**；未点「展开所有内容」前只露汉字，隐藏读音假名/释义/例句；**备注始终可见**） | `JpVocabReviewPage.tsx`；`JpVocabAdminReviewFlashcardModal.tsx`；`jp-vocab-review-plan.ts`、`jp-vocab-review-session.ts` → `applyOptimisticJpVocabReviewNext`；`jpVocabReviewSaveQueue`；`jp-vocab-daily-check.ts` → `isJpVocabWordQuizzedToday`；`POST /api/jp-vocab/review`；`jp_vocab_review_done`；规则 `jp-vocab-flashcard-examples-parity.mdc` |
| 导航菜单文案 | `src/i18n/messages.ts` → `nav.langJp` / `langEn` / `langKo`（**仅管理员**顶栏一级组）；`nav.jpVocab`（老师端）、`nav.jpVocabAdmin`（管理员端）、`nav.jpVocabStudy`、`nav.jpVocabReview`、`nav.jpVocabCoach`（管理员下为二级；老师端为一级扁平） |
| 路径常量 | `src/lib/locale-path.ts` → `jpVocabPath()`、`jpVocabAdminPath()`、`jpVocabStudyPath()`、`jpVocabReviewPath()`、`jpVocabCoachPath()` |
| 权限定义 | `src/lib/rbac.ts` → `jp_vocab:teacher`（老师端）、`jp_vocab:admin`（管理员端）、`jp_vocab:study`（学生端）；默认：`jp_vocab` 角色含 teacher；`user` 角色仅 study；`admin` 全部；校验 `src/lib/jp-vocab-auth.ts`、`src/lib/etr-auth.ts` |
| 未登录访问 `/jp-vocab` | `JpVocabPage.tsx` → `TeacherReviewAuth` 全页登录；`GET /api/jp-vocab`、`/api/jp-vocab/sync` → `requireJpVocabRead` |
| 共享后刷新复习页 | `src/lib/jp-vocab-shared-notify.ts`（同浏览器多标签） |
| **微信小程序 · 日语复习** | `wechat-jp-vocab-review/`（独立目录；对接同上 API；见该目录 `README.md`） |

#### 症状 / 关键词速查（老师端 `/jp-vocab`）

| 用户描述或页面文案 | 优先打开 |
|--------------------|----------|
| 今日抽查进度、30/40、剩余 10 | `jp-vocab-daily-quiz-progress.ts`、`JpVocabDailyQuizProgressBar.tsx`（**管理员**看全天目标；**老师**看待抽查数，剩 10 就显示总分 10，完成后只显示「已完成」） |
| 共 X 条、从未抽查、本轮未勾选、今日抽查个/次 | `JpVocabPage.tsx` 工具栏：管理员端「共 X 条 / 从未抽查 / 今日抽查 / 本轮未勾选」；**老师端只显示「本轮未勾选」**（不要「今日抽查 X 个」，避免老师误以为今日目标/已抽数）；`unmarkedCount` 统计可见池未勾选 |
| 不在今日可见池不可勾选；还剩 N 个但点完成抽查无反应；从未抽查词抽不到 | `isJpVocabWordInTeacherVisiblePool` / `listJpVocabTeacherQuizPoolWords`；`finishTeacherQuiz`；规则 `jp-vocab-teacher-quiz-pool.mdc` |
| 管理员设抽查数量后老师列表不对 | `jp-vocab-db.ts` → `setJpVocabDailyQuizTarget`；`JpVocabPage.tsx` → `quizTarget` |
| 调高目标后老师勾选词条消失 | 老师列表只显示未勾选，管理员仍见全库 |
| 调高抽查数量后开始抽查仍从序号 1 起、已抽过的还出现在卡片 | `jp-vocab-teacher-quiz.ts` → `filterJpVocabTeacherQuizUncheckedWords`；`JpVocabPage.tsx` → `requestTeacherQuizSession`（队列仅未勾选） |
| 抽了 N 个但序号勾选只连到中间某号（如 62）、后面没勾 | 旧 bug：池按从未抽查插队；现应为正序 1…N。查 `visible_ids` 是否等于序号前 N；今日新词应在末尾且不进池，见 `jp-vocab-teacher-quiz-pool.mdc` |
| 今天刚「已完成」的新课词被马上抽到 / 插到序号最前 | 应次日凌晨才置顶；`created_at` 北京日 ≥ 今日则 `isJpVocabWordSameDayNewNeverQuizzed`；重排见 `sortJpVocabWordsForDailyOrder` |
| 下午老师看到 3/13（其实只剩 10 没抽） | `teacherPendingWords`：只计未勾选，不按 1 小时锁定 |
| 老师搜索 | `JpVocabPage.tsx` → `searchMatchedWords` 扫全库，`filteredDisplayedWords` 老师端再滤掉不可操作行；有关键词时 `useJpVocabSearchFreshLoad` 强制拉最新 |
| 刷新后搜索没了 / 最近搜索记录 / 搜到旧释义 | `JpVocabPageSearch.tsx` + `useJpVocabSearchFreshLoad` + `jp-vocab-page-helpers.ts` |
| 今日抽查次数列、北京时间 0 点归零 | `jp-vocab-daily-check.ts`；`jp-vocab-review.ts` |

---

## 英语单词 / 语法抽问（en-vocab）

对外入口优先用 **`https://english.info-quests.com/en-vocab`**（勿发 japanese / finance 给英文老师）。路径与下表一致；finance / japanese / english 共用同一 Worker 与 D1。表与 API **共用**；产品入口与 UX 用 `variant` 分开（与 jp-vocab 管理员/老师拆分对称）。

| 线上 path | 中文名 | 页面 | 主组件 | 说明 |
|-----------|--------|------|--------|------|
| `/en-vocab` | 英语抽背-老师端 | `src/app/en-vocab/page.tsx` | `EnVocabPage variant="teacher"` | **须登录**（全页 `TeacherReviewAuth`，不对普通网友开放）；**抽查卡片**、勾选熟悉程度（**勾选后 1h 内可改用法/总体**）、共享到今日单词；学生 peek 顶栏「该学生已查看该单词」、老师勾选同步顶栏「该单词已同步给学生查看」；本轮抽完弹「本轮单词已抽查完成」（勿无声关卡）；隐藏抽查排行/手动添加 |
| `/en-vocab/admin` | 英语抽背-管理员端 | `src/app/en-vocab/admin/page.tsx` | `EnVocabPage variant="admin"` | 全库、设今日抽查数量、导出 Excel、批量删除、重置（**今日/全部重置须同时清 `en_vocab_shared`**，否则仍显示「已共享」）；列表可直接改熟悉程度（不强制进抽查卡片）；熟悉程度锁=勾选后 **1h**（非按共享） |
| `/en-vocab/study` | 今日英语单词（**列表按 `shared_at` 倒序**：最近抽查/同步的在前，最早的在后） | `src/app/en-vocab/study/page.tsx` | `EnVocabStudyPageClient.tsx`（`ssr:false` 壳）→ `EnVocabStudyPage.tsx` | **管理员 / `en_vocab:study` 学生**（英语老师不可见）；点单词开详情卡；peek「查看老师正在抽查的单词」；老师端 peek→「该学生已查看该单词」、勾选同步→「该单词已同步给学生查看」 |
| `/en-vocab/review` | **英语复习**（选数量/排序、卡片复习、手动清除进度；卡面同抽问、无熟悉程度；未展开只露单词） | `src/app/en-vocab/review/page.tsx` | `EnVocabReviewPage.tsx` | 仅管理员；`GET/POST /api/en-vocab/review`；`en_vocab_review_done`（跨日不清零）；对齐日语 `/jp-vocab/review` |
| `/en-vocab/ref/[refKey]` | 英语教案（**手机长按 /「保存图片」进相册**，同日语） | `src/app/en-vocab/ref/[refKey]/page.tsx` | `EnVocabRefViewer` + `vocab-ref-save-image.ts`；下载名见「英语新课 → 教案下载文件名」；API：`src/app/api/en-vocab/*`，库：`en_vocab_*` |

RBAC：`en_vocab:teacher` → `/en-vocab`；`en_vocab:admin` → `/en-vocab/admin`；`en_vocab:manual_add` 老师角色默认排除。共享开关：`src/lib/en-vocab-share-ui.ts`（`EN_VOCAB_TEACHER_SHARE_ENABLED`）。规则：`.cursor/rules/en-vocab-admin-teacher-split.mdc`。

### en-vocab 子功能 → 文件速查

| 功能描述 | 改哪里 |
|----------|--------|
| **须登录才能看**（不对普通网友开放；对齐日语全页登录；`GET /api/en-vocab` + `/sync` 须 `requireEnVocabRead`） | `EnVocabPage` → `TeacherReviewAuth`；`en-vocab-auth.ts`；规则 `.cursor/rules/en-vocab-login-required.mdc`；回归 `scripts/check_en_vocab_login_required.py` |
| **本轮抽查完成弹窗**（文案「本轮单词已抽查完成」，不写数量；`finishTeacherQuiz` → `onTeacherQuizSessionFinished`；对齐日语） | `EnVocabDailyQuizCompleteModal`；`useEnVocabDailyCompleteEffects`；规则 `en-vocab-quiz-complete-modal.mdc`；回归 `check_en_vocab_quiz_complete_modal.py` |
| **学生已查看顶栏提示**（peek →「该学生已查看该单词」；老师勾选同步 →「该单词已同步给学生查看」；peek 优先；钉到点「下一个」；闩锁勿被 poll false 冲掉） | `EnVocabPage` `studentPeekedCurrentWord` + `sharedTodayWordIds`；`EnVocabFlashcardPageHeader` `__student-peek-banner`；规则 `en-vocab-student-peek-banner.mdc`；回归 `check_en_vocab_study_flashcard_parity.py` |
| **页面拆分**（`EnVocabPage` 编排；样式进 `en-vocab-page/EnVocabPageStyles.tsx`，对齐 `jp-vocab-page/`） | `src/components/en-vocab-page/`；规则 `en-vocab-page-split.mdc` |
| **熟悉程度 1h 可改**（勾选后满 1 小时才锁；用法一/二与总体均可改并重算；**禁止**按「已共享 / 学生 peek」立刻锁；与日语一致） | `isEnVocabWordReviewLocked` / `EN_VOCAB_REVIEW_LOCK_MS`（`en-vocab-review.ts`）；DB `review_locked`；`EnVocabPage` `reviewLockedByWordId`；规则 `.cursor/rules/en-vocab-level-lock-1h.mdc`；回归 `scripts/check_en_vocab_review_lock.py` |
| **管理员端 / 老师端拆分**（双入口 + `variant`；共享在老师端；导出/删除/重置/设今日抽查数量在管理员端） | `EnVocabPage.tsx`；路由 `en-vocab/page.tsx` + `en-vocab/admin/page.tsx`；`enVocabAdminPath`；`en_vocab:teacher` / `en_vocab:admin` |
| **管理员设今日抽查数量**（进度条内输入框 + 确认设置；`teacher_visible_limit`；池=`visible_ids` 或当日序号 1…N；默认 20；跨日回默认；老师端 sync 拉 limit） | `JpVocabDailyQuizProgressBar` `adminQuizTarget`；`EnVocabPage` → `setDailyQuizTarget`；`POST /api/en-vocab` `set_daily_quiz_target`；`setEnVocabDailyQuizTarget`；`en-vocab-teacher-visible.ts`；回归 `scripts/check_en_vocab_daily_quiz_target.py` |
| **抽查优先级 / 日序**（与日语同公式：`priority + days×0.1`；**从未抽查置顶**；今日新建沉底；表头从未抽查显示「—」；`order_algo=jp_priority_v1` 升级强制重算日序+可见池） | `sortEnVocabWordsForDailyOrder`；`enVocabFinalQuizScoreOrNull`；`ensureEnVocabDailyDisplayOrder`；规则 `.cursor/rules/en-vocab-daily-order-jp-priority.mdc`；回归 `scripts/check_en_vocab_daily_order_jp_priority.py` |
| **老师端「下一个」须等同步**（同步中有橙色进度条；再点「下一个」弹「正在同步给学生，请稍等」；同步完才能跳词；禁止静默点不动） | `EnVocabTeacherQuizFlashcardModal` `syncWaitHint`；`EnVocabFlashcardAlerts` |
| **1102：sync 对齐日语拆轮询**（词条增量 `sync?limit=0`；今日抽查数量走轻量 `/api/en-vocab/teacher-visible` 约 30s；热路径禁止 `seedIfEmpty`） | `useEnVocabPageSync`；`en-vocab/teacher-visible/route.ts`；回归 `scripts/check_en_vocab_sync_1102_poll.py` |
| **管理员重置清共享**（全部重置清全部 shared；今日重置清当日 shared + live；API 回 `shared_today_word_ids:[]`；客户端清空缓存锁；**并清老师端 sessionLevel / 抽查会话**，广播其它标签页，避免进度条仍显示已抽 N 个） | `clearEnVocabSharedOnReset` / `clearJpVocabSharedOnReset`；`EnVocabPage` / `JpVocabPage` → `runReset`；规则 `.cursor/rules/vocab-reset-clears-shared.mdc`；回归 `scripts/check_vocab_reset_clears_shared.py` |
| **老师端抽查卡片**（点「抽查」/「继续抽查」或点池内词条；**近全屏网页式弹层**非新路由；桌面左：单词/释义/操作，**备注在释义窗格下方**；**手机备注在抽查优先级统计块最下面**（长文区内滚动 +「查看全部」弹窗；图片小图可点放大），右：用法与例句；**中间滚**；**「上一个/下一个」按钮窗格钉底**；**勾齐用法写库/同步时导航上方钉橙色进度条**（`JpVocabSaveProgressBar`，勿乐观提前「已同步」）；窄卡片备份 `EnVocabTeacherQuizFlashcardModal.card-compact.tsx`；**模式固定随机**（禁止正序）；开始前可弹操作说明；池内熟悉程度**仅能在卡片内勾选**；**有编号用法时在每条用法旁勾熟悉程度，全部勾齐才写库并自动共享到学生「今日背英语单词」**（`aggregateEnVocabUsageLevels` / `last_usage_levels` / `shareToStudy`，对齐日语勾选即同步）；点「下一个」若用法未齐则提示「此单词的用法N还没有勾选」（如用法1、用法3；**不**滚动定位）；进行中隐藏列表；**中途退出/刷新回到离开时正在看的那一词**（`session.currentIndex`，勿跳第一个未勾选）；进度完成后弹「本轮单词已抽查完成」再关卡片并展示今日已抽列表；池=管理员设的 `quiz_target`（`visible_ids` 或日序 1…N，默认 20）；**顶栏：学生 peek→「该学生已查看该单词」；老师勾选同步→「该单词已同步给学生查看」（peek 优先；同步完成前不亮）**） | `EnVocabPage.tsx` → `startTeacherQuizWithRandomMode`、`hideTeacherQuizList`、`teacherQuizLocksTable`、`recordUsageLevels`、`syncTeacherQuizLiveWord`、`studentPeekedCurrentWord`；`useEnVocabReviewActions`；`EnVocabTeacherQuizIntroModal.tsx`；`EnVocabTeacherQuizFlashcardModal.tsx`（`en-vocab-flashcard-page`）；备份 `….card-compact.tsx`；`JpVocabTeacherQuizFlashcardStyles.tsx`；`en-vocab-teacher-quiz.ts`；`en-vocab-teacher-quiz-storage.ts`；`en-vocab-daily-quiz-progress.ts`；`POST/GET /api/en-vocab/teacher-quiz-live`；常量 `en-vocab-page-constants.ts`；规则 `en-vocab-flashcard-page-sheet.mdc`、`en-vocab-usage-level-aggregate.mdc`、`en-vocab-study-flashcard-parity.mdc`、`en-vocab-level-lock-1h.mdc`、`en-vocab-student-peek-banner.mdc`、`vocab-teacher-quiz-random-only.mdc`；回归 `scripts/check_en_vocab_flashcard_notes_footer.py`、`scripts/check_en_vocab_usage_level_aggregate.py`、`scripts/check_en_vocab_review_lock.py`、`scripts/check_en_vocab_study_flashcard_parity.py` |
| **今日英语单词详情卡 / peek**（点列表单词开卡；**老师勾齐用法/熟悉程度后自动共享并弹卡**；「查看老师正在抽查的单词」写入 live peek → 老师端提示已查看；`mode="study"` 熟悉程度只展示不可改；卡内可见释义/用法例句/备注/统计） | `EnVocabStudyPage.tsx` → `openStudyFlashcard`、`peekTeacherQuizWord`、`pendingFlashcardWordIdRef`；`EnVocabTeacherQuizFlashcardModal` `mode="study"`；`POST /api/en-vocab`（`shareToStudy`）+ `POST /api/en-vocab/teacher-quiz-live`；规则 `.cursor/rules/en-vocab-study-flashcard-parity.mdc`、`en-vocab-usage-level-aggregate.mdc`；回归 `python3 scripts/check_en_vocab_study_flashcard_parity.py`、`check_en_vocab_usage_level_aggregate.py` |
| **英语复习**（选数量、按序号/抽查优先级排序、卡片上/下一个、清除已复习；**点「下一个」乐观计入 + `enVocabReviewSaveQueue` 后台串行写库**；**今日已在抽问页抽查的词条显示「已抽问」**；**复习卡与老师抽问卡同 UI**（用法例句/释义/备注/统计），**无熟悉程度勾选**；未点「展开所有内容」前只露单词，隐藏音标/释义/例句；**备注始终可见**） | `EnVocabReviewPage.tsx`；`EnVocabAdminReviewFlashcardModal.tsx`；`EnVocabFlashcardWordHero.tsx`；`en-vocab-review-plan.ts`、`en-vocab-review-session.ts`；`enVocabReviewSaveQueue`；`en-vocab-daily-check.ts` → `isEnVocabWordQuizzedToday`；`POST /api/en-vocab/review`；`en_vocab_review_done`；导航 `nav.enVocabReview` → `/en-vocab/review`（仅管理员） |
| **管理员预览老师抽问卡**（操作列「查看抽问卡片」；`previewMode` 只读，UI 与老师端一致含按用法勾选展示） | `EnVocabPage.tsx` → `quizCardPreviewWordId` / `quizCardPreviewSession`；`EnVocabTeacherQuizFlashcardModal` `previewMode` |
| **隐藏抽查排行 / 手动添加**（功能保留；老师无 `en_vocab:manual_add`；`SHOW_RISK_CHART=false`） | `EnVocabPage.tsx`；`en-vocab-page-constants.ts`；RBAC `RBAC_EN_TEACHER_EXCLUDED_PERMISSIONS` |
| **老师导航极简**（只「英语抽背-老师端」；不挂今日单词 / 新课 / 关于） | `useSiteNavItems.ts` → `enTeacherNav`；`canAccessEnVocabStudy` 拦老师；`requireEnLessonOperate` 须 `en_lesson:operate`；规则 `.cursor/rules/en-vocab-teacher-nav-minimal.mdc` |
| **词表「用法 / 例句」合并查看**（单列「查看 (N)」弹窗；**禁止**拆成两列或行内展开；卡片同配对展示：`1.用法`→说明→**出现频次小进度条**→例句→译文，阿拉伯数字；**卡片标题旁「复制全部」**一键复制用法+例句） | `EnVocabUsageExamplesCell.tsx` → `EnVocabUsageViewModal` + `EnVocabUsageExamplesPairedContent`；`EnVocabUsageExamplesCopyButton`（抽查卡）；配对 `en-vocab-usage-examples-display.ts`；频次 `en-vocab-usage-ai.ts`；列宽 `.jp-vocab-usage-ex-col`；规则 `.cursor/rules/en-vocab-examples-view-modal.mdc` |
| **桌面操作列可见**（`table-layout:fixed` + 操作列 sticky；**复习次数**用单列 2×2 `stats-grid` 对齐日语；「从未抽查」两行；禁止四列窄合计叠字） | `EnVocabPage.tsx` 表样式；对齐 `JpVocabPageStyles`；规则 `.cursor/rules/en-vocab-table-actions-visible.mdc` |
| **老师/管理员词表分页**（对齐日语：上下各一栏；**每页 10/20/50/100** 可选；localStorage 记住页码与条数；有数据即显示「每页」+ 范围，多页才出上一页/下一页） | `EnVocabPagination.tsx`；`EnVocabPage` → `pageSize` / `handlePageSizeChange`；`en-vocab-page-helpers` → `read/writeStoredEnVocabPage(Size)`；常量 `EN_VOCAB_PAGE_SIZE_OPTIONS`；规则 `.cursor/rules/en-vocab-pagination-parity.mdc`；回归 `scripts/check_en_vocab_pagination.py` |
| **管理员端表头全列可排序**（除勾选/操作；序号·类型·**分类**·**上传类型**·单词·音标·释义·词性·用法条数·巧记·优先级·熟悉程度·复习次数·今日次数·更新时间·备注；点表头升/降） | `EnVocabWordTable` `EnVocabThSortButton`；`en-vocab-shared.ts` → `EnVocabStatSortKey` + `sortEnVocabWordsByStat`；`EnVocabPage` `toggleStatSort`；回归 `scripts/check_en_vocab_admin_all_columns_sortable.py` |
| **分类标签**（默认「雅思托福」；新课完成同步到词库；上传可传 `category` 或 IELTS/TOEFL 别名） | DB：`en_vocab_word.category` / `en_lesson.category`；`en-vocab-category.ts`；词表列 + 编辑弹窗；`POST /api/en-vocab/upload`、`POST /api/en-lesson/upload`；规则 `.cursor/rules/en-vocab-category.mdc`；回归 `scripts/check_en_vocab_category.py` |
| **上传类型**（`upload_source`：存量/新课同步→「由英语新课模块同步」；本地 API→「通过API接口上传」；手动添加→「手动添加」；重复词返回 `duplicate_words` / `message`） | DB：`en_vocab_word.upload_source`；`en-vocab-upload-source.ts`；词表「上传类型」列；`POST /api/en-vocab/local-upload`（STT 推荐，说明见 `docs/en-vocab-local-upload-api.txt`）、`POST /api/en-vocab/upload`；新课 `upsertEnVocabFromLesson`；规则 `.cursor/rules/en-vocab-upload-source.mdc`；回归 `scripts/check_en_vocab_upload_source.py` |
| **音标 / 释义+词性 / 用法 / 例句补全**（顺序：音标→释义→词性→**用法→例句**；用法每条带 **出现频次 [1]～[10]**，卡片/弹窗显示「出现频次 N」；`fill-usage` `list_missing` 含**空用法**与**有用法但缺分值**（只补 `[n]`）；线上 force 仍拒 `missing_frequency`；例句 `list_missing` **必须已有 usage**，一条用法造一句、用词尽量简单；可 `mode:"clear_all"` 清空例句后按用法重造；Mac 每分钟检测；**一键切换** `EN_VOCAB_FILL_LLM_BACKEND` 0=本地顺序跑阶段 / 1=线上付费 tokken 一次补齐（`en_vocab_llm_backend.py`）；**list_missing 按当日序号优先**（今日池更先补）；**维护中心与 launchd 只保留 1 个英语补全定时任务**：`com.infoquests.en-vocab-fill` → `scripts/en-vocab-fill-nightly.sh`；右下角「来源」角标；**线上展示按序号把用法与例句配对**，定时任务本身不改） | API：`POST /api/en-vocab/fill-reading`、`fill-meaning`、`fill-usage`、`fill-example-sentences`（含 `clear_all`）；`src/lib/en-vocab-fill-*.ts`、`en-vocab-fill-daily-priority.ts`、`en-vocab-meaning-ai.ts`、`en-vocab-example-sentences-ai.ts`、`en-vocab-usage-ai.ts`（频次）、`en-vocab-usage-examples-display.ts`；脚本：`scripts/en-vocab-fill-*-api.py`、`en-vocab-clear-example-sentences.py`、`en-vocab-fill-stage.sh`、`en-vocab-fill-nightly.sh`、`setup-en-vocab-fill-mac.sh`；规则 `.cursor/rules/en-vocab-fill.mdc`；UI：`EnVocabPage` + `EnVocabUsageExamplesCell` + `EnVocabUsageViewModal` + `EnVocabTeacherQuizFlashcardModal` / `EnVocabUsageExamplesPairedContent` + `JpVocabSourceLabel`；回归 `scripts/check_en_vocab_fill_daily_priority.py`、`check_en_vocab_usage_frequency.py` |
| **巧记 / 用法 / 例句字段**（管理员端表列合并「用法 / 例句」查看弹窗；**编辑弹窗仍分填**巧记、用法、例句；巧记仅管理员；用法多行可贴图居中；备注同可贴图；例句英文行+「译文：」；人手改记为「手动」） | DB：`en_vocab_word.mnemonic` / `usage` / `usage_source` / `example_sentences` / `example_sentences_source`；`EnVocabEditModal` + `EnVocabImageNotesField` + `EnVocabClassNoteContent`；上传 `POST /api/en-vocab/class-notes/upload`；行内删除（管理员）`deleteWord` → `/api/en-vocab/delete` |

---

## 韩语发音勾选 + 抽问（ko-pron）

总库勾选与抽问池拆分；finance 同 Worker / 同 D1。对外入口优先用 **`https://korean.info-quests.com/ko-pron`**（勿发 japanese / english / finance 给韩语老师）。路径与下表一致。

| 线上 path | 中文名 | 页面入口 | 主组件 | 相关 API | 数据 / 逻辑 | 权限 |
|-----------|--------|----------|--------|----------|-------------|------|
| `/ko-pron/select` | **韩语发音勾选**（全量约 40 字母；**批量加入抽问 / 批量加入复习**；**导出随机抽问卡片**；字母旁可复制） | `src/app/ko-pron/select/page.tsx` | `KoPronSelectPage` | `GET/POST /api/ko-pron/select`（`select` / `select_review` + `catalog_ids`） | `ko_pron_catalog`：`selected_at`→抽问；`review_selected_at`→复习（两池独立） | `admin` 或 `ko_pron:admin` |
| `/ko-pron/review` | **韩语发音复习**（开始复习→**乱序**猜字母读音→显示读音听发音+看罗马音） | `src/app/ko-pron/review/page.tsx` | `KoPronReviewPage` + `KoPronReviewFlashcardModal` | `GET/POST /api/ko-pron/review`（`review_next` / `clear`） | 复习池=catalog.`review_selected_at`；进度 `ko_pron_review_done`（跨日，手动清） | `admin` 或 `ko_pron:admin` |
| `/ko-pron` | **韩语发音抽问-老师端**（抽查卡片、勾选熟悉程度） | `src/app/ko-pron/page.tsx` | `KoPronPage variant="teacher"` | `GET/POST /api/ko-pron`、`GET /api/ko-pron/sync`、`POST /api/ko-pron/live` | 抽问池 `ko_pron_letter`（仅已勾选）；`src/lib/ko-pron-db.ts` | 须登录；`ko_pron:read` 浏览；`ko_pron:operate` / `ko_pron:teacher` 勾选；管理员进此 URL redirect 到 `/ko-pron/admin` |
| `/ko-pron/admin` | **韩语发音抽问-管理员端**（抽问池、设今日抽查数量、预览卡片） | `src/app/ko-pron/admin/page.tsx` | `KoPronPage variant="admin"` | 同上（设目标须 admin） | 与老师端共用抽问表；**空池时提示去勾选页** | `admin` 或 `ko_pron:admin`；非管理员 redirect 到 `/ko-pron` |
| `/ko-pron/study` | **今日韩语发音（学生端）** | `src/app/ko-pron/study/page.tsx` | `KoPronStudyPage.tsx` | `GET /api/ko-pron/live` | live：`teacher_quiz_live`（`letter_id` + `reading_revealed`） | 须登录 + `ko_pron:study`（**默认不给**网上注册用户 / 日语·英语老师）；`admin` 可进；未登录 → 登录页 |

### ko-pron 子功能 → 文件速查

| 功能描述 | 改哪里 |
|----------|--------|
| **谁能看见韩语模块**（日语老师导航不含韩语；普通网友默认无 `ko_pron:*`；未登录进 URL 只出登录页） | `nav:jp_teacher` 分支；`RBAC_JP_TEACHER_EXCLUDED_PERMISSIONS` 含全部 `ko_pron:*`；`user` 默认权限**不含** `ko_pron:study`；`revokeDefaultKoPronStudyFromPublicRoles` |
| **勾选总库 → 抽问池 / 复习池**（**批量**：多选 +「批量加入抽问」或「批量加入复习」；两池独立；禁止再往 `ko_pron_letter` seed 全量 40；抽问入库写 `selected_at`+letter；复习只写 `review_selected_at`；同日抽问勾选次日进老师可见池；字母旁「复制」+ toast） | `KoPronSelectPage`；`selectKoPronCatalogBatchIntoQuiz` / `selectKoPronCatalogBatchIntoReview`；`POST …/select`；规则 `.cursor/rules/ko-pron-select-quiz-split.mdc` |
| **导出随机抽问卡片**（勾选页按钮；**只导出已入抽问** `selected_at`，不必再勾选；**乱序**仅韩语字母、**不含罗马音**；每格左上角按本次导出顺序标 **1、2、3…**；Canvas PNG 本机下载；给不敢点链接的老师线下抽问） | `KoPronSelectPage` → `exportRandomQuizCard`；`ko-pron-quiz-card-export.ts` → `exportKoPronRandomQuizCard` |
| **韩语发音复习**（重新开始 / 继续断点；熟悉/不熟悉；**乐观更新 + `koPronReviewSaveQueue` 串行写库**；列表：熟悉/不熟悉/总复习/今日次数；**表头点击排序**（除操作外；本页无操作列则全列可排）；乱序；防剧透） | `KoPronReviewPage`；`koPronReviewSaveQueue`；`applyOptimisticKoPronReviewFamiliarity`；规则 `.cursor/rules/ko-pron-review-no-spoiler.mdc` |
| **老师/管理员入口拆分**（导航「韩语发音抽问-老师端 / 管理员端」+「韩语发音勾选」+「韩语发音复习」；`variant` 区分抽问） | `/ko-pron` vs `/ko-pron/admin` vs `/ko-pron/select` vs `/ko-pron/review`；`locale-path.ts` → `koPronPath()` / `koPronAdminPath()` / `koPronSelectPath()` / `koPronReviewPath()`；`messages.ts` → `nav.koPron*`；规则 `.cursor/rules/ko-pron-admin-teacher-split.mdc` |
| **RBAC 角色「韩语老师」**（管理员仍全能，不新建管理员角色） | `etr-auth.ts` → `EtrUserRole` 含 `ko_pron`；`rbac.ts` → `ko_pron:*`、`nav:ko_teacher`、`RBAC_KO_TEACHER_EXCLUDED_PERMISSIONS`；用户管理可选「韩语老师」 |
| **学生端 live 卡片**（老师开卡同步字母；**学生端隐藏**发音按钮、罗马音、熟悉程度；仅露字母；**复制+编辑在卡片右上角**） | `KoPronStudyPage`；`POST/GET /api/ko-pron/live`；`ko-pron-teacher-quiz-live.ts`；老师端仅 **随机** 模式 |
| 老师抽查卡片、熟悉程度、进度条 | `KoPronTeacherQuizFlashcardModal`（**暗色**；老师端**始终显示罗马音**+发音；熟悉程度勾选框；未勾选不能「下一个」；**1h 内可改选**；**编辑**字母/罗马音/说明/分类）；`KoPronEditModal`；`ko-pron-teacher-quiz.ts`；保存进度复用 `JpVocabSaveProgressBar` |
| 管理员设今日抽查数量 / 老师可见池 | `KoPronPage` + `JpVocabDailyQuizProgressBar`；`POST /api/ko-pron` `set_daily_quiz_target`；`setKoPronDailyQuizTarget`；池=**日序前 N**（与日语同一套熟悉程度加权优先级，非 id） |
| **抽查优先级 / 日序**（`priority + days×0.1`；从未抽查置顶；今日新建沉底；直接复用 `jpVocabFinalQuizScore`） | `ko-pron-daily-order.ts` → `sortKoPronLettersForDailyOrder`；`ensureKoPronDailyDisplayOrder`；可见池 `order_algo=priority_v1`；规则 `.cursor/rules/ko-pron-quiz-priority.mdc` |
| **发音按钮**（本机 Web Speech `ko-KR`；读「기역」等韩文名，不读罗马音；列表 / 老师抽问卡 / 勾选页；**学生端今日发音隐藏**） | `KoPronSpeakButton`；`ko-pron-speak.ts` → `speakKoPronLetter` / `koPronSpeakText` |
| **字母复制**（勾选 / 抽问列表 / 复习列表旁 compact；**抽问卡 / 学生卡 / 复习卡右上角** `variant=corner`；自带 toast） | `KoPronLetterCopyButton`；`copyTextToClipboard` + `CopyToast` |
| **分类筛选 + 搜索**（辅音 / 双辅音 / 基本元音 / 复合元音；对齐延世·首尔大·西江·TOPIK 教材用语，非严格语言学；字母归属不变：ㅑㅕㅛㅠ∈基本元音，ㅐㅔ∈复合元音；字母/读音/说明本地即时；**勾选页分类记住上次选择**） | `KoPronPage` / `KoPronSelectPage` 工具栏；`ko-pron-search.ts` → `filterKoPronLettersBySearch` + `read/writeStoredKoPronSelectCategoryFilter`；分类常量 `KO_PRON_CATEGORIES`（`ko-pron-seed.ts`）；文案迁移 `vowel_category_textbook_v2`（单元音/双元音→基本元音/复合元音） |
| **列表显示抽查优先级数值 + 复习次数**（与日语同公式；从未抽查显示「—」；次数列 非常/一般/不熟悉） | `KoPronPage` 表列；`koPronFinalQuizScoreOrNull` |
| **手机端列表卡片化**（老师/管理员抽问：表→卡片；字母大字+读音行；搜索/开始抽查全宽；抽问卡 safe-area） | `KoPronPage` 列 `data-label` + `ko-pron-*-col`；`mobile.css`「KO Pron」；规则 `.cursor/rules/ko-pron-mobile-list.mdc` |
| 种子 40 字母 | `ko-pron-seed.ts` → `KO_PRON_SEED_LETTERS`；**只种进** `ko_pron_catalog`（`seedCatalogIfEmpty`）；抽问表禁止全量 seed |
| **开课前 30 分钟启用韩语老师账号**（手动日程 `teacher` 姓名匹配 `ko_lesson_teacher`；与日语同一定时 `teacher-user-pre-class-enable`） | `KO_TEACHER_PRE_CLASS_AUTO_ENABLE_WITHIN_MS`；`listKoTeacherIdsWithUpcomingClassStart`；`etr_user_ko_lesson_teacher_link`；人员管理 `?subject=ko` →「创建用户」；规则 `.cursor/rules/ko-pron-teacher-account-lifecycle.mdc` |
| **抽完最后一个字母后 20 分钟禁用**（记操作人到 `ko_pron_teacher_quiz_day`；与日语同一定时 `teacher-user-quiz-complete-disable`） | `ko-pron-teacher-quiz-day.ts`；`POST /api/ko-pron` 勾选后 `trackKoPronTeacherQuizDayAfterReview`；临近韩语课 30min 窗口跳过禁用 |

---

## 日语新课（jp-lesson）

**多科目老师**打开「查看」教案链接勿被踢到韩语：`SubjectTeacherRouteGuard` 路径并集；规则 `subject-teacher-route-guard.mdc`。

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/jp-lesson` | 日语新课 | `src/app/jp-lesson/page.tsx` | `JpLessonPage.tsx` + `jp-lesson-page/`（Styles / StatusTable / helpers） |
| `/jp-lesson/notes` | 课堂笔记（按知识点；**支持粘贴/上传图片**；已完成新课保存后同步到日语抽问 `class_notes`，文字+图片） | `src/app/jp-lesson/notes/page.tsx` | `JpLessonNotesPage.tsx` |
| `/jp-lesson/schedule` | **日程管理（顶栏一级模块）**（统一日语 + 英语新课 + 手动日程；**不挂在「日语」二级下**） | `src/app/jp-lesson/schedule/page.tsx` | `JpLessonSchedulePage.tsx` + `jp-lesson-schedule-page/` |
| `/admin/jp-lesson-teachers` | **人员管理 / 上课老师管理（顶栏一级模块）**（默认日语；`?subject=en` 英语；`?subject=ko` 韩语可建登录账号；**搜索跨日语+英语+韩语模糊匹配**；**不挂在「日语」二级下**） | `src/app/admin/jp-lesson-teachers/page.tsx` | `AdminJpLessonTeachersPage.tsx`；搜索 `lesson-teacher-search.ts` |

日程详情右侧「老师」名称可点击，跳转 `/admin/jp-lesson-teachers?teacher={id}`（英语课加 `&subject=en`）并自动滚动定位。路径常量：`adminJpLessonTeachersPath()`、`jpLessonSchedulePath()` in `locale-path.ts`。导航：`nav.jpLessonSchedule`＝「日程管理」、`nav.adminJpLessonTeachers`＝「人员管理」→ **管理员顶栏一级**（`NAV_TOP_LEVEL_CROSS_SUBJECT_IDS`，不进「日语」二级）。

逻辑：`src/lib/jp-lesson-db.ts`；API：`src/app/api/jp-lesson/*`；手动日程表 `jp_lesson_manual_schedule`（英语课事件来自 `en_lesson` + `en_lesson_class_schedule`，日程页合并展示）

| 功能描述 | 改哪里 |
|----------|--------|
| **API 上传新课**（`content` + 可选 `meanings` / **`annotations`** / **`example_sentences`** / 可选 **`course_label`**（教材课次）；标注与 content 用 `\|` 对齐：口语常用 / 考试常用 / 口语考试都常用；`|||` 分隔各词例句；单项「日语 + 译文：」，每词最多 10 条；已完成：**语法类**同步释义到 `/jp-vocab`，**单词类不同步释义**（`fill-meaning` tokken 补）；例句与标注、`course_label` 有则写入、已有不覆盖） | `POST /api/jp-lesson/upload`；`jp-lesson-db.ts` → `createJpLesson`、`syncLessonToVocab`；`jp-vocab-annotation.ts`；规则 `.cursor/rules/jp-vocab-annotation.mdc`、`jp-vocab-course-label.mdc`；回归 `scripts/check_jp_vocab_annotation.py`、`check_jp_vocab_course_label.py` |
| **API 合传同一课单词+语法**（一次请求 → 列表仍 **两条**：word / grammar；共享 `course_label`（如「标日初级上册第23课」）+ `course_group_id`；「教材」列展示；推荐 `word_file`+`grammar_file`；各自标已完成分别进抽问，**教材课次写入词条并在卡片偏后展示**） | `POST /api/jp-lesson/upload-mixed`；`createJpLessonMixed`；`syncLessonToVocab` → `course_label`；`JpVocabCourseLabelSection`；说明 `docs/jp-lesson-upload-mixed-api.txt`；回归 `scripts/check_jp_lesson_upload_mixed.py`、`check_jp_vocab_course_label.py` |
| **同一课行内复制：仅本行 / 合并整课**（两行各自显示教材名，**不合并格子**；点「复制」先问仅单词或仅语法，还是合并整课；合并=单词→语法切段 PDF → `course-{groupId}` 查看链接；须两侧教案图） | `JpLessonCopyMenu`（`coursePair`）；`buildJpLessonCoursePairMap`；`useJpLessonCourseMergeCopy`；`POST /api/jp-lesson/course-merge-ref`；`jp-lesson-course-merge-pdf.ts`；说明 `docs/jp-lesson-course-merge-ref-api.txt`；规则 `.cursor/rules/jp-lesson-course-merge-copy.mdc`；回归 `scripts/check_jp_lesson_course_merge_copy.py` |
| **教案下载文件名**（原图 / 分页 PDF / Word：`{id}、单词学习|语法学习 (词1, 词2, …)`；新课列表下载与「查看」页一致） | `jp-vocab-ref-shared.ts` → `jpLessonRefDownloadFilename`；`JpLessonPage.tsx`；`JpVocabRefViewer` + `jp-vocab/ref/[refKey]/page.tsx`；`GET /api/jp-vocab/ref/[refKey]?download=1`；`getJpLessonByRefKey` |
| **复制分页 PDF**（一步：剪贴板优先 → 系统分享 → 下载兜底；下载菜单 + 复制菜单） | `jp-vocab-ref-pdf-export.ts` → `buildJpVocabRefPaginatedPdf` / `copyJpVocabRefPaginatedPdf`；`JpVocabRefDownloadMenu`；`JpLessonCopyMenu` |
| **语法分页切段**（左侧序号方块 + 平均色条密度≥0.25，避免例文漫画蓝衣服误切；如 lesson-68） | `jp-vocab-ref-pdf-export.ts` → `detectGrammarSectionPeaks`；规则 `.cursor/rules/vocab-ref-pdf-section-crop.mdc`；`scripts/check_vocab_ref_pdf_grammar_badge_density.py` |
| **随手画**（图片教案批注：画笔 / **涂抹**（拖拽框选后深色盖住 + 块上标注「此内容由AI生成，经核验不准确，已涂抹」）/ 直线 / 文字 / 缩放；可下载或「保存为最新教案」覆盖本条；**仅保存成功后**「查看」页按 `updated_at` 静默换图，未保存不刷新、不整页跳动） | `JpLessonAnnotateModal.tsx`（英语 `EnLessonAnnotateModal.tsx`）；**日语列表操作列已去掉「查看」**，直接点「随手画」；**imageUrl 必须用** `jpVocabRefApiPath` / `enVocabRefApiPath`（勿传 `refViewUrl` 查看页 HTML）；保存 `POST /api/jp-lesson/ref/replace` → `notifyVocabRefUpdated`；查看页仍可由复制链接打开（`JpVocabRefViewer` + `useVocabRefLiveVersion`）；规则 `.cursor/rules/lesson-annotate-image-url.mdc`、`.cursor/rules/vocab-ref-view-live-refresh.mdc`；回归 `scripts/check_lesson_annotate_image_url.py`、`scripts/check_vocab_ref_live_refresh.py` |
| 设置上课老师弹窗、按上课频次排序 | `JpLessonTeacherEditModal.tsx`；`jp-lesson-teacher-db.ts` → `getJpLessonTeacherLessonCounts()`；`jp-lesson-teacher-rate.ts` → `sortJpLessonTeachersByLessonCount()` |
| **按老师默认课时长**（设置上课时间 / 批量 / 手动日程：李老师 **30**、秦·琴老师 **45**、玉·星老师 **60**；已选老师时新预约自动带出；预约弹窗显示老师名） | `jp-lesson-teacher-default-duration.ts`；`JpLessonNextClassEditModal` / `JpLessonBatchScheduleTeacherModal` / `JpLessonManualScheduleModal`；规则 `.cursor/rules/jp-lesson-teacher-default-duration.mdc`；回归 `scripts/check_jp_lesson_teacher_default_duration.py` |
| **未完成按 ID 升序**（小 ID=先上传的基础课优先；手机/PC；不可改按时间/最近） | `JpLessonPage.tsx` → `displayGroupsByStatus.pending`；`jp-lesson-shared.ts` → `buildJpLessonDisplayGroupsById`；规则 `.cursor/rules/jp-lesson-pending-id-sort.mdc` |
| **状态 Tab**（学习中/未完成/已完成；日语另有**上课中**=开课前/后各 10 分钟窗口含当前北京时间，**不限老师**；**手机+桌面**点选只显示当前一类；刷新后保持，勿回到学习中；搜索时跨状态展示） | `lesson-mobile-status-filter.ts`（日语 `readStoredJpLessonListFilter` 含 `in_class`）；`JpLessonPage.tsx` / `jp-lesson-page/JpLessonPageSections.tsx`；`isJpLessonCurrentlyInClass` + `JP_LESSON_IN_CLASS_MARK_WINDOW_MINUTES`（复用 `buildJpLessonScheduleEvents` 取开课时刻）；规则 `.cursor/rules/jp-lesson-mobile-status-tab.mdc`；回归 `scripts/check_jp_lesson_in_class_tab.py` |
| **查单词 / 语法**（学习内容、释义、例句模糊搜索；本地即时；搜索时手机端跨状态展示匹配） | `JpLessonPage.tsx` → `searchQuery`；`jp-lesson-search.ts` → `filterJpLessonsBySearch` |
| **手机端学习内容完整展示**（每行 5 词换行；禁单行省略；页根须 `jp-lesson-page--ja` / `--en`） | `JpLessonPage.tsx` / `EnLessonPage.tsx` mobile chips；`mobile.css` → `jp-lesson-mobile-content-chips`；规则 `.cursor/rules/jp-lesson-mobile-content-layout.mdc` |
| **手机端改老师/时间后滚动错位**（按上课时间重排后视口停在别的 ID） | 保存成功后 `scrollLessonListItemIntoView`；`lesson-list-scroll.ts`；规则 `.cursor/rules/lesson-edit-scroll-stable.mdc` |
| **桌面端表头冻结**（Excel 式；区内下滑时「老师 / 时间」等列名固定） | `JpLessonPage.tsx` / `EnLessonPage.tsx` → `.jp-lesson-table-wrap` `max-height` + `thead th` sticky；规则 `.cursor/rules/lesson-table-actions-visible.mdc` |
| **学习中 + 开课 18h 内 → 立即启用老师账号**（设老师 / 上课时间 / 状态为「学习中」后；与每日 05:00、开课前 2h 定时互补；`admin` / `user1` / `test` 不自动启） | `teacher-user-schedule-enable.ts` → `maybeEnableTeacherUsersForLearningLesson`；`POST /api/jp-lesson`（`set_teacher` / `set_class_schedules` / `set_next_class_at` / `progress_status`）；规则 `.cursor/rules/teacher-lesson-learning-auto-enable.mdc` |
| **课堂笔记图片**（粘贴/上传；格式与抽问备注相同；已完成新课保存后同步到词条 `class_notes`） | `JpLessonNotesPage.tsx`；`POST /api/jp-vocab/class-notes/upload`（`jp_vocab` 或 `jp_lesson:operate`）；`jp-vocab-class-notes.ts`；规则 `.cursor/rules/jp-vocab-notes-hide-image-url.mdc` |
| 统一日程（日语/英语/手动；**「学习中」+「已完成」进日程**，未上课不同步；上完不消失；**同老师同时间单词+语法网页合成一条**；**历史总计含日语/英语/韩语**——手动日程按标题归类） | `JpLessonSchedulePage.tsx` → `buildLessonEventDedupKey` / `historicalDurationTotals` + `detectScheduleTeacherSubjectFromTitle`；`jp-lesson-shared.ts` / `en-lesson-shared.ts` → `build*LessonScheduleEvents` / `*LessonProgressAppearsOnSchedule`；`jp-lesson-manual-schedule.ts` → `LessonScheduleSubject` |
| **Telegram 自然语言日程**（父项目 bot；**录入**例句「今天下午4点韩语课…老师机构老师」；**查询**「请给我最近一段时间的日程表 / 今天的日程」；缺老师按科目新建，不建登录账号；Bearer=`JP_REVIEW_UPLOAD_TOKEN`） | 父：`lib/bots/schedule_chat_command.py` + `telegram_bot.py` intent `schedule_chat` / `schedule_query`；Cloud：`POST /api/admin/schedule-chat-ingest`、`GET /api/admin/schedule-events`；鉴权 `admin-or-upload-auth` / `verifyUploadAuth` |
| **上课时间：半小时网格 + 自定义时分**（如 `23:10`；**不要秒**；保存/回显/比对禁止半点吸附） | `JpLessonHalfHourTimeGridPicker` / `EnLessonHalfHourTimeGridPicker`；`normalizeNextClassTimeHm`；`nextClassAtFromDatetimeLocalValue` / `splitNextClassAtLocalValue` / `normalizeClassAtForCompare`；规则 `.cursor/rules/lesson-custom-schedule-time.mdc`；回归 `python3 scripts/check_lesson_custom_schedule_time.py` |
| **手动日程「新增老师」按标题科目**（标题含「韩语/韩国语」→ 人员管理韩语老师；「英语」→ 英语；「日语」→ 日语） | `detectScheduleTeacherSubjectFromTitle`；`JpLessonManualScheduleModal` + `JpLessonSchedulePage` `onAddKoTeacher`；规则 `manual-schedule-teacher-subject.mdc`；回归 `scripts/check_manual_schedule_teacher_subject.py` |
| **手动日程关联教材**（新增/编辑可选 0～2 本；**弹窗选**：教材名/上传日/单词；选定后标新课**学习中**并写入本页时间+老师；标题「日语」默认日语新课，「英语」英语新课；详情「教材」进教案查看页 `/jp-vocab/ref/…` 或 `/en-vocab/ref/…`，勿链笔记页） | `linked_lessons`；`JpLessonManualScheduleLessonPickModal`；`syncManualScheduleLinkedLessonToLearning`；`jp-lesson-manual-schedule-linked.ts`；`JpLessonManualScheduleLessonPicker`；`JpLessonSchedulePage` → `selectedManualLinkedLessons`；规则 `manual-schedule-linked-lessons.mdc`；回归 `scripts/check_manual_schedule_linked_lessons.py` |
| **手动日程标题四选**（韩语 / 日语 / 英语 / 闲鱼英语抽查 + 自填；选「英语」默认时长 **25**；选「闲鱼英语抽查」填老师 + **30**） | `JpLessonManualScheduleModal.tsx` → `MANUAL_SCHEDULE_TITLE_PRESETS` / `selectTitlePreset`；规则 `en-lesson-default-duration.mdc` |
| **日程同步到网易日历（CalDAV → iPhone）** | Mac launchd **每 10 分钟** + `schedule-caldav.kick` 立刻推：`schedule-caldav-sync.sh` / `schedule-caldav-kick.sh`；**未改事件跳过**（勿每次全量删写）；失败 **Bark**（含 Worker 1027）；Telegram 录入成功自动 kick；API `listScheduleCalDavEvents` → **同堂合并**；配置 `~/.config/info-quests/schedule-caldav.env`；安装 `bash scripts/setup-schedule-caldav-mac.sh`；规则 `schedule-caldav-iphone-sync.mdc`；回归 `scripts/check_schedule_caldav_iphone_sync.py` |
| **日程订阅到 iPhone / Mac 系统日历（ICS，可选）** | `GET /api/admin/schedule.ics?token=`（同 `JP_REVIEW_UPLOAD_TOKEN`）；与 CalDAV 同一套合并事件；开课前 10 分钟 `VALARM`；`buildScheduleIcs()`；订阅 URL：`~/.config/info-quests/schedule-ics-subscribe-url.txt` |
| **开课前 Bark 推送（线上 Cron）**（Worker 每分钟；Mac 关机也能推；北京时间触发；10/5/1 持续铃响；通知泰国时间；本机 launchd 默认关） | `cloudflare-worker.ts` + `POST /api/admin/schedule-class-bark-remind`；`src/lib/schedule-class-bark-remind.ts`；Secret `BARK_DEVICE_KEY`；规则 `.cursor/rules/bark-deploy-failure-notify.mdc` |
| **部署成功/失败通知**（本机维护中心：成功 **Mac 优先**，已弹桌面则不推 Bark；失败 Bark + Mac 双推；成功有提示音；**标题=成功/失败**；正文：项目 → 状态 → 改动 → 文件） | `scripts/maintenance_center/bark_notify.py`、`mac_notify.py`；`hub._finish`；密钥 `~/.config/bark/env`；跨项目说明 `docs/bark-cross-project-howto.txt`；开关见 `.env.deploy.local.example`；规则同上 |
| 英语老师管理 / 评价（合并）；**可建登录账号**（`en_vocab`；开课前 30min / 抽完 +1h）；**闲鱼英语抽查**自动建老师并绑 user 48 | `AdminJpLessonTeachersPage.tsx`；`?subject=en`；`/admin/en-lesson-teachers` 重定向至此；`POST /api/admin/en-lesson-teachers` `create_user`；`ensureXianyuEnQuizTeacherBound`；规则 `en-vocab-teacher-account-lifecycle.mdc` |
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
| **单词类允许多词标已完成**（如「Present Perfect」：不必改语法类；点「已完成」即 sync 进 `/en-vocab` 作单词；**禁止**再拦 `word_kind_has_multi_word_items`） | `updateEnLessonProgress` → `syncLessonToVocab`；规则 `.cursor/rules/en-lesson-word-kind-no-multiword.mdc`；回归 `scripts/check_en_lesson_word_kind_no_multiword.py` |
| **默认课时长 25 分钟**（设置上课时间时预选；日程未填时长也按 25；**统一日程「手动添加」标题选「英语」亦预填 25**；勿用日语默认 55） | `en-lesson-shared.ts` → `DEFAULT_EN_LESSON_CLASS_DURATION_MINUTES` / `resolveEnClassDurationMinutes`；`EnLessonNextClassEditModal.tsx`；`JpLessonManualScheduleModal`；`resolveManualScheduleDurationMinutes`；规则 `en-lesson-default-duration.mdc` |
| **分类标签**（默认「雅思托福」；上传传 `category`；标已完成时同步到 `en_vocab_word.category`） | `en_lesson.category`；`POST /api/en-lesson/upload`；`createEnLesson` / `syncLessonToVocab`；列表「分类」列；`en-vocab-category.ts`；回归 `scripts/check_en_vocab_category.py` |
| **手机端卡片布局**（与日语新课同套：状态 Tab（手机+桌面）、内容 chips、底部编辑/老师/时间；根节点 `jp-lesson-page--en`） | `EnLessonPage.tsx`；`mobile.css`（`--ja` / `--en`）；`EN_LESSON_MOBILE_STATUS_FILTER_KEY`；规则 `jp-lesson-mobile-content-layout.mdc`、`jp-lesson-mobile-status-tab.mdc` |
| **教案下载文件名**（英文：`{id}. Word Learn|Grammar Learn (word1, word2, …)`，空格保留；列表与「查看」页一致；供菲律宾等英语老师识别） | `en-vocab-ref-shared.ts` → `enLessonRefDownloadFilename`；`EnLessonPage.tsx`；`EnVocabRefViewer` + `en-vocab/ref/[refKey]/page.tsx`；`GET /api/en-vocab/ref/[refKey]?download=1`；`getEnLessonByRefKey` |
| **教案下载格式**（**保存图片**：全员可用，iPhone 分享「存储图像」；整图 PDF；分页 PDF / Word；管理员另可下原图附件） | `EnVocabRefDownloadMenu.tsx`；`vocab-ref-save-image.ts`；`en-vocab-ref-pdf-export.ts` → `exportEnVocabRefFullImagePdf` / `exportEnVocabRefPaginatedPdf`；规则 `vocab-ref-save-image.mdc` |
| **随手画 / 涂抹**（与日语同款；`EnLessonAnnotateModal`；imageUrl 用 `enVocabRefApiPath`；保存后 `EnVocabRefViewer` 同套 live 换图） | 见日语新课「随手画」；规则 `lesson-annotate-image-url.mdc`、`vocab-ref-view-live-refresh.mdc` |
| **复制菜单**（带模板 / 仅链接 / **仅文字**：`发给{上课老师名}老师，谢谢～`；多名各加「老师」；无链接；教材 PDF 另行下载发送；**三种模式成功后复制次数均 +1**） | `EnLessonCopyMenu.tsx` → `buildEnLessonTextOnlyCopy`；`EnLessonPage.tsx` → `record_link_copy`；`incrementEnLessonLinkCopyCount`；规则 `.cursor/rules/en-lesson-copy-count.mdc` |

---

## 其他常用页面

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/`、`/zh` | 策略对比 | `src/app/page.tsx`、`zh/page.tsx` | `ComparePage.tsx` |
| `/english-teacher-review` | 英语老师评价（**已重定向**至上课老师管理） | `english-teacher-review/page.tsx` | |
| `/jp-review` | 日语口语复习 | `jp-review/page.tsx` | |
| `/about` | 关于与反馈（**仅管理员**；导航 / 页面 / `about:view`；非管理员不可见） | `about/page.tsx` | `AboutPage.tsx` |
| `/admin` | 后台管理（**访问与操作日志** / IP 识别与归属地、用户反馈；**IP 可点复制** + CopyToast；**全列排序**；**更新时间**；**运营商** `geo_isp`；归属地回填会刷新 `updated_at`；**登录用户下拉即筛**；**未登录访问日志只保留 10 天**；**列表分页金样**。Worker 日请求 / Error 1027 **不在此页**，见 `/admin/worker-traffic`） | `admin/page.tsx` | `AdminDashboardPage.tsx` → `AdminVisitSortTh` + `nav.admin-pagination`；`analytics-db.ts`；`GET /api/analytics/visits`；规则 `.cursor/rules/admin-dashboard-visit-logs.mdc`、`.cursor/rules/list-pagination-standard.mdc`；回归 `scripts/check_list_pagination_standard.py`、`scripts/check_admin_dashboard_visit_logs.py` |
| `/admin/worker-traffic` | **流量检测看板**（定位 Error 1027：北京**配额日**进度＝**08:00→次日 08:00**（与 CF 日请求重置一致，勿用日历 0 点）、**平均/高峰 次/秒**、**分时折线**（横轴 08→次日 07 + 配额起点竖线）、**近 14 个配额日趋势**、接口 Top（**点路径看 IP Top**）、用户 Top、**用户×接口**交叉、**匿名流量**、**复制诊断报告**；访问日志**不**统计 API 轮询） | `admin/worker-traffic/page.tsx`、`zh/admin/worker-traffic/page.tsx` | `AdminWorkerTrafficPage.tsx` → `AdminWorkerTrafficPanel` + `AdminWorkerTrafficCharts`（`next/dynamic` 懒加载 recharts）+ `AdminWorkerTrafficRouteIpModal`；`worker-traffic-db.ts` / `worker-traffic-rate.ts`（`workerQuotaDateString` / `WORKER_QUOTA_HOUR_ORDER`）/ `worker-api-rate-limit.ts`（日语+英语 fill-* 每 IP×路径 5s）/ `worker-traffic-report.ts` / `worker-traffic-record.ts`；`GET /api/analytics/traffic`（`?route=` 拉 IP）；规则 `.cursor/rules/worker-api-guard-1027.mdc`；回归 `scripts/check_worker_traffic.py` |
| `/admin/rbac` | 角色权限 | `admin/rbac/page.tsx` | `AdminRbacPage.tsx` |
| `/admin/users` | 用户管理 | `admin/users/page.tsx` | `AdminUsersPage.tsx` + `admin-users-page/` |
| `/store-review` | 外卖评价 | `store-review/page.tsx` | |

### admin/users 子功能

| 功能描述 | 改哪里 |
|----------|--------|
| 用户列表、**无对应老师时「绑定老师」/ 已绑定时「更改」**（点开下拉选择并绑定或改绑；一位老师最多绑一个账号）、添加/编辑亦可改关联、创建/禁用/登录链接 | `AdminUsersPage.tsx`、`AdminUserBindTeacherModal.tsx`、`AdminUserEditModal.tsx`；`GET/POST/PATCH /api/admin/users`（`jp_lesson_teacher_id`）；`setUserJpLessonTeacherLink` |
| **桌面表操作列完整可见**（用户名可换行；创建/登录时间上下两行；操作一行两个按钮；禁止横滑挤掉按钮） | `AdminUsersPageStyles.tsx`；`AdminUserDateTimeStacked`；规则 `.cursor/rules/admin-users-table-actions-visible.mdc`；`scripts/check_admin_users_table_actions_visible.py` |
| **老师身份可多选**（同一账号可同时是日语老师 + 韩语老师等；列表显示「日语教师 + 韩语老师」） | `AdminUserTeacherModulesField.tsx`；`teacher_modules` → 主 `role` + `etr_user_extra_permissions`；`getUserPermissions` 合并额外权限；规则 `.cursor/rules/admin-user-multi-teacher-roles.mdc` |
| **列表排序**（ID / 最近登录 / **状态**正常↔已禁用；手机端排序按钮同字段） | `AdminUsersPage.tsx` → `sortUsers`、`toggleSort`、`UserSortField` |
| **列表搜索**（桌面表格 + 手机卡片共用；本地即时过滤用户名/角色/对应老师/ID/状态/IP） | `AdminUsersPage.tsx` → `searchQuery`、`matchesAdminUserSearch`、`filteredUsers` |
| **操作按钮 2 列网格**（每行 2 个，排不下换行；桌面表格 + 手机卡片；保证按钮完整可见） | `admin-users-page/AdminUsersPageStyles.tsx` → `.admin-user-actions` |
| **永不禁用**（测试账号；开启后课表/抽完等**定时启禁一律跳过**，仅管理员点「取消永不禁用」恢复；手动启用/禁用仍可用） | `etr_users.never_disable`；`setUserNeverDisable`；`isExcludedFromTeacherScheduleAutoEnable`；`AdminUsersPage` → `toggleNeverDisable`；规则 `.cursor/rules/admin-user-never-disable.mdc` |
| **手机端用户卡片**（&lt; lg 显示卡片 + 排序；桌面端表格） | `AdminUsersPage.tsx` → `admin-cards` / `admin-table-wrap`；`mobile.css` |
| **更换密码**（操作列一键随机换密：确认后旧密码失效并踢会话；新密码复制到剪贴板；`test` 等普通账号可用；**李老师 / user1 等保留账号禁止**，须「编辑」填写） | `AdminUsersPage` → `resetUserPassword`；`POST /api/admin/users/reset-password`；`resetUserPasswordByAdmin`（踢会话 + `generateMemorableTeacherPassword`）；规则 `.cursor/rules/bootstrap-account-password.mdc`；回归 `scripts/check_admin_users_reset_password.py` |
| **复制账号密码**（日语角色 → `japanese…/jp-vocab`；英语角色 `en_vocab` → `english…/en-vocab`；密码来自本机缓存；**李老师 / user1 等保留账号无缓存时禁止一键随机重置**，须「编辑」填写） | `AdminUsersPage.tsx` → `copyUserCredentials`；`resetUserPasswordByAdmin`（`cannot_reset_bootstrap`）；`admin-user-credentials.ts` → `formatAdminUserCredentials`（`JP_SITE_URL` / `EN_SITE_URL`）；规则 `.cursor/rules/bootstrap-account-password.mdc` |
| **管理登录模板 + 带模板复制**（可添加/编辑**多个**模板；点「带模板复制」先弹窗选模板，再复制**用户名 + 密码 + 抽查入口**；占位 `{username}` / `{password}` / `{quiz_url}`，缺占位则末尾附凭证块；「复制链接」仍单独生成免密登录 URL） | `AdminUsersTemplatesModal` / `AdminUsersTemplatePickModal`；`copyWithTemplate`；`renderAdminTemplateCredentialsCopy`；规则 `.cursor/rules/admin-users-copy-with-template.mdc`；回归 `scripts/check_admin_users_copy_with_template.py` |
| **复制登录链接**（路径带用户名：`/sign-in/{username}/{slug}`；按角色落到 japanese / english / korean；旧 `/sign-in/{slug}` 仍可用；模板可用 `{login_url}` / `{username}`） | `POST /api/admin/users/login-link`；`buildLoginLinkUrl`（`login-link-slug.ts`）；`src/app/sign-in/[username]/[slug]/route.ts`；`renderLoginLinkTemplate`；规则 `.cursor/rules/login-link-username-in-url.mdc`；回归 `scripts/check_login_link_username_in_url.py` |
| 创建/登录时间显示为**北京时间**（桌面表日期/时间上下两行） | `AdminUserDateTimeStacked`；`formatBeijingDateTime`；`src/lib/format-datetime.ts` |
| **最后登录 IP 折叠**（长 IPv6 默认收起 +「展开/收起」；IPv4 一行展示；禁止每行 N 字符强折） | `AdminUsersPage.tsx` → `AdminUserIpDisplay`；规则 `.cursor/rules/admin-users-ip-collapse.mdc` |
| **历史登录 IP**（IP 下列「查看历史登录IP」；登录时**已有缓存则直接抄归属地**，新 IP **入队**；Mac **每 30s 查 1 个** ip9 写缓存并抄到该 IP 全部登录行；弹窗只读/软刷新，不打 ip9） | `recordUserLoginHistory` / `etr_ip_geo_queue`；`AdminUserLoginHistoryModal`；`POST …/ip-geo/backfill`；`login-ip-geo-backfill-remote.py`；规则 `.cursor/rules/admin-users-ip9-geo-throttle.mdc` |
| **今日有课老师账号自动启用**（北京 **05/06/07**；**线上 Worker Cron 整点兜底** + Mac launchd；05 遇 1102 → 06/07 再试；失败 **Bark**；装 05:00 **联装**开课前任务；仅日语新课+手动日程；`admin`/`user1`/`test`/**永不禁用** 不受控） | `teacher-user-schedule-enable.ts`；`POST /api/admin/teacher-user-schedule-enable`；`cloudflare-worker.ts`；Mac `setup-teacher-user-schedule-enable-mac.sh`（会联装 pre-class）；规则 `teacher-pre-class-auto-enable.mdc` |
| **开课前 2 小时自动启用**（日语 2h，**不是 20min**；韩/英 30min；**线上 Cron 每 10 分钟主兜底**（Mac 关机/漏装仍开）+ Mac `StartInterval=600`；失败 Bark；与 05:00 / 学习中 18h 互补；抽完禁用临近课跳过） | `runTeacherUserPreClassEnable`；`POST /api/admin/teacher-user-pre-class-enable`；`cloudflare-worker.ts`；Mac `setup-teacher-user-pre-class-enable-mac.sh`；规则 `teacher-pre-class-auto-enable.mdc`、`ko-pron-teacher-account-lifecycle.mdc`、`en-vocab-teacher-account-lifecycle.mdc`；回归 `check_teacher_user_pre_class_enable.py` |
| **学习中 + 开课 18h 内立即启用**（管理员在 `/jp-lesson` 设好老师+时间并标「学习中」时，不必等 05:00） | 同上 `maybeEnableTeacherUsersForLearningLesson`；挂钩 `POST /api/jp-lesson`；规则 `teacher-lesson-learning-auto-enable.mdc` |
| **下课 10 分钟后自动禁用**（北京时间：`下课=开课+课时` 缺省 55min，再 +10min；有后续未结束课则跳过；踢掉会话；`admin` / `user1` / `test` / **永不禁用** 不受控） | `runTeacherUserPostClassDisable`；`POST /api/admin/teacher-user-post-class-disable`；Mac `scripts/setup-teacher-user-post-class-disable-mac.sh`（`StartInterval=600`）；规则 `.cursor/rules/teacher-post-class-auto-disable.mdc` |
| **今日抽查完成后自动禁用**（日语：`jp_vocab_teacher_quiz_day`，普通 +1h / 带读 +2h；**韩语：`ko_pron_teacher_quiz_day`，抽完 +20min**；**英语：`en_vocab_teacher_quiz_day`，抽完 +1h**；临近开课窗口跳过；`admin` / `user1` / `test` / **永不禁用** 不受控） | `jp-vocab-teacher-quiz-day.ts` / `ko-pron-teacher-quiz-day.ts` / `en-vocab-teacher-quiz-day.ts`；`teacher-user-quiz-complete-disable.ts`；`POST /api/admin/teacher-user-quiz-complete-disable`；Mac 每 15 分钟；规则 `teacher-quiz-complete-auto-disable.mdc`、`ko-pron-teacher-account-lifecycle.mdc`、`en-vocab-teacher-account-lifecycle.mdc` |

---

## 全局横切

| 用途 | 文件 |
|------|------|
| 登录 / 会话 / 前端权限 | `src/contexts/EtrAuthProvider.tsx`、`src/lib/etr-auth.ts`、`src/app/api/english-teacher-review/auth/route.ts` |
| RBAC 权限表 | `src/lib/rbac.ts`、`src/lib/rbac-db.ts`、`schema.sql` → `etr_role_permissions` |
| 站点导航（**管理员**：日语/英语/韩语二级菜单，「日语」组最左；**日程管理 / 人员管理**为跨科目**顶栏一级**（不进语言二级）；**老师等非管理员**：一级扁平链接，无语言下拉；其余按频次；溢出→「更多」） | `src/hooks/useSiteNavSplit.ts`（`useLangGroups: isAdmin`）、`src/lib/site-nav-config.ts`（`NAV_LANG_GROUPS` / `NAV_TOP_LEVEL_CROSS_SUBJECT_IDS` / `PINNED_PRIMARY_NAV_ID=langJp`）、`src/lib/site-nav-groups.ts`、`src/hooks/useSiteNavItems.ts`、`src/components/SiteNav.tsx`、`src/components/NavDrawer.tsx`、`src/components/AppShell.tsx`；规则 `.cursor/rules/site-nav-pin-freq.mdc`；回归 `scripts/check_site_nav_more_visible.py` |
| 全站样式 / 红涨绿跌 | `src/app/globals.css`、`src/app/mobile.css`；规则见 `.cursor/rules/red-rise-green-fall.mdc`（父仓库） |
| 数据库 schema | `schema.sql`（部署迁移；运行时补表见各 `*-db.ts` 内 `ensure*Schema`） |
| **自动部署**（维护中心 `http://127.0.0.1:17823/`；Cursor `stop` hook 触发；**fingerprint 仅成功 POST 后写入**；忙时入队勿跳过；成功后 Mac 桌面通知优先、已弹则不推 Bark；**部署失败时页顶红色「复制失败日志」**（sticky），成功则隐藏） | `.cursor/hooks/auto-publish-mode1.sh`；`scripts/maintenance_center/server.py` + `static/app.js`（`#deploy-fail-banner`）；`bark_notify.py` / `mac_notify.py`；规则 `.cursor/rules/auto-publish-fingerprint.mdc`、`bark-deploy-failure-notify.mdc`；回归 `scripts/check_auto_publish_fingerprint.py`、`check_maintenance_center_deploy_fail_copy.py` |
| **定时任务管理**（维护中心页签：精选任务列表 / 运行中定位 / 实时日志与时长；**日语/英语补全熔断状态日志**：同一词调接口 3 次未搞定则暂停全部补全定时并记录原因；**仅本机维护中心**，不上 Cloudflare 线上站） | `scripts/maintenance_center/cron_tasks/registry.py`、`status.py`、`logs.py`、`circuit_breaker.py`；API `GET /api/cron-tasks`、`GET /api/cron-tasks/<id>`、`GET /api/vocab-fill-circuit`、`POST /api/vocab-fill-circuit/resume`；UI `static/index.html` → `view-cron`（`#vocab-fill-circuit-card`）；规则 `.cursor/rules/cron-tasks-registry.mdc`、`.cursor/rules/vocab-fill-circuit-breaker.mdc` |
| **日语补全 · 最近词条**（维护中心独立页签：统一补全跑过哪些词；表列「补全内容」= 任务类型+字段如「统一补全 · 读音、释义/词性、例句」；**可配置运行间隔** 1～30 分钟；摘要须写「日语统一补全定时：已启用…」勿含糊「定时状态：正在运行」；**无待补空转不写表**，摘要须标「最近一轮无待补词条」） | UI `view-jp-fill`；`vocabFillScheduleLine` / `fill_content_label`（`static/app.js`）；`vocab_fill_applied_label.py`、`jp_vocab_fill_feed.py`、`jp_vocab_fill_interval.py`；规则 `.cursor/rules/vocab-fill-schedule-status-label.mdc`、`vocab-fill-applied-column.mdc`；回归 `scripts/check_jp_vocab_fill_feed.py`、`check_jp_vocab_fill_unified_interval_config.py` |

---

## 维护说明

- 新增页面或改 URL 时，请同步更新本文件对应行。
- 线上 URL 只需 path 部分即可索引，例如用户发 `https://finance.info-quests.com/jp-vocab/study` → 查 `/jp-vocab/study`。
