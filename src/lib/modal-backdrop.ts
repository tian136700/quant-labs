import type { MouseEvent as ReactMouseEvent } from "react";

/** 仅在遮罩空白处按下鼠标时关闭，避免 textarea 拖选时 mouseup 落在遮罩误触 onClick */
export function closeModalOnBackdropMouseDown(
  e: ReactMouseEvent<HTMLElement>,
  onClose: () => void
) {
  if (e.target === e.currentTarget) onClose();
}
