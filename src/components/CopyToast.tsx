"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VISIBLE_MS = 1800;
const FADE_MS = 350;

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export function CopyToast({ message, onDismiss }: Props) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!message) {
      setLeaving(false);
      return;
    }

    setLeaving(false);
    const leaveTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const dismissTimer = window.setTimeout(() => {
      onDismissRef.current();
      setLeaving(false);
    }, VISIBLE_MS + FADE_MS);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [message]);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      className={`copy-toast${leaving ? " copy-toast--leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </div>,
    document.body
  );
}
