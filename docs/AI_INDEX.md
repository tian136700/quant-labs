# AI 快速索引（AI_INDEX.md）

> **AI 改代码前必读顺序**：  
> 1. 本文 → 2. `docs/feature-index.md`（功能→文件）→ 3. `.cursor/rules/*.mdc`（约束）→ 4. `docs/ROUTING.md` / `docs/DEPENDENCY.md`

---

## 1. 系统模块总览

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (OpenNext) + D1 (strategy-compare-db)    │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│  jp-vocab   │  en-vocab   │  ko-pron    │  jp/en-lesson     │
│  日语抽问    │  英语抽背    │  韩语发音    │  新课 + 教案       │
├─────────────┴─────────────┴─────────────┴───────────────────┤
│  schedule · admin/users · rbac · auth · store-review        │
└─────────────────────────────────────────────────────────────┘
```

| 模块 ID | 中文名 | 子域示例 | 状态 |
|---------|--------|----------|------|
| `jp-vocab` | 日语单词/语法抽问 | japanese.info-quests.com | 生产 |
| `en-vocab` | 英语单词抽背 | english.info-quests.com | 生产 |
| `ko-pron` | 韩语发音抽问 | korean.info-quests.com | 生产 |
| `jp-lesson` | 日语新课 | japanese…/jp-lesson | 生产 |
| `en-lesson` | 英语新课 | english…/en-lesson | 生产 |
| `schedule` | 日程管理 | …/jp-lesson/schedule | 生产 |
| `admin` | 用户/权限/老师管理 | finance…/admin/* | 生产 |

---

## 2. 模块 → 入口文件

| 需求关键词 | 页面路由 | 页面组件 | 路由文件 |
|------------|----------|----------|----------|
| 日语抽问-老师 | `/jp-vocab` | `JpVocabPage` teacher | `src/app/jp-vocab/page.tsx` |
| 日语抽问-管理 | `/jp-vocab/admin` | `JpVocabPage` admin | `src/app/jp-vocab/admin/page.tsx` |
| 今日日语单词 | `/jp-vocab/study` | `JpVocabStudyPage` | `src/app/jp-vocab/study/page.tsx` |
| 英语抽背-老师 | `/en-vocab` | `EnVocabPage` teacher | `src/app/en-vocab/page.tsx` |
| 英语抽背-管理 | `/en-vocab/admin` | `EnVocabPage` admin | `src/app/en-vocab/admin/page.tsx` |
| 今日英语单词 | `/en-vocab/study` | `EnVocabStudyPage` | `src/app/en-vocab/study/page.tsx` |
| 日语新课 | `/jp-lesson` | `JpLessonPage` | `src/app/jp-lesson/page.tsx` |
| 英语新课 | `/en-lesson` | `EnLessonPage` | `src/app/en-lesson/page.tsx` |
| 日程管理 | `/jp-lesson/schedule` | `JpLessonSchedulePage` | `src/app/jp-lesson/schedule/page.tsx` |
| 用户管理 | `/admin/users` | `AdminUsersPage` | `src/app/admin/users/page.tsx` |
| 韩语抽问 | `/ko-pron` | `KoPronPage` | `src/app/ko-pron/page.tsx` |

---

## 3. 模块 → 主要 API

| 模块 | 核心 API | Route 文件 |
|------|----------|------------|
| jp-vocab | `GET/POST /api/jp-vocab` | `src/app/api/jp-vocab/route.ts` |
| | `GET /api/jp-vocab/sync` | `sync/route.ts` |
| | `POST /api/jp-vocab/share` | `share/route.ts` |
| | `GET/POST /api/jp-vocab/teacher-quiz-live` | `teacher-quiz-live/route.ts` |
| en-vocab | `GET/POST /api/en-vocab` | `src/app/api/en-vocab/route.ts` |
| | `GET /api/en-vocab/sync` | `sync/route.ts` |
| | `POST /api/en-vocab/teacher-quiz-live` | `teacher-quiz-live/route.ts` |
| jp-lesson | `GET/POST /api/jp-lesson` | `src/app/api/jp-lesson/route.ts` |
| en-lesson | `GET/POST /api/en-lesson` | `src/app/api/en-lesson/route.ts` |
| auth | `POST /api/etr/login` 等 | `src/app/api/etr/**` |
| admin | `GET/POST /api/admin/users` | `src/app/api/admin/users/route.ts` |

完整列表：`find src/app/api -name route.ts`（98 个）。

---

## 4. 模块 → 数据库（D1）

| 模块 | 主 lib | 主要表前缀 |
|------|--------|------------|
| jp-vocab | `src/lib/jp-vocab-db.ts` | `jp_vocab_*` |
| en-vocab | `src/lib/en-vocab-db.ts` | `en_vocab_*` |
| ko-pron | `src/lib/ko-pron-db.ts` | `ko_pron_*` |
| jp-lesson | `src/lib/jp-lesson-db.ts` | `jp_lesson*` |
| en-lesson | `src/lib/en-lesson-db.ts` | `en_lesson*` |
| auth | `src/lib/etr-auth-db.ts` | `etr_user*` |
| rbac | `src/lib/rbac-db.ts` | `etr_role*` |

Schema：`schema.sql`

---

## 5. 模块 → 主要组件

| 场景 | 组件 |
|------|------|
| 老师抽查卡片（日/英） | `JpVocabTeacherQuizFlashcardModal` / `EnVocabTeacherQuizFlashcardModal` |
| 保存进度条 | `JpVocabSaveProgressBar` |
| 今日抽查进度 | `JpVocabDailyQuizProgressBar` |
| 全页登录 | `TeacherReviewAuth` |
| 备注编辑 | `JpClassNotesEditModal` / `EnClassNotesEditModal` |
| 词表（日语已拆） | `jp-vocab-page/JpVocabWordTable.tsx` |
| 词表样式（英已拆） | `en-vocab-page/EnVocabPageStyles.tsx` |

---

## 6. 模块 → 主要 Hook / Context

| 名称 | 路径 | 用途 |
|------|------|------|
| `EtrAuthProvider` | `src/contexts/EtrAuthProvider.tsx` | 登录态、canAccess* 权限 |
| `useSiteNavItems` | `src/hooks/useSiteNavItems.ts` | 顶栏导航 |
| `useSaveProgressBar` | `src/hooks/useSaveProgressBar.ts` | 进度条动画 |

---

## 7. 模块 → 主要 Utils / Service

| 领域 | 文件 |
|------|------|
| 路径常量 | `src/lib/locale-path.ts` |
| 权限 | `src/lib/rbac.ts`, `src/lib/etr-auth.ts` |
| 熟悉程度/1h 锁 | `src/lib/jp-vocab-review.ts`, `en-vocab-review.ts` |
| 抽查池 | `jp-vocab-teacher-visible.ts`, `en-vocab-teacher-visible.ts` |
| 例句/假名 | `jp-vocab-example-sentences.ts` |
| 用法例句配对（英） | `en-vocab-usage-examples-display.ts` |
| 保存队列 | `src/lib/request-queue.ts` |
| 轮询常量 | `jp-vocab-sync.ts`, `en-vocab-sync.ts` |

---

## 8. 症状 → 快速定位（Bug / 需求）

| 用户描述 | 优先打开 |
|----------|----------|
| 英语熟悉程度点不了 / 1 小时 | `en-vocab-review.ts`, `EnVocabPage` `reviewLockedByWordId`, 规则 `en-vocab-level-lock-1h.mdc` |
| 学生已查看提示不明显 | `EnVocabTeacherQuizFlashcardModal` `__student-peek-banner`, `EnVocabPage` `studentPeekedCurrentWord` |
| 未登录能看词表 | `EnVocabPage` `TeacherReviewAuth`, `api/en-vocab/route.ts` `requireEnVocabRead` |
| 保存没进度条 | `JpVocabSaveProgressBar`, 规则 `save-progress-ui.mdc` |
| 部署失败 10027 | 规则 `worker-resource-limits.mdc`, `check_worker_bundle_size.py` |
| D1 1102 超时 | 规则 `worker-resource-limits.mdc`, 查 poll/SQL TRIM |
| 触控板滑不动 | `body-scroll-lock.ts`, 规则 `admin-users-trackpad-scroll.mdc` |

---

## 9. 模块调用关系（简图）

```
用户浏览器
    → app/*/page.tsx
    → components/*Page.tsx  ──fetch──→ app/api/*/route.ts
              │                              │
              └─ import ─→ lib/*-db.ts ──────┘
                              │
                              ▼
                         Cloudflare D1
```

---

## 10. 与 feature-index 的分工

| 文档 | 用途 |
|------|------|
| **AI_INDEX.md**（本文） | 架构、模块边界、API/DB/组件总表 |
| **feature-index.md** | 线上 URL / 中文功能名 → **精确文件** |
| **ROUTING.md** | 单条需求的**修改路径**（页面→API→DB） |
| **DEPENDENCY.md** | 影响范围、谁依赖谁 |

**禁止**不看索引就全库 `grep`。
