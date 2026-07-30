import type { JpLessonRecord } from "@/lib/types";

/** 同一 course_group_id 下的单词 + 语法配对 */
export type JpLessonCoursePair = {
  courseGroupId: string;
  courseLabel: string;
  wordLesson: JpLessonRecord;
  grammarLesson: JpLessonRecord;
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
