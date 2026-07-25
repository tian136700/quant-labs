import {
  enVocabPath,
  isEnVocabRefPath,
  isEnVocabTeacherAllowedPath,
  isJpVocabRefPath,
  isJpVocabTeacherAllowedPath,
  isKoPronTeacherAllowedPath,
  jpVocabPath,
  koPronPath,
} from "@/lib/locale-path";

export type SubjectTeacherNavFlags = {
  jp: boolean;
  en: boolean;
  ko: boolean;
};

/** 是否属于「科目老师导航」受限账号（无完整导航） */
export function isSubjectTeacherNavRestricted(
  flags: SubjectTeacherNavFlags,
  hasFullNav: boolean
): boolean {
  if (hasFullNav) return false;
  return flags.jp || flags.en || flags.ko;
}

/**
 * 多科目老师取并集：日语+韩语可同时进日语新课查看页与韩语抽问。
 * 教案查看页（/jp-vocab/ref、/en-vocab/ref）始终放行（发给老师的分享链接）。
 */
export function isPathAllowedForSubjectTeachers(
  pathname: string,
  flags: SubjectTeacherNavFlags
): boolean {
  if (isJpVocabRefPath(pathname) || isEnVocabRefPath(pathname)) {
    return true;
  }
  if (flags.jp && isJpVocabTeacherAllowedPath(pathname)) return true;
  if (flags.en && isEnVocabTeacherAllowedPath(pathname)) return true;
  if (flags.ko && isKoPronTeacherAllowedPath(pathname)) return true;
  return false;
}

/** 越权时回跳：主科目优先日语 → 英语 → 韩语（与 teacherModules 主角色一致） */
export function subjectTeacherHomePath(flags: SubjectTeacherNavFlags): string {
  if (flags.jp) return jpVocabPath();
  if (flags.en) return enVocabPath();
  return koPronPath();
}
