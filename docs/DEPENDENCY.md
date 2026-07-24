# 依赖关系图（DEPENDENCY.md）

> 用于判断「改 A 会不会影响 B」。箭头：**A → B** 表示 A import 或调用 B。

---

## 1. 分层架构

```
┌──────────────────────────────────────────┐
│  Layer 4: app/*/page.tsx, app/api/**     │  路由入口
├──────────────────────────────────────────┤
│  Layer 3: components/*Page, *Modal       │  UI + 客户端编排
├──────────────────────────────────────────┤
│  Layer 2: lib/*-shared, *-review, hooks  │  纯逻辑 / 可复用
├──────────────────────────────────────────┤
│  Layer 1: lib/*-db.ts                    │  D1 读写（server）
├──────────────────────────────────────────┤
│  Layer 0: types.ts, cloudflare-env       │  基础类型 / 环境
└──────────────────────────────────────────┘
```

**规则**：
- Layer 3 **不应** import Layer 1 中带 `server-only` 的 db（通过 API 间接访问）
- Layer 1 **不应** import Layer 3 组件
- API route 可 import Layer 1 + Layer 2

---

## 2. 核心业务模块依赖

### 2.1 jp-vocab

```
JpVocabPage.tsx
  → jp-vocab-db.ts (仅类型/间接；列表走 API)
  → jp-vocab-review.ts
  → jp-vocab-teacher-visible.ts
  → jp-vocab-teacher-quiz.ts
  → jp-vocab-sync.ts
  → jp-vocab-page/JpVocabWordTable.tsx
  → JpVocabTeacherQuizFlashcardModal.tsx
  → JpVocabSaveProgressBar.tsx
  → EtrAuthProvider

/api/jp-vocab/route.ts
  → jp-vocab-db.ts
  → jp-vocab-auth.ts → rbac-db.ts
```

### 2.2 en-vocab

```
EnVocabPage.tsx
  → en-vocab-review.ts (含 isEnVocabWordReviewLocked)
  → en-vocab-teacher-quiz.ts
  → en-vocab-page/EnVocabPageStyles.tsx
  → EnVocabTeacherQuizFlashcardModal.tsx
  → JpVocabSaveProgressBar.tsx (共享)
  → JpVocabTeacherQuizFlashcardStyles.tsx (共享样式)

/api/en-vocab/route.ts
  → en-vocab-db.ts
  → en-vocab-auth.ts
```

### 2.3 jp-lesson ↔ jp-vocab

```
JpLessonPage.tsx
  → jp-lesson-db.ts
  → jp-lesson-shared.ts
  → (完成后) sync → jp_vocab_word

JpVocabPage.tsx
  ← 接收新课 sync 的词条（只读列表）
```

---

## 3. 横向共享依赖（改这里影响面大）

| 被依赖模块 | 引用次数级 | 主要消费者 |
|------------|------------|------------|
| `@/lib/types` | 177+ | 全项目 |
| `@/lib/cloudflare-env` | 104+ | 全部 API |
| `@/contexts/EtrAuthProvider` | 43+ | 所有需登录页 |
| `@/lib/locale-path` | 39+ | 导航、链接 |
| `@/lib/body-scroll-lock` | 42+ | 弹窗类组件 |
| `@/components/JpVocabSaveProgressBar` | 18+ | 日/英/韩保存 UI |
| `@/lib/jp-vocab-save-progress.ts` | 19+ | 进度条文案/动画 |

**修改这些文件前**：跑相关 `scripts/check_*.py`，并搜索全库引用。

---

## 4. 日语 ↔ 英语镜像依赖

```
JpVocabPage ───────────── EnVocabPage
     │                         │
     ├─ jp-vocab-*             ├─ en-vocab-*
     │                         │
     └─ JpVocab*Modal          └─ EnVocab*Modal (或共用 Jp* 组件)

jp-vocab-db.ts            en-vocab-db.ts
     │                         │
     └─ 结构平行，无直接 import ─┘
```

**注意**：改日语行为时，检查英语是否有镜像文件需要同步（见 `docs/project-analysis.md` §6）。

---

## 5. Hook 使用面

| Hook | 使用方 |
|------|--------|
| `useSiteNavItems` | 顶栏 Layout / 各 Page |
| `useSaveProgressBar` | 部分 Modal |
| `useStoreReviewSubdomain` | store-review 子模块 |

**Page 内联逻辑（未抽 Hook）**：poll、sync、teacherQuizSession — 分散在 JpVocabPage / EnVocabPage，**高耦合**。

---

## 6. API → DB 映射

| API | DB 入口函数（示例） |
|-----|---------------------|
| `POST /api/jp-vocab` | `recordJpVocabReview`, `setJpVocabDailyQuizTarget` |
| `POST /api/jp-vocab/share` | `shareJpVocabWord` |
| `GET /api/jp-vocab/shared` | `listJpVocabSharedToday` |
| `POST /api/en-vocab` | `recordEnVocabReviewWithUsageLevels` |
| `POST /api/jp-lesson/upload` | `createJpLesson`, `syncLessonToVocab` |
| `POST /api/etr/login` | `etr-auth-db` session |

---

## 7. 循环依赖风险

| 区域 | 风险 | 现状 |
|------|------|------|
| `jp-vocab-db` ↔ `jp-vocab-coach-db` | 中 | 通过函数调用，需保持单向 |
| Page ↔ Modal 互引 | 低 | Modal 仅 callback，无反向 import Page |
| lib 互引 | 低 | shared 模块尽量无 db 依赖 |

**建议**：新拆模块时 **db → shared → hooks → components**，禁止 shared import db。

---

## 8. 外部 / 非 Worker 依赖

| 路径 | 与主应用关系 |
|------|--------------|
| `trend_aggregator/` | 独立 Python，**不**打进 Worker bundle |
| `scripts/maintenance_center/` | 本机维护中心 :17823 |
| `wechat-jp-vocab-review/` | 微信小程序，调同一 API |
| Mac `scripts/*-fill-*-api.py` | 调 Ollama + 线上 API apply |

---

## 9. 影响范围速查

| 如果你改… | 必测… |
|-----------|--------|
| `jp-vocab-review.ts` | 日语抽问勾选、1h 锁、带读、coach |
| `en-vocab-review.ts` | 英语用法勾选、总体汇总、1h 锁 |
| `*-teacher-visible.ts` | 老师可见池、抽查进度条 |
| `JpVocabTeacherQuizFlashcardStyles.tsx` | 日/英/韩闪卡 UI |
| `locale-path.ts` | 全站导航链接 |
| `rbac.ts` / `etr-auth.ts` | 所有权限门控 |
| `schema.sql` | 迁移 + 全部 DB 模块 |

---

## 10. 机器辅助

- 扫描数据：`tmp/refactor-scan.json`
- 回归：`python3 scripts/check_*.py`（按模块选用）
