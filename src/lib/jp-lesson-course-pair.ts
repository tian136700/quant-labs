import type { JpLessonDisplayGroup } from "@/lib/jp-lesson-shared";
import type { JpLessonRecord } from "@/lib/types";

/** 同一 course_group_id 下的单词 + 语法配对 */
export type JpLessonCoursePair = {
  courseGroupId: string;
  courseLabel: string;
  wordLesson: JpLessonRecord;
  grammarLesson: JpLessonRecord;
};

export type JpLessonCourseColPlan =
  | {
      mode: "empty";
    }
  | {
      mode: "label-only";
      courseLabel: string;
    }
  | {
      mode: "pair";
      pair: JpLessonCoursePair;
      /** 跨相邻 display group 时第二行省略教材格 */
      rowspan: 1 | 2;
      skip: boolean;
    };

function preferWordThenGrammar(
  a: JpLessonRecord,
  b: JpLessonRecord
): { word: JpLessonRecord; grammar: JpLessonRecord } | null {
  const aWord = a.kind === "word" || a.kind === "word_grammar";
  const bWord = b.kind === "word" || b.kind === "word_grammar";
  const aGrammar = a.kind === "grammar" || a.kind === "word_grammar";
  const bGrammar = b.kind === "grammar" || b.kind === "word_grammar";
  if (aWord && bGrammar && a.kind !== b.kind) {
    return { word: a, grammar: b };
  }
  if (bWord && aGrammar && a.kind !== b.kind) {
    return { word: b, grammar: a };
  }
  return null;
}

/** 从一组课次里取出完整 word+grammar 配对（按 course_group_id） */
export function buildJpLessonCoursePairMap(
  lessons: JpLessonRecord[]
): Map<string, JpLessonCoursePair> {
  const byGroup = new Map<string, JpLessonRecord[]>();
  for (const lesson of lessons) {
    const gid = (lesson.course_group_id || "").trim();
    if (!gid) continue;
    const list = byGroup.get(gid) ?? [];
    list.push(lesson);
    byGroup.set(gid, list);
  }

  const pairs = new Map<string, JpLessonCoursePair>();
  for (const [gid, list] of byGroup) {
    if (list.length < 2) continue;
    let found: JpLessonCoursePair | null = null;
    for (let i = 0; i < list.length && !found; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ordered = preferWordThenGrammar(list[i], list[j]);
        if (!ordered) continue;
        found = {
          courseGroupId: gid,
          courseLabel:
            (ordered.word.course_label || ordered.grammar.course_label || "").trim() ||
            gid,
          wordLesson: ordered.word,
          grammarLesson: ordered.grammar,
        };
        break;
      }
    }
    if (found) pairs.set(gid, found);
  }
  return pairs;
}

/**
 * 为每个 display group 规划教材列：
 * - 同组内已有 word+grammar → 一格 + 复制整课
 * - 相邻两组各一条且同 course_group_id → rowspan=2
 * - 无配对 → 只显示本行 course_label / —
 */
export function planJpLessonCourseColumns(
  displayGroups: JpLessonDisplayGroup<JpLessonRecord>[],
  allLessonsInSection: JpLessonRecord[]
): JpLessonCourseColPlan[] {
  const pairs = buildJpLessonCoursePairMap(allLessonsInSection);
  const plans: JpLessonCourseColPlan[] = new Array(displayGroups.length);
  const consumed = new Set<string>();

  for (let i = 0; i < displayGroups.length; i++) {
    if (plans[i]) continue;
    const group = displayGroups[i];
    const lessons = group.lessons;

    const inGroupPair = (() => {
      if (lessons.length < 2) return null;
      for (let a = 0; a < lessons.length; a++) {
        for (let b = a + 1; b < lessons.length; b++) {
          const gid = (lessons[a].course_group_id || "").trim();
          if (!gid || gid !== (lessons[b].course_group_id || "").trim()) continue;
          const pair = pairs.get(gid);
          if (pair) return pair;
        }
      }
      return null;
    })();

    if (inGroupPair && !consumed.has(inGroupPair.courseGroupId)) {
      consumed.add(inGroupPair.courseGroupId);
      plans[i] = { mode: "pair", pair: inGroupPair, rowspan: 1, skip: false };
      continue;
    }

    const solo = lessons.length === 1 ? lessons[0] : null;
    const gid = solo ? (solo.course_group_id || "").trim() : "";
    const pair = gid ? pairs.get(gid) : undefined;

    if (
      solo &&
      pair &&
      !consumed.has(gid) &&
      i + 1 < displayGroups.length &&
      displayGroups[i + 1].lessons.length === 1
    ) {
      const next = displayGroups[i + 1].lessons[0];
      const nextGid = (next.course_group_id || "").trim();
      if (
        nextGid === gid &&
        (solo.id === pair.wordLesson.id || solo.id === pair.grammarLesson.id) &&
        (next.id === pair.wordLesson.id || next.id === pair.grammarLesson.id) &&
        solo.id !== next.id
      ) {
        consumed.add(gid);
        plans[i] = { mode: "pair", pair, rowspan: 2, skip: false };
        plans[i + 1] = { mode: "pair", pair, rowspan: 2, skip: true };
        continue;
      }
    }

    if (solo && pair && !consumed.has(gid)) {
      // 配对存在但不在相邻行：本行出复制按钮，不 rowspan
      consumed.add(gid);
      plans[i] = { mode: "pair", pair, rowspan: 1, skip: false };
      continue;
    }

    if (solo && pair && consumed.has(gid)) {
      plans[i] = { mode: "empty" };
      continue;
    }

    const label = (solo?.course_label || lessons.find((l) => l.course_label)?.course_label || "")
      .trim();
    if (label) {
      plans[i] = { mode: "label-only", courseLabel: label };
    } else {
      plans[i] = { mode: "empty" };
    }
  }

  for (let i = 0; i < plans.length; i++) {
    if (!plans[i]) plans[i] = { mode: "empty" };
  }
  return plans;
}

/** 手机卡片：同一 course_group_id 只在「锚点」课次（优先单词）展示教材 + 复制整课 */
export function isJpLessonCourseMobileAnchor(
  lesson: JpLessonRecord,
  pairs: Map<string, JpLessonCoursePair>
): boolean {
  const gid = (lesson.course_group_id || "").trim();
  if (!gid) return Boolean(lesson.course_label);
  const pair = pairs.get(gid);
  if (!pair) return Boolean(lesson.course_label);
  return lesson.id === pair.wordLesson.id;
}
