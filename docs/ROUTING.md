# 修改路径索引（ROUTING.md）

> 收到需求后：**先在本表定位链路**，再打开 `docs/feature-index.md` 查精确函数名。  
> 格式：`页面 → 组件 → lib/Hook → API → DB`

---

## 1. 鉴权 / 登录

```
/admin/users 用户管理
  → AdminUsersPage.tsx
  → etr-auth-db.ts / admin-user-validation.ts
  → GET|POST /api/admin/users
  → etr_user, etr_user_role

/en-vocab 须登录
  → EnVocabPage.tsx → TeacherReviewAuth
  → en-vocab-auth.ts → requireEnVocabRead
  → GET /api/en-vocab (401 if anonymous)
```

---

## 2. 日语抽问（jp-vocab）

### 2.1 勾选熟悉程度

```
/jp-vocab
  → JpVocabPage.tsx → recordLevel()
  → jp-vocab-review.ts (applyJpVocabReview, isJpVocabWordReviewLocked)
  → POST /api/jp-vocab { word_id, level }
  → jp-vocab-db.ts → recordJpVocabReview()
  → jp_vocab_word (cnt_*, last_review_*)
```

### 2.2 发给学生 / 共享

```
/jp-vocab 卡片「发给学生」
  → JpVocabPage.tsx → shareWord()
  → JpVocabSaveProgressBar
  → POST /api/jp-vocab/share
  → jp-vocab-db.ts → shareJpVocabWord()
  → jp_vocab_shared
```

### 2.3 学生 peek「查看老师正在抽查的单词」

```
/jp-vocab/study
  → JpVocabStudyPage.tsx → peekTeacherQuizWord()
  → POST /api/jp-vocab/teacher-quiz-live

/jp-vocab 老师端
  → JpVocabPage.tsx poll teacher-quiz-live
  → studentPeekedCurrentWord
  → JpVocabTeacherQuizFlashcardModal 顶栏提示
```

### 2.4 管理员设今日抽查数量

```
/jp-vocab/admin
  → JpVocabPage.tsx → setDailyQuizTarget()
  → JpVocabDailyQuizProgressBar
  → POST /api/jp-vocab { action: set_daily_quiz_target }
  → jp-vocab-db.ts → setJpVocabDailyQuizTarget()
  → jp_vocab_setting.teacher_visible_limit
```

---

## 3. 英语抽背（en-vocab）

### 3.1 按用法勾选 → 总体熟悉程度

```
/en-vocab 抽查卡
  → EnVocabPage.tsx → recordUsageLevels()
  → en-vocab-review.ts → aggregateEnVocabUsageLevels()
  → POST /api/en-vocab { usage_levels: [...] }
  → en-vocab-db.ts → recordEnVocabReviewWithUsageLevels()
  → en_vocab_word.last_usage_levels, last_review_level
```

### 3.2 1 小时内可改熟悉程度（用法/总体）

```
/en-vocab
  → isEnVocabWordReviewLocked()  ← 非 sharedTodayWordIds
  → EnVocabPage reviewLockedByWordId
  → EnVocabTeacherQuizFlashcardModal reviewLocked
  → POST /api/en-vocab → review_locked if ≥1h
```

### 3.3 学生已查看提示

```
/en-vocab/study peek
  → POST /api/en-vocab/teacher-quiz-live
  → en-vocab-db.ts peekEnVocabTeacherQuizLiveWord()

/en-vocab 老师卡
  → EnVocabPage poll → setStudentPeekedCurrentWord(true) 闩锁
  → EnVocabTeacherQuizFlashcardModal __student-peek-banner
  → 点「下一个」换词 → useEffect 清 false
```

### 3.4 须登录才能看

```
/en-vocab
  → TeacherReviewAuth (未登录)
  → GET /api/en-vocab → requireEnVocabRead → 401
  → GET /api/en-vocab/sync → requireEnVocabRead → 401
```

---

## 4. 新课（jp-lesson / en-lesson）

```
/jp-lesson 列表/上传/改状态
  → JpLessonPage.tsx（编排）
  → jp-lesson-page/（Styles、helpers、StatusTable）
  → jp-lesson-db.ts / jp-lesson-shared.ts
  → POST /api/jp-lesson/*
  → jp_lesson, jp_vocab_word (完成后 sync)

/jp-lesson/schedule
  → JpLessonSchedulePage.tsx（编排）
  → jp-lesson-schedule-page/（Styles、helpers）
  → jp-lesson-manual-schedule.ts
  → GET|POST /api/jp-lesson/schedule
```

（英语镜像：`EnLessonPage` → `en-lesson-*` → `/api/en-lesson/*`）

---

## 5. 用户管理 / 老师账号生命周期

```
/admin/users
  → AdminUsersPage.tsx
  → admin-users-cache.ts / teacher-user-schedule-enable.ts
  → /api/admin/users, /api/admin/users/reset-password

抽完自动禁用（日语）
  → jp-vocab-teacher-quiz-day.ts
  → POST /api/admin/teacher-user-quiz-complete-disable
  → Mac scripts/setup-teacher-user-quiz-complete-disable-mac.sh
```

---

## 6. AI 补全（Mac 定时，非页面）

```
日语例句
  → scripts/jp-vocab-fill-example-sentences-api.py
  → POST /api/jp-vocab/fill-example-sentences

英语音标/释义/用法/例句
  → scripts/en-vocab-fill-*-api.py
  → POST /api/en-vocab/fill-reading|meaning|usage|fill-example-sentences
  → 本机 Ollama + ollama_slot
```

---

## 7. 部署 / 维护

```
代码 push
  → .cursor/hooks/feature-remark-stop.py
  → 维护中心 :17823
  → npm run deploy → check_worker_bundle_size.py
```

---

## 8. 怎么用本表

1. 从**用户 URL 或中文功能名**确定模块（第 2–5 节）
2. 沿链路**从上到下**打开文件
3. 细节（函数名、边界条件）查 `docs/feature-index.md`
4. 改前读 `.cursor/rules/` 对应 `.mdc`
5. 改后跑 `scripts/check_*` 相关回归
