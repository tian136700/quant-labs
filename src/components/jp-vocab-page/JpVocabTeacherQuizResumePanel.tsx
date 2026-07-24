"use client";

type JpVocabTeacherQuizResumePanelProps = {
  showQuizFlashcard: boolean;
  onResume: () => void;
};

export function JpVocabTeacherQuizResumePanel({
  showQuizFlashcard,
  onResume,
}: JpVocabTeacherQuizResumePanelProps) {
  return (
    <div className="jp-vocab-teacher-quiz-resume" role="status">
      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        今日抽查进行中，请在单词卡片内逐词勾选熟悉程度。
      </p>
      {!showQuizFlashcard ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary"
          onClick={onResume}
        >
          继续抽查
        </button>
      ) : null}
    </div>
  );
}
