# 项目重构分析报告（project-analysis.md）

> 扫描时间：2026-07-24 · 仓库：`strategy-compare-cloud`  
> 目标：为 Cursor / Claude / GPT 提供可维护性基线；**本报告仅分析，不执行批量重构**。

---

## 1. 项目概览

| 项 | 说明 |
|---|---|
| 技术栈 | Next.js App Router · React · TypeScript · Cloudflare Workers + D1 · OpenNext |
| 部署 | 单 Worker 多子域（finance / japanese / english / korean） |
| 核心业务 | 日语/英语/韩语 **单词抽问**、**新课/教案**、**日程**、管理后台、店铺评论、工具码等 |
| 已有 AI 索引 | `docs/feature-index.md`（功能→文件，**改功能前先查**） |
| Cursor 规则 | `.cursor/rules/*.mdc`（110+ 条业务约束） |
| 回归脚本 | `scripts/check_*.py`（80+ 条自动化守卫） |

---

## 2. 代码行数（LOC）统计

### 2.1 按顶层目录（不含 node_modules / .next / .history）

| 目录 | LOC（约） | 说明 |
|------|----------:|------|
| `trend_aggregator/` | 177,972 | **独立 Python 趋势聚合**（非 Next Worker 主路径） |
| `src/components/` | 79,035 | 页面组件、弹窗、表格（**最大 TS 体积**） |
| `src/lib/` | 47,329 | DB、业务逻辑、工具、权限 |
| `scripts/` | 33,124 | Mac 定时、部署、回归检测、维护中心 |
| `src/app/` | 18,669 | 路由、API route、全局 CSS |
| `.cursor/` | 5,457 | 规则 + session 钩子 |
| `src/i18n/` | 1,946 | 中英文文案 |
| `src/store-review/` | 1,670 | 店铺评论子应用 |
| `wechat-jp-vocab-review/` | 906 | 微信小程序 |
| `docs/` | 395 | 功能索引等 |

### 2.2 按文件类型（全仓库）

| 扩展名 | LOC（约） |
|--------|----------:|
| `.py` | 202,771 |
| `.tsx` | 81,759 |
| `.ts` | 62,229 |
| `.css` | 7,257 |
| `.sql` | 6,414 |
| `.mdc` | 5,075 |

**Next.js 应用核心（src/ 仅 TS/TSX）**：约 **151,386 行**。

### 2.3 超大文件 Top 30（src/，业务相关）

| LOC | 文件 | 优先级 |
|----:|------|--------|
| 3994 | `src/lib/jp-vocab-db.ts` | ★★★★★ |
| 3302 | `src/components/JpVocabPage.tsx` | ★★★★★ |
| 3250 | `src/components/JpLessonPage.tsx` | ★★★★★ |
| 3234 | `src/components/EnVocabPage.tsx` | ★★★★★ |
| 2891 | `src/components/JpLessonSchedulePage.tsx` | ★★★★★ |
| 2855 | `src/lib/en-vocab-db.ts` | ★★★★★ |
| 2580 | `src/components/AdminUsersPage.tsx` | ★★★★★ |
| 2370 | `src/components/EnLessonPage.tsx` | ★★★★★ |
| 1967 | `src/components/JpVocabEditModal.tsx` | ★★★★☆ |
| 1853 | `src/components/AdminJpLessonTeachersPage.tsx` | ★★★★☆ |
| 1790 | `src/i18n/messages.ts` | ★★★★☆ |
| 1726 | `src/components/JpLessonAnnotateModal.tsx` | ★★★★☆ |
| 1726 | `src/components/EnLessonAnnotateModal.tsx` | ★★★★☆ |
| 1661 | `src/lib/etr-auth-db.ts` | ★★★★☆ |
| 1586 | `src/components/EnLessonSchedulePage.tsx` | ★★★★☆ |
| 1520 | `src/components/JpVocabStudyPage.tsx` | ★★★★☆ |
| 1472 | `src/components/jp-vocab-page/JpVocabPageStyles.tsx` | ★★★★☆ |
| 1408 | `src/lib/ko-pron-db.ts` | ★★★★☆ |
| 1379 | `src/components/JpVocabManualAddModal.tsx` | ★★★★☆ |
| 1364 | `src/components/JpClassNotesEditModal.tsx` | ★★★★☆ |
| 1352 | `src/components/JpVocabTeacherQuizFlashcardStyles.tsx` | ★★★★☆ |
| 1312 | `src/components/EnVocabTeacherQuizFlashcardModal.tsx` | ★★★★☆ |
| 1286 | `src/components/JpLessonNotesPage.tsx` | ★★★★☆ |
| 1150 | `src/components/KoPronPage.tsx` | ★★★★☆ |
| 1135 | `src/components/EnVocabStudyPage.tsx` | ★★★★☆ |
| 1116 | `src/components/JpVocabTeacherQuizFlashcardModal.tsx` | ★★★★☆ |
| 1067 | `src/components/JpVocabRefEditModal.tsx` | ★★★★☆ |
| 1067 | `src/components/EnVocabRefEditModal.tsx` | ★★★★☆ |
| 1004 | `src/components/en-vocab-page/EnVocabPageStyles.tsx` | ★★★★☆ |

**CSS 超大（样式层，非业务逻辑）**：`src/app/mobile.css`（3914）、`src/app/globals.css`（3185）。

---

## 3. 目录结构

```
strategy-compare-cloud/
├── src/
│   ├── app/              # Next.js 路由 + API（98 个 route.ts）
│   ├── components/       # 149 个 TSX 组件 + 子目录
│   │   ├── jp-vocab-page/    # 日语抽背已拆：表、分页、样式
│   │   └── en-vocab-page/    # 英语抽背已拆：样式（表待拆）
│   ├── lib/              # 210 个 TS 模块（业务 + DB）
│   ├── hooks/            # 4 个 Hook（偏少，逻辑多在 Page 内）
│   ├── contexts/         # EtrAuthProvider 等
│   ├── i18n/             # messages.ts
│   ├── types/            # 共享类型
│   ├── store-review/     # 店铺评论子模块
│   └── tool-dot/         # 工具码转换
├── scripts/              # 定时任务、回归、维护中心
├── docs/                 # feature-index + 本套 AI 文档
├── .cursor/rules/        # Agent 必读规则
└── trend_aggregator/     # 独立 Python（非 Worker  bundle）
```

### 3.1 `src/app` 页面路由（节选）

| Path | 业务 |
|------|------|
| `/jp-vocab`, `/jp-vocab/admin`, `/jp-vocab/study`, `/jp-vocab/review`, `/jp-vocab/coach` | 日语抽问 |
| `/en-vocab`, `/en-vocab/admin`, `/en-vocab/study` | 英语抽背 |
| `/ko-pron`, `/ko-pron/admin`, `/ko-pron/study`, `/ko-pron/select`, `/ko-pron/review` | 韩语发音 |
| `/jp-lesson`, `/jp-lesson/schedule`, `/jp-lesson/notes` | 日语新课 |
| `/en-lesson`, `/en-lesson/schedule`, `/en-lesson/notes` | 英语新课 |
| `/admin/users`, `/admin/rbac`, `/admin/jp-lesson-teachers` | 管理后台 |
| `/store-review`, `/tool-dot` | 其它产品 |

（带 `/zh` 前缀为中文版镜像路由。）

---

## 4. 模块职责矩阵

| 模块 | 职责 | 入口 | DB | API 前缀 |
|------|------|------|-----|----------|
| **jp-vocab** | 日语单词/语法抽问、共享、带读、复习 | `JpVocabPage` | `jp-vocab-db.ts` | `/api/jp-vocab/*` |
| **en-vocab** | 英语抽背（用法+例句配对、按用法勾选） | `EnVocabPage` | `en-vocab-db.ts` | `/api/en-vocab/*` |
| **ko-pron** | 韩语发音抽问 | `KoPronPage` | `ko-pron-db.ts` | `/api/ko-pron/*` |
| **jp-lesson** | 日语新课上传、教案、进度 | `JpLessonPage` | `jp-lesson-db.ts` | `/api/jp-lesson/*` |
| **en-lesson** | 英语新课 | `EnLessonPage` | `en-lesson-db.ts` | `/api/en-lesson/*` |
| **schedule** | 统一日程（日/英/韩/手动） | `JpLessonSchedulePage` | `jp-lesson-manual-schedule.ts` 等 | `/api/jp-lesson/schedule` |
| **auth/rbac** | 登录、权限、用户 | `EtrAuthProvider` | `etr-auth-db.ts`, `rbac-db.ts` | `/api/etr/*`, `/api/admin/*` |
| **admin/users** | 用户管理、自动启禁 | `AdminUsersPage` | `etr-auth-db.ts` | `/api/admin/users/*` |

---

## 5. 依赖关系（摘要）

### 5.1 被引用最多的 `@/` 模块（全 src）

| 次数 | 模块 |
|-----:|------|
| 177 | `@/lib/types` |
| 104 | `@/lib/cloudflare-env` |
| 47 | `@/i18n/I18nProvider` |
| 43 | `@/contexts/EtrAuthProvider` |
| 42 | `@/lib/body-scroll-lock` |
| 41 | `@/lib/jp-vocab-daily-check` |
| 39 | `@/lib/locale-path` |
| 30 | `@/lib/jp-vocab-db` |
| 25 | `@/lib/en-vocab-db` |
| 18 | `@/components/JpVocabSaveProgressBar` |

**依赖方向（典型）**：

```
app/page.tsx → components/*Page.tsx → lib/*-db.ts → D1
                      ↓
              components/*Modal.tsx
                      ↓
              lib/*-shared.ts, *-auth.ts
```

### 5.2 层间规则（项目约定）

- **禁止** API route 内调大模型；重任务走 `scripts/`
- **禁止** middleware 访问 D1
- **禁止** 页面顶层静态 import 重依赖（jspdf/xlsx/recharts…）
- DB 层 `*-db.ts` 可被 API + 少数 server lib 引用；**不应**被 client 组件直接 import（`server-only` 标记部分文件）

---

## 6. 重复代码与镜像模块

### 6.1 日语 / 英语镜像（约 33 对组件 + 大量 lib 函数）

| 类型 | 日语 | 英语 | 已共享 |
|------|------|------|--------|
| 抽问主页 | `JpVocabPage` | `EnVocabPage` | 进度条、保存条、闪卡样式部分共享 |
| 学生端 | `JpVocabStudyPage` | `EnVocabStudyPage` | 闪卡 Modal 同名组件 |
| 新课列表 | `JpLessonPage` | `EnLessonPage` | `*-lesson-shared.ts` 各一份 |
| 日程 | `JpLessonSchedulePage` | `EnLessonSchedulePage` | 合并展示于 jp-lesson/schedule |
| 备注弹窗 | `JpClassNotesEditModal` | `EnClassNotesEditModal` | 图片上传 API 分离 |
| DB | `jp-vocab-db.ts` | `en-vocab-db.ts` | 结构高度相似，**未抽象** |

**镜像函数示例**（命名仅前缀不同）：`jpVocabRiskIndex` ↔ `enVocabRiskIndex`、`jpLessonRefDownloadFilename` ↔ `enLessonRefDownloadFilename` 等 25+ 对。

### 6.2 已存在的公共抽取（应继续复用）

| 类别 | 路径 | 用途 |
|------|------|------|
| 进度条 | `JpVocabSaveProgressBar.tsx`, `jp-vocab-save-progress.ts` | 日/英/韩保存 UI |
| 闪卡样式 | `JpVocabTeacherQuizFlashcardStyles.tsx` | 日/英抽问卡共用 CSS |
| 复制 | `copy-text.ts`, `CopyToast.tsx` | 全站复制反馈 |
| 滚动锁 | `body-scroll-lock.ts` | 弹窗防触控板卡死 |
| 路径 | `locale-path.ts` | 全站 path 常量 |
| 类型 | `types.ts` | EnVocabWord / JpVocabWord 等 |
| 抽背页共享 | `vocab-page-shared.ts`, `jp-vocab-page-*.ts` | 分页、缓存 helper |
| 鉴权壳 | `TeacherReviewAuth.tsx` | 全页登录 |

### 6.3 重复模式（尚未抽取）

- Page 内 **poll + sync + saveQueue** 三段式（Jp/En Vocab 各写一套）
- **recordLevel / recordUsageLevels / shareWord** 编排逻辑
- **AnnotateModal**（Jp/En 各 1726 行，几乎镜像）
- **RefEditModal**（1067×2）
- **ManualAddModal**（1379 / 957）

---

## 7. 公共组件 / 函数 / 类型 / Hook

### 7.1 公共组件（跨模块复用度高）

- `JpVocabSaveProgressBar` · `JpVocabDailyQuizProgressBar`
- `JpVocabSourceLabel` · `CopyToast`
- `TeacherReviewAuth` · `JpVocabTeacherQuizFlashcardModal`（en 复用）
- `EnClassNotesEditModal` / `JpClassNotesEditModal`（成对）
- `VocabRefImageZoom` · 各 `*RefPreviewModal`

### 7.2 公共函数（lib 导出 Top）

| 文件 | export 数（约） |
|------|----------------:|
| `locale-path.ts` | 84 |
| `jp-lesson-shared.ts` | 75 |
| `jp-vocab-db.ts` | 70 |
| `types.ts` | 60 |
| `etr-auth.ts` | 58 |
| `en-lesson-shared.ts` | 55 |

### 7.3 公共类型

- 主文件：`src/lib/types.ts`（EnVocabWord, JpVocabWord, EnVocabLevel…）
- 各 `*-shared.ts` 内局部类型

### 7.4 公共 Hook（仅 4 个 — **明显不足**）

| Hook | 文件 |
|------|------|
| `useSiteNavItems` | 顶栏导航 |
| `useSiteNavSplit` | 导航分组 |
| `useSaveProgressBar` | 保存条动画 |
| `useStoreReviewSubdomain` | 店铺评论子域 |

**建议新增 Hook（规划）**：`useVocabPollSync`、`useTeacherQuizSession`、`useReviewLockTimer` — 从 Page 内抽出，**不急于一次做完**。

### 7.5 公共工具

- `format-datetime.ts` · `client-swr-cache.ts` · `request-queue.ts`
- `jp-vocab-save-progress.ts` · `body-scroll-lock.ts` · `copy-text.ts`

---

## 8. API 概览

- **Route 文件数**：98（`src/app/api/**/route.ts`）
- **分组**：`jp-vocab/*` · `en-vocab/*` · `ko-pron/*` · `jp-lesson/*` · `en-lesson/*` · `admin/*` · `etr/*`

---

## 9. 重构候选（按用户优先级规则）

详见 `docs/REFACTOR_REPORT.md`。原则：

- **不**为减行数而拆；**按业务职责**拆
- 单文件目标 **200–600 行**；完整业务允许 **~800 行**；**>1000 行须说明**
- **每次只拆一个模块**，验证通过再继续

---

## 10. 扫描产物

- 机器可读：`tmp/refactor-scan.json`
- 功能索引（已有）：`docs/feature-index.md`
- AI 总索引（新建）：`docs/AI_INDEX.md`
- 修改路径（新建）：`docs/ROUTING.md`
- 依赖图（新建）：`docs/DEPENDENCY.md`
