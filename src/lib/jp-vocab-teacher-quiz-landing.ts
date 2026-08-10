/** 老师端开场/进行中藏词表可见性（对齐英语）。 */

export function resolveJpVocabTeacherQuizListVisibility(opts: {
  canOperate: boolean;
  isAdminMode: boolean;
  dailyQuizComplete: boolean;
  displayQuizComplete: boolean;
  teacherQuizInProgress: boolean;
}): {
  hideTeacherQuizList: boolean;
  showTeacherQuizStartLanding: boolean;
} {
  const teacherQuizRoundOpen =
    opts.canOperate &&
    !opts.isAdminMode &&
    !opts.dailyQuizComplete &&
    !opts.displayQuizComplete;
  return {
    hideTeacherQuizList: teacherQuizRoundOpen,
    showTeacherQuizStartLanding:
      teacherQuizRoundOpen && !opts.teacherQuizInProgress,
  };
}
