import { useEffect, useRef } from "react";
import { scrollLessonListItemIntoView } from "@/lib/lesson-list-scroll";

/** history.state 标记：随手画全屏层 */
export const LESSON_ANNOTATE_HISTORY_STATE_KEY = "lesson-annotate";

export type LessonAnnotateHistoryState = {
  [LESSON_ANNOTATE_HISTORY_STATE_KEY]: number;
};

export function isLessonAnnotateHistoryState(
  state: unknown
): state is LessonAnnotateHistoryState {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as LessonAnnotateHistoryState)[LESSON_ANNOTATE_HISTORY_STATE_KEY] ===
      "number"
  );
}

/**
 * 随手画打开时压一条 history：浏览器「返回」先关层并滚回对应课次，而不是离开 /jp-lesson。
 */
export function useLessonAnnotateBrowserBack(
  open: boolean,
  lessonId: number,
  onClose: () => void
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pushedRef = useRef(false);
  const pathWhenPushedRef = useRef("");

  useEffect(() => {
    if (!open || lessonId <= 0) return;

    const state: LessonAnnotateHistoryState = {
      [LESSON_ANNOTATE_HISTORY_STATE_KEY]: lessonId,
    };
    pathWhenPushedRef.current = window.location.pathname;
    window.history.pushState(state, "");
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      onCloseRef.current();
      scrollLessonListItemIntoView(lessonId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (
        pushedRef.current &&
        window.location.pathname === pathWhenPushedRef.current &&
        isLessonAnnotateHistoryState(window.history.state)
      ) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [open, lessonId]);
}
