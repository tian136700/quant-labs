#!/usr/bin/env python3
"""回归：英语老师端「已抽完仍显示还剩 N」——今日目标不得因关 sync 而不拉。"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def main() -> int:
    errors: list[str] = []

    sync = read("src/hooks/useEnVocabPageSync.ts")
    # 关 enableBackgroundSyncPoll 后仍须轮询 teacher-visible（不得整段 early return）
    if re.search(
        r"if\s*\(\s*!enableBackgroundSyncPoll\s*\)\s*return\s*;",
        sync,
    ):
        # 允许在 pollDelay 内分支，禁止整段 effect 开头直接 return 跳过拉目标
        # 找到 teacher-visible effect：若先 return 再 pollDelay 则失败
        m = re.search(
            r"今日抽查数量[\s\S]{0,400}?useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[",
            sync,
        )
        if not m:
            errors.append("useEnVocabPageSync: 找不到今日抽查数量 / teacher-visible useEffect")
        else:
            body = m.group(1)
            # 开头几行内不得因 !enableBackgroundSyncPoll 直接 return 掉整个 effect
            head = body[:280]
            if re.search(
                r"if\s*\(\s*!enableBackgroundSyncPoll\s*\)\s*return\s*;",
                head,
            ):
                errors.append(
                    "useEnVocabPageSync: 关 sync 后不得跳过 teacher-visible 轮询"
                    "（旧分母会导致已抽 25 仍显示还剩 10）"
                )

    if "TEACHER_VISIBLE_ONLY_ACTIVE_MS" not in sync:
        errors.append(
            "useEnVocabPageSync: 须有关 sync 后的低频 teacher-visible 间隔常量"
        )
    if "syncTeacherVisibleLimitFromServer" not in sync or "return {" not in sync:
        errors.append("useEnVocabPageSync: 须 export syncTeacherVisibleLimitFromServer")
    if "Promise<\n    EnVocabTeacherVisibleLimit | null" not in sync and (
        "Promise<EnVocabTeacherVisibleLimit | null>" not in sync
        and "EnVocabTeacherVisibleLimit | null" not in sync
    ):
        # 宽松：返回值类型含 EnVocabTeacherVisibleLimit | null
        if "EnVocabTeacherVisibleLimit | null" not in sync:
            errors.append(
                "useEnVocabPageSync: syncTeacherVisibleLimitFromServer 须返回最新 limit"
            )

    quiz = read("src/hooks/useEnVocabTeacherQuiz.ts")
    if "syncTeacherVisibleLimitFromServer" not in quiz:
        errors.append("useEnVocabTeacherQuiz: 开抽前须接 syncTeacherVisibleLimitFromServer")
    if "isEnVocabWordInTeacherVisiblePool" not in quiz:
        errors.append("useEnVocabTeacherQuiz: 开抽须用返回的 limit 立刻重建可见池")

    progress = read("src/lib/en-vocab-daily-quiz-progress.ts")
    if re.search(
        r"forceComplete[\s\S]{0,120}return\s*\{\s*total:\s*0\s*,\s*checked:\s*0",
        progress,
    ):
        errors.append(
            "computeEnVocabTeacherPageQuizProgress: forceComplete 禁止 total:0"
            "（完成态须保留今日池分母）"
        )

    page = read("src/components/EnVocabPage.tsx")
    if "syncTeacherVisibleLimitFromServer" not in page:
        errors.append("EnVocabPage: 须把 syncTeacherVisibleLimitFromServer 传给抽查 hook")

    m = re.search(
        r"const\s*\{([^}]+)\}\s*=\s*useEnVocabPageSync",
        page,
        re.S,
    )
    if not m:
        errors.append("EnVocabPage: 找不到 useEnVocabPageSync 解构")
    else:
        names = re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\b", m.group(1))
        names = [n for n in names if n != "as"]
        dup = sorted({n for n in names if names.count(n) > 1})
        if dup:
            errors.append(
                f"EnVocabPage: useEnVocabPageSync 解构重复: {', '.join(dup)}"
            )

    if errors:
        print("check_en_vocab_quiz_target_stale_remaining: FAIL")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("check_en_vocab_quiz_target_stale_remaining: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
