# 功能索引（Feature Index）

改功能前**先查本表**：用户粘贴线上 URL、说中文功能名、或描述页面行为时，从这里定位文件，避免全库盲搜。

线上根域名示例：`https://finance.info-quests.com`（路径与下表一致）。

---

## 怎么用

1. 从 URL 取 **path**（去掉域名），如 `/jp-vocab/study`
2. 在下方表格搜 path，或搜中文关键词（如「请老师发送」「发给学生」「今日日语单词」）
3. 按列打开：**页面 → 组件 → API → 数据库/权限**

日语/英语学习模块 URL **不带** `/zh` 前缀（见 `src/lib/locale-path.ts` `isLocaleNeutralPath`）。

---

## 日语单词 / 语法抽问（jp-vocab）

| 线上 path | 中文名 | 页面入口 | 主组件 | 关键 API | 数据 / 逻辑 | 权限 |
|-----------|--------|----------|--------|----------|-------------|------|
| `/jp-vocab` | 日语抽问、单词表、老师抽查 | `src/app/jp-vocab/page.tsx` | `src/components/JpVocabPage.tsx` | `GET/POST /api/jp-vocab`、`/api/jp-vocab/sync`、`/api/jp-vocab/share` | `src/lib/jp-vocab-db.ts`、`schema.sql` → `jp_vocab_word`、`jp_vocab_shared` | `jp_vocab:read` 浏览；`jp_vocab:operate` 勾选/发给学生 |
| `/jp-vocab/study` | 今日日语单词、学生复习、请老师发送 | `src/app/jp-vocab/study/page.tsx` | `src/components/JpVocabStudyPage.tsx` | `GET /api/jp-vocab/shared`、`POST /api/jp-vocab/share-request` | 同上 + `jp_vocab_share_request` | `jp_vocab:study` 学生；`admin` 管理员（老师不可见） |
| `/jp-vocab/ref/[refKey]` | 教案/参考资料查看 | `src/app/jp-vocab/ref/[refKey]/page.tsx` | `JpVocabRefViewer` 等 | `/api/jp-vocab/ref/*` | `jp_vocab_ref` | 随单词页 |

### jp-vocab 子功能 → 文件速查

| 功能描述 | 改哪里 |
|----------|--------|
| 老师点「发给学生」、共享进度条 | `JpVocabPage.tsx` → `shareWord`；`POST /api/jp-vocab/share`；`shareJpVocabWord()` |
| 管理员设今日抽查数量（进度条内输入框 + 确认设置；决定老师端序号 1–N 可勾选） | `JpVocabDailyQuizProgressBar.tsx`；`JpVocabPage.tsx` → `setDailyQuizTarget`；`POST /api/jp-vocab` `set_daily_quiz_target`；`jp-vocab-db.ts` → `setJpVocabDailyQuizTarget()`；**北京时间跨日自动恢复 20**（`normalizeJpVocabTeacherVisibleLimit`、`resetJpVocabTeacherVisibleLimit`） |
| **老师端显示全库 + 序号 1–N 可操作**（取消隐藏；超出今日抽查数量的序号熟悉程度/发给学生禁用） | `JpVocabPage.tsx` → `isWordInQuizTarget`、`quizTargetWords`；`jp-vocab-teacher-visible.ts` → `isJpVocabWordInDailyQuizTarget`；`JpVocabDailyQuizProgressBar.tsx`（仅保留抽查数量设置） |
| 北京时间跨日清理（释放/共享/今日抽查次数/抽查目标恢复 20） | `POST /api/jp-vocab/daily-rollover`；`jp-vocab-daily-rollover.ts`；`resetJpVocabTeacherVisibleLimit()`；Mac 定时 `scripts/jp-vocab-nightly.sh` |
| 学生点「请老师发送」按钮 | `JpVocabStudyPage.tsx` → `requestTeacherShare`；`POST /api/jp-vocab/share-request` |
| 老师右下角 toast（学生协助请求） | `src/components/JpVocabShareRequestModal.tsx`；`JpVocabPage.tsx` 轮询 `GET /api/jp-vocab/share-request` |
| 今日抽查进度条（30/40、剩余 N）/ 抽完弹窗 | `JpVocabDailyQuizProgressBar.tsx`、`JpVocabDailyQuizCompleteModal.tsx`、`JpVocabDailyQuizIntroModal.tsx`；进度计算 `jp-vocab-daily-quiz-progress.ts` → `computeJpVocabDailyQuizProgress()`；与可见池联动见上条 |
| 熟悉程度勾选、今日序号 | `JpVocabPage.tsx` → `recordLevel`；`jp-vocab-review.ts`、`jp-vocab-daily-order.ts` |
| 课堂备注、共享备注 | `JpClassNotesEditModal.tsx`；`/api/jp-vocab/class-notes` |
| 手动添加 / 编辑词条 | `JpVocabManualAddModal.tsx`、`JpVocabEditModal.tsx`；`/api/jp-vocab/add`、`/edit` |
| 导航菜单文案 | `src/i18n/messages.ts` → `nav.jpVocab`、`nav.jpVocabStudy` |
| 路径常量 | `src/lib/locale-path.ts` → `jpVocabPath()`、`jpVocabStudyPath()` |
| 权限定义 | `src/lib/rbac.ts`；校验 `src/lib/jp-vocab-auth.ts`、`src/lib/etr-auth.ts` |
| 共享后刷新复习页 | `src/lib/jp-vocab-shared-notify.ts`（同浏览器多标签） |

#### 症状 / 关键词速查（老师端 `/jp-vocab`）

| 用户描述或页面文案 | 优先打开 |
|--------------------|----------|
| 今日抽查进度、30/40、剩余 10 | `jp-vocab-daily-quiz-progress.ts`、`JpVocabDailyQuizProgressBar.tsx` |
| 共 X 条、本轮未勾选 | `JpVocabPage.tsx`（老师端显示全库；`unmarkedCount` 仅统计序号 1–N） |
| 序号超出今日抽查数量不可勾选 | `isJpVocabWordInDailyQuizTarget`；`JpVocabPage.tsx` → `inQuizTarget` |
| 管理员设抽查数量后老师列表不对 | `jp-vocab-db.ts` → `setJpVocabDailyQuizTarget`；`JpVocabPage.tsx` → `quizTarget` |
| 调高目标后老师勾选词条消失 | 已取消隐藏；全库显示，仅禁用超出序号的操作 |
| 老师搜索 | `JpVocabPage.tsx` → `searchBaseWords`（全库搜索） |
| 今日抽查次数列、北京时间 0 点归零 | `jp-vocab-daily-check.ts`；`jp-vocab-review.ts` |

---

## 英语单词 / 语法抽问（en-vocab）

| 线上 path | 中文名 | 页面 | 主组件 | 说明 |
|-----------|--------|------|--------|------|
| `/en-vocab` | 英语抽背 | `src/app/en-vocab/page.tsx` | `EnVocabPage.tsx` | 与 jp-vocab 结构对称，改日语时可对照 |
| `/en-vocab/study` | 今日英语单词 | `src/app/en-vocab/study/page.tsx` | `EnVocabStudyPage.tsx` | |
| `/en-vocab/ref/[refKey]` | 英语教案 | `src/app/en-vocab/ref/[refKey]/page.tsx` | | API：`src/app/api/en-vocab/*`，库：`en_vocab_*` |

---

## 日语新课（jp-lesson）

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/jp-lesson` | 日语新课 | `src/app/jp-lesson/page.tsx` | `JpLessonPage.tsx` |
| `/jp-lesson/notes` | 课堂笔记 | `src/app/jp-lesson/notes/page.tsx` | `JpLessonNotesPage.tsx` |
| `/jp-lesson/schedule` | 日程管理 | `src/app/jp-lesson/schedule/page.tsx` | `JpLessonSchedulePage.tsx` |
| `/admin/jp-lesson-teachers` | 上课老师管理 | `src/app/admin/jp-lesson-teachers/page.tsx` | `AdminJpLessonTeachersPage.tsx` |

日程详情右侧「老师」名称可点击，跳转 `/admin/jp-lesson-teachers?teacher={id}` 并自动滚动定位。路径常量：`adminJpLessonTeachersPath()` in `locale-path.ts`。

逻辑：`src/lib/jp-lesson-db.ts`；API：`src/app/api/jp-lesson/*`

---

## 英语新课（en-lesson）

| path | 页面 | 主组件 |
|------|------|--------|
| `/en-lesson` | `src/app/en-lesson/page.tsx` | `EnLessonPage.tsx` |
| `/en-lesson/notes` | `src/app/en-lesson/notes/page.tsx` | `EnLessonNotesPage.tsx` |
| `/en-lesson/schedule` | `src/app/en-lesson/schedule/page.tsx` | `EnLessonSchedulePage.tsx` |

---

## 其他常用页面

| path | 中文名 | 页面 | 主组件 |
|------|--------|------|--------|
| `/`、`/zh` | 策略对比 | `src/app/page.tsx`、`zh/page.tsx` | `ComparePage.tsx` |
| `/english-teacher-review` | 英语老师评价 | `english-teacher-review/page.tsx` | |
| `/jp-review` | 日语口语复习 | `jp-review/page.tsx` | |
| `/about` | 关于与反馈 | `about/page.tsx` | `AboutPage.tsx` |
| `/admin` | 后台管理 | `admin/page.tsx` | `AdminDashboardPage.tsx` |
| `/admin/rbac` | 角色权限 | `admin/rbac/page.tsx` | `AdminRbacPage.tsx` |
| `/admin/users` | 用户管理 | `admin/users/page.tsx` | `AdminUsersPage.tsx` |
| `/store-review` | 外卖评价 | `store-review/page.tsx` | |

---

## 全局横切

| 用途 | 文件 |
|------|------|
| 登录 / 会话 / 前端权限 | `src/contexts/EtrAuthProvider.tsx`、`src/lib/etr-auth.ts`、`src/app/api/english-teacher-review/auth/route.ts` |
| RBAC 权限表 | `src/lib/rbac.ts`、`src/lib/rbac-db.ts`、`schema.sql` → `etr_role_permissions` |
| 站点导航 | `src/hooks/useSiteNavItems.ts`、`src/components/AppShell.tsx` |
| 全站样式 / 红涨绿跌 | `src/app/globals.css`、`src/app/mobile.css`；规则见 `.cursor/rules/red-rise-green-fall.mdc`（父仓库） |
| 数据库 schema | `schema.sql`（部署迁移；运行时补表见各 `*-db.ts` 内 `ensure*Schema`） |

---

## 维护说明

- 新增页面或改 URL 时，请同步更新本文件对应行。
- 线上 URL 只需 path 部分即可索引，例如用户发 `https://finance.info-quests.com/jp-vocab/study` → 查 `/jp-vocab/study`。
