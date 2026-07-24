# 重构报告（REFACTOR_REPORT.md）

> 阶段：**分析与规划完成** · **尚未执行大规模代码拆分**  
> 日期：2026-07-24

---

## 1. 本次交付物

| 文件 | 状态 | 说明 |
|------|------|------|
| `docs/project-analysis.md` | ✅ 新建 | 全项目 LOC、目录、重复代码、公共模块 |
| `docs/AI_INDEX.md` | ✅ 新建 | AI 模块总索引 |
| `docs/ROUTING.md` | ✅ 新建 | 需求→修改路径 |
| `docs/DEPENDENCY.md` | ✅ 新建 | 模块依赖与影响面 |
| `docs/REFACTOR_REPORT.md` | ✅ 新建 | 本报告 |
| `docs/feature-index.md` | ✅ 已有 | 继续作为功能级索引（已补充 en-vocab 条目） |
| `.cursor/hooks/bug-prevention-session.py` | ✅ 已有 | sessionStart 注入 `[en-vocab-hotspots]` |
| `tmp/refactor-scan.json` | ✅ 新建 | 机器可读扫描结果 |

---

## 2. 已完成的代码改动

### 2.1 功能修复（本会话前/中）

| 改动 | 文件 | 目的 |
|------|------|------|
| 英语 1h 熟悉程度锁 | `en-vocab-review.ts`, `en-vocab-db.ts`, `EnVocabPage` | 学生 peek 后仍可改 |
| 学生已查看顶栏横幅 | `EnVocabTeacherQuizFlashcardModal` | 醒目 + 钉到下一个 |
| 英语须登录 | `EnVocabPage` + API | 不对网友开放 |

### 2.2 重构拆分（按模块逐个执行）

#### ✅ EnVocabPage（第 1 项，进行中）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 样式 | `en-vocab-page/EnVocabPageStyles.tsx` | 1004 | ✅ |
| 词表 | `en-vocab-page/EnVocabWordTable.tsx` | 772 | ✅ 2026-07-24 |
| 分页 | `en-vocab-page/EnVocabPagination.tsx` | 44 | ✅ 2026-07-24 |
| 页内 helpers | `lib/en-vocab-page-helpers.tsx` | 50 | ✅ 2026-07-24 |
| 编排页 | `EnVocabPage.tsx` | **1954**（原 3234） | ✅ 2026-07-24 · 待抽 teacher quiz hook |
| 数据 sync | `hooks/useEnVocabPageSync.ts` | ~250 | ✅ |
| 勾选/共享 | `hooks/useEnVocabReviewActions.ts` | ~400 | ✅ |
| 缓存 | `lib/en-vocab-page-cache.ts` | ~40 | ✅ |
| teacher quiz | `hooks/useEnVocabTeacherQuiz.ts` | ~460 | ⏳ 已写好，下轮接入页 |

**验证**：`tsc --noEmit` ✅ · `check_en_vocab_table_stats_grid.py` ✅ · `check_en_vocab_review_lock.py` ✅ · `check_en_vocab_login_required.py` ✅ · `check_en_vocab_heavy_lazy_import.py` ✅

#### ✅ JpVocabPage（hooks，已完成）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 编排页 | `JpVocabPage.tsx` | **1792** | ✅ |
| hooks | `useJpVocab*.ts` | — | ✅ |

#### ✅ jp-vocab-db（第 3 项，2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| barrel | `jp-vocab-db.ts` | 4 | ✅ 仅 re-export |
| state | `jp-vocab-db/state.ts` | 110 | ✅ `jpVocabDbState` |
| helpers | `jp-vocab-db/helpers.ts` | 542 | ✅ schema/refs/seed |
| words | `jp-vocab-db/words.ts` | 929 | ✅ 列表/复习/删除/上传 |
| lesson | `jp-vocab-db/lesson.ts` | 425 | ✅ 新课同步 |
| notes_fields | `jp-vocab-db/notes_fields.ts` | 525 | ✅ 备注/编辑 |
| daily_settings | `jp-vocab-db/daily_settings.ts` | 843 | ✅ 日序/可见池 |
| share | `jp-vocab-db/share.ts` | 782 | ✅ 共享/协助请求 |
| live_rollover | `jp-vocab-db/live_rollover.ts` | 647 | ✅ live/跨日 |

原 **3994** 行单文件 → 按域拆分；外部 API 不变：`import { … } from "@/lib/jp-vocab-db"`。

**验证**：`tsc --noEmit` ✅ · `check_jp_vocab_quiz_score.py` ✅ · `check_jp_vocab_quiz_priority_boost.py` ✅ · `check_vocab_reset_clears_shared.py` ✅

#### ✅ en-vocab-db（第 4 项，2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| barrel | `en-vocab-db.ts` | 4 | ✅ |
| state / helpers / words / lesson / notes / daily / share / live | `en-vocab-db/*` | ≤691/文件 | ✅ 对齐 jp |

**验证**：`tsc` ✅ · review_lock / usage_aggregate / daily_quiz_target / usage_no_exam / reset_clears_shared ✅

#### ✅ JpLessonPage（队列 #1，≤1000 达标 · 2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 样式 | `jp-lesson-page/JpLessonPageStyles.tsx` | 826 | ✅ |
| helpers | `jp-lesson-page/jp-lesson-page-helpers.tsx` | 392 | ✅ |
| 状态区表体 | `jp-lesson-page/JpLessonStatusTable.tsx` | 840 | ✅ |
| actions hook | `jp-lesson-page/useJpLessonPageActions.ts` | 743 | ✅ |
| 分区 UI | `jp-lesson-page/JpLessonPageSections.tsx` | 215 | ✅ |
| 弹窗集 | `jp-lesson-page/JpLessonPageModals.tsx` | 182 | ✅ |
| API 上传说明 | `jp-lesson-page/JpLessonApiUploadDocs.tsx` | 56 | ✅ |
| 编排页 | `JpLessonPage.tsx` | **561**（原 ~3250） | ✅ 出队 |

**验证**：`JpLessonPage` 无 tsc 报错 · pending_id_sort / teacher_search / annotate_image_url ✅ · `refresh_file_split_queue` 已清出

#### ✅ EnVocabTeacherQuizFlashcardModal（队列 #2，≤1000 达标 · 2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| helpers | `en-vocab-teacher-quiz-flashcard/helpers.ts` | 41 | ✅ |
| Header | `…/EnVocabFlashcardPageHeader.tsx` | 179 | ✅ |
| Body | `…/EnVocabFlashcardPageBody.tsx` | 305 | ✅ |
| Footer | `…/EnVocabFlashcardPageFooter.tsx` | 286 | ✅ |
| Alerts | `…/EnVocabFlashcardAlerts.tsx` | 109 | ✅ |
| 编排 | `EnVocabTeacherQuizFlashcardModal.tsx` | **670**（原 1312） | ✅ 出队 |

**验证**：lemma_ipa / notes_footer / study_flashcard_parity / usage_examples_pair / usage_level_aggregate ✅（检查脚本改为扫 `en-vocab-teacher-quiz-flashcard/`）

#### ✅ EnVocabPage（队列，≤1000 达标 · 2026-07-25）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 修半拆 JSX | `EnVocabPage.tsx` | — | ✅ 去掉多余 `</div>) : null}` |
| WordList | `en-vocab-page/EnVocabPageWordList.tsx` | 253 | ✅ |
| 编排页 | `EnVocabPage.tsx` | **986**（原 1029） | ✅ 出队 |

**验证**：`tsc` ✅ · login_required / heavy_lazy / table_stats_grid / usage_* / study_parity / review_lock ✅

#### ✅ AdminUsersPage（队列，≤1000 达标 · 2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| Styles / List / helpers | `admin-users-page/*` | ≤447 | ✅ 先期 |
| Toolbar | `AdminUsersToolbar.tsx` | 48 | ✅ 接入 |
| Modals 集 | `AdminUsersPageModals.tsx` | 231 | ✅ 接入 |
| actions hook | `useAdminUsersPageActions.ts` | 729 | ✅ |
| 编排页 | `AdminUsersPage.tsx` | **530**（原 1157） | ✅ 出队 |

**验证**：`lockBodyScroll` 仍在编排页 · `check_admin_users_trackpad_scroll`（globals-seo-admin / mobile 拆分 css）✅ · queue 已清出

#### ✅ JpLessonSchedulePage（第 6 项，2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 样式 | `jp-lesson-schedule-page/JpLessonSchedulePageStyles.tsx` | 953 | ✅ |
| helpers | `jp-lesson-schedule-page/jp-lesson-schedule-page-helpers.tsx` | 343 | ✅ |
| 日历+详情布局 | `jp-lesson-schedule-page/JpLessonScheduleLayout.tsx` | ~515 | ✅ |
| 编排页 | `JpLessonSchedulePage.tsx` | **~1338**（原 2891） | ✅ |

**验证**：`tsc` ✅ · custom_schedule_time / schedule_duplicate / manual_teacher_subject / caldav_slot_merge ✅

#### ✅ EnLessonPage（第 8 项，2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 样式 | `en-lesson-page/EnLessonPageStyles.tsx` | 652 | ✅ |
| helpers | `en-lesson-page/en-lesson-page-helpers.tsx` | 323 | ✅ |
| 状态区表体 | `en-lesson-page/EnLessonStatusTable.tsx` | 637 | ✅ |
| 编排页 | `EnLessonPage.tsx` | **937**（原 2370） | ✅ |

**验证**：`tsc` ✅ · annotate_image_url（含 `en-lesson-page/`）✅

#### ✅ LessonAnnotate 共享（2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 共享画布+保存 | `lesson-annotate/LessonAnnotateModal.tsx` | 1738 | ✅ `subject: jp\|en` |
| 日语薄包装 | `JpLessonAnnotateModal.tsx` | 26 | ✅ |
| 英语薄包装 | `EnLessonAnnotateModal.tsx` | 26 | ✅ |

**验证**：`tsc` ✅ · annotate_image_url / vocab_ref_live_refresh ✅

#### ✅ JpVocabEditModal（样式，2026-07-24）

| 步骤 | 文件 | LOC | 状态 |
|------|------|----:|------|
| 样式 | `jp-vocab-edit-modal/JpVocabEditModalStyles.tsx` | 681 | ✅ |
| 弹窗编排 | `JpVocabEditModal.tsx` | **1295**（原 1967） | ✅ · 表单段可再拆 |

#### ⏳ 队列后续

| 文件 | LOC | 说明 |
|------|----:|------|
| `etr-auth-db.ts` | 1661 | 多职责；须连同 **内部 helper** 一起拆（曾试拆漏 helper 已回滚） |
| `JpVocabEditModal` | 1295 | 可再抽基础字段 / 备注 / 例句 |
| `AdminJpLessonTeachersPage` / `EnLessonSchedulePage` / Study 页等 | 1500+ | 见 §3 |

---

## 3. 建议拆分清单（按优先级，待逐模块执行）

### ★★★★★ 必须分析/拆分

| 文件 | LOC | 职责分析 | 建议 |
|------|----:|----------|------|
| `jp-vocab-db.ts` | 3994 | **多职责**：schema、seed、CRUD、shared、review、teacher-visible、coach、fill | 按域拆为 `jp-vocab-db/` 目录：`word.ts`, `shared.ts`, `review.ts`, `visible.ts`；**保留** re-export 入口兼容 |
| `en-vocab-db.ts` | 2855 | 同上（英语） | 与日语对称拆分 |
| `JpVocabPage.tsx` | 1792 | 编排+表格+poll+export | **继续**：Toolbar、export helpers（已 <2000） |
| `EnVocabPage.tsx` | 3234 | 同上 | 镜像 jp：WordTable、Pagination、hooks |
| `JpLessonPage.tsx` | 3250 | 列表+编辑+上传+状态 | 拆 `jp-lesson-page/`：List, Toolbar, UploadFlow |
| `EnLessonPage.tsx` | 2370 | 镜像 | 同上 |
| `JpLessonSchedulePage.tsx` | 2891 | 日程 CRUD+合并展示 | 拆 schedule 子组件 + lib |
| `AdminUsersPage.tsx` | 2580 | 用户 CRUD+启禁+复制 | 拆 table/modals/hooks |

### ★★★★☆ 1000–2000 行 — 多职责则拆

| 文件 | 建议 |
|------|------|
| `JpVocabEditModal.tsx` (1967) | 表单分段：基础字段 / 备注 / 例句 |
| `Jp/En LessonAnnotateModal` (1726×2) | **优先**抽共享 `LessonAnnotateCanvas` |
| `etr-auth-db.ts` (1661) | 按 user/session/link 拆 |
| `JpVocabStudyPage.tsx` (1520) | 抽 poll/cache hook |
| `EnVocabTeacherQuizFlashcardModal` (1312) | 可保留（完整业务 UI）；备份 compact 勿打进 bundle |

### ★★★☆☆ 500–1000 行 — 视职责

| 文件 | 建议 |
|------|------|
| `jp-lesson-shared.ts` (954) | 可保留（纯函数库） |
| `jp-vocab-teacher-visible.ts` (841) | 可保留或并入 db 子模块 |

### 允许保留 >1000 行（须说明）

| 文件 | 原因 |
|------|------|
| `JpVocabTeacherQuizFlashcardModal` (~1116) | 单一完整业务 UI |
| `jp-vocab-page/JpVocabPageStyles.tsx` (~1472) | 单一职责=样式 |
| `i18n/messages.ts` (~1790) | 单一职责=文案数据 |
| `mobile.css` / `globals.css` | 样式层，非业务；可按模块拆 CSS 但优先级低 |

---

## 4. 建议公共抽取（第四阶段规划）

| 新模块（规划） | 来源 | 说明 |
|----------------|------|------|
| `lib/vocab/` | jp+en review, daily-check, sync | 参数化语言前缀或泛型 Word 类型 |
| `hooks/useVocabPollSync.ts` | Jp/En Page 重复 poll | 统一 since/limit/hidden 降频 |
| `hooks/useTeacherQuizSession.ts` | 抽查 session 持久化 | 共用 storage 模式 |
| `components/shared/LessonAnnotate/` | Jp+En AnnotateModal | 最大重复 ROI |
| `components/shared/ClassNotesEdit/` | Jp+En ClassNotes | 图片上传+去重 |

**禁止**：一次性合并 jp/en db 为单文件（风险过高）；应 **re-export 兼容** 渐进迁移。

---

## 5. 目录结构优化（第五阶段规划）

```
src/
├── components/
│   ├── jp-vocab-page/     ✅ 已有
│   ├── en-vocab-page/     ⏳ 进行中（仅 Styles）
│   ├── jp-lesson-page/    📋 规划
│   └── shared/            📋 vocab/lesson 共用 UI
├── lib/
│   ├── jp-vocab-db/       📋 规划（替代单文件）
│   └── en-vocab-db/       📋 规划
└── hooks/                 📋 扩充 poll/quiz hooks
```

---

## 6. 重构执行顺序（建议）

**每次只做一个模块，验证后再继续。**

| 顺序 | 模块 | 理由 |
|------|------|------|
| 1 | `en-vocab-page/` 对齐 `jp-vocab-page/` | 刚改 en-vocab，上下文热；减 EnVocabPage 风险低 |
| 2 | `EnVocabPage` hooks 抽取 | 与 jp 对称，不改 API |
| 3 | `en-vocab-db/` 拆分 | 英语域独立 |
| 4 | `jp-vocab-page/` 补 hooks | 日语已部分拆 |
| 5 | `jp-vocab-db/` 拆分 | 影响面最大，放后 |
| 6 | Lesson Annotate 共享 | 1726×2 重复 |

---

## 7. 每次拆分必做验证（第十、十一阶段）

```bash
# 类型 / 构建
npm run lint
npm run cf:build && npm run cf:check-size

# 模块回归（按改动选用）
python3 scripts/check_en_vocab_review_lock.py
python3 scripts/check_en_vocab_login_required.py
python3 scripts/check_en_vocab_study_flashcard_parity.py
python3 scripts/check_jp_vocab_quiz_score.py
python3 scripts/check_worker_bundle_size.py
```

**手工**：对应页面按钮、保存条、权限、轮询、抽查卡「下一个」。

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| Worker bundle 超 2980 KiB | 懒加载重依赖；拆后勿增加顶层 import |
| jp/en 行为漂移 | 成对改 + 对称回归脚本 |
| DB 拆分 import 断裂 | 保留 `jp-vocab-db.ts`  barrel re-export |
| 重构引入权限回归 | `check_en_vocab_login_required.py` 等 |
| 一次改太多 | **禁止**；按 §6 顺序 |

---

## 9. 最终检查清单（当前状态）

| 检查项 | 状态 |
|--------|------|
| 编译 / lint | ⏳ 未在本阶段全量跑（仅分析） |
| 引用丢失 | ✅ 未做大规模移动 |
| 循环依赖 | ✅ 无新增 |
| 功能回归 | ✅ 本会话 en-vocab 相关 scripts 已通过 |
| AI 索引可用 | ✅ 5 份文档 + feature-index + hooks |

---

## 10. 结论

- **重构目标**：提高 AI 与人类的**定位效率**，不是单纯减 LOC。
- **当前阶段**：扫描 + 文档 + 索引 **已完成**；代码**仅** en-vocab 相关小步拆分已做。
- **下一步**：请指定优先模块（建议 **`en-vocab-page` 对齐日语词表拆分**），再执行「单模块拆分 → 验证 → 报告更新」循环。

---

## 附录：相关 Cursor 规则（新增/已有）

| 规则 | 用途 |
|------|------|
| `en-vocab-level-lock-1h.mdc` | 1h 锁 |
| `en-vocab-student-peek-banner.mdc` | peek 顶栏 |
| `en-vocab-login-required.mdc` | 须登录 |
| `en-vocab-page-split.mdc` | 页面拆分约定 |
| `feature-index.mdc` | 先查索引 |

Session 钩子 `[en-vocab-hotspots]` 已写入 `bug-prevention-session.py`。
