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

## 2. 已完成的代码改动（本会话前/中，非本次批量重构）

以下改动**已落地**，与重构目标一致，**功能已验证**（回归脚本通过）：

| 改动 | 文件 | 目的 |
|------|------|------|
| 英语 1h 熟悉程度锁（非共享锁） | `en-vocab-review.ts`, `en-vocab-db.ts`, `EnVocabPage` | 学生 peek 后仍可改 |
| 学生已查看顶栏横幅 | `EnVocabTeacherQuizFlashcardModal`, 样式 | 醒目 + 钉到下一个 |
| 英语须登录 | `EnVocabPage` + API `requireEnVocabRead` | 不对网友开放 |
| 样式拆分 | `en-vocab-page/EnVocabPageStyles.tsx` | EnVocabPage 3234→~3200 行 |

**未在本报告阶段继续拆分的文件**：见 §3。

---

## 3. 建议拆分清单（按优先级，待逐模块执行）

### ★★★★★ 必须分析/拆分

| 文件 | LOC | 职责分析 | 建议 |
|------|----:|----------|------|
| `jp-vocab-db.ts` | 3994 | **多职责**：schema、seed、CRUD、shared、review、teacher-visible、coach、fill | 按域拆为 `jp-vocab-db/` 目录：`word.ts`, `shared.ts`, `review.ts`, `visible.ts`；**保留** re-export 入口兼容 |
| `en-vocab-db.ts` | 2855 | 同上（英语） | 与日语对称拆分 |
| `JpVocabPage.tsx` | 3302 | 编排+表格+poll+quiz+export | **继续** jp-vocab-page 模式：抽 `useJpVocabPoll`, `JpVocabToolbar`, 对齐 WordTable |
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
