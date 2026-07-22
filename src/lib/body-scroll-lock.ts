/**
 * Refcounted document.body overflow lock.
 * Nested modals must share this — saving/restoring style.overflow independently
 * can leave body stuck at overflow:hidden after the inner modal closes.
 */
let lockCount = 0;
let previousOverflow = "";

export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow;
    }
  };
}
