"use client";

import { useState } from "react";
import { JpVocabDailyQuizCompleteModal } from "@/components/JpVocabDailyQuizCompleteModal";

/**
 * 本地预览老师端「本轮单词已抽查完成」弹窗。
 * 仅本机调试用：http://127.0.0.1:3002/debug-jp-vocab-quiz-complete
 */
export default function DebugJpVocabQuizCompletePage() {
  const [open, setOpen] = useState(true);

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", background: "#0f1419" }}>
      <h1 style={{ margin: "0 0 0.75rem", color: "#e8eef5", fontSize: "1.1rem" }}>
        日语抽问 · 完成弹窗预览
      </h1>
      <p style={{ margin: "0 0 1rem", color: "#9aa7b5", fontSize: "0.9rem" }}>
        下面就是老师抽完本轮最后一个词时弹出的框（文案与线上一致）。
      </p>
      <button
        type="button"
        className="btn-rsi-filter btn-rsi-filter--primary"
        onClick={() => setOpen(true)}
      >
        再次打开弹窗
      </button>

      <JpVocabDailyQuizCompleteModal
        open={open}
        total={10}
        variant="teacher"
        flashcardStillOpen
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
