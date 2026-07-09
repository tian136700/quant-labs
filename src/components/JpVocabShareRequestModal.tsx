"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JpVocabShareRequest } from "@/lib/types";

const VISIBLE_MS = 3000;
const FADE_MS = 600;

type Props = {
  open: boolean;
  requests: JpVocabShareRequest[];
  onClose: () => void;
};

function formatStudentNames(requests: JpVocabShareRequest[]): string {
  const names = [...new Set(requests.map((r) => r.requested_by))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}、${names[1]}`;
  return `${names.slice(0, 2).join("、")} 等 ${names.length} 人`;
}

export function JpVocabShareRequestModal({ open, requests, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");
  const onCloseRef = useRef(onClose);
  const closedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const beginLeave = useCallback(() => {
    setPhase((prev) => (prev === "hidden" ? prev : "leaving"));
  }, []);

  const requestKey = requests
    .map((r) => r.id)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!open || requests.length === 0) {
      setPhase("hidden");
      closedRef.current = false;
      return;
    }

    closedRef.current = false;
    setPhase("visible");
    const timer = window.setTimeout(beginLeave, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [open, requestKey, requests.length, beginLeave]);

  useEffect(() => {
    if (phase !== "leaving" || closedRef.current) return;

    const timer = window.setTimeout(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onCloseRef.current();
    }, FADE_MS);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const handleClose = useCallback(() => {
    beginLeave();
  }, [beginLeave]);

  if (!mounted || !open || requests.length === 0 || phase === "hidden") return null;

  const studentLabel = formatStudentNames(requests);
  const leaving = phase === "leaving";

  return createPortal(
    <div
      className={`jp-vocab-share-request-toast${leaving ? " jp-vocab-share-request-toast--leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        type="button"
        className="jp-vocab-share-request-toast__close"
        aria-label="关闭"
        onClick={handleClose}
      >
        ×
      </button>
      <p className="jp-vocab-share-request-toast__title">学生协助请求</p>
      <p className="jp-vocab-share-request-toast__body">
        学生<strong>「{studentLabel}」</strong>
        请求你将<strong>当前抽查的单词</strong>
        发到「今日日语单词」。请找到该词，点
        <span className="jp-vocab-intro-send-label">「发给学生」</span>。
      </p>
      <style jsx>{`
        .jp-vocab-share-request-toast {
          position: fixed;
          right: clamp(0.75rem, 2vw, 1.25rem);
          bottom: clamp(0.75rem, 2vw, 1.25rem);
          z-index: 1000;
          width: min(22rem, calc(100vw - 1.5rem));
          padding: 0.85rem 2.1rem 0.85rem 0.95rem;
          background: var(--panel);
          border: 1px solid color-mix(in srgb, var(--rise) 28%, var(--border));
          border-radius: 10px;
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28);
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity ${FADE_MS}ms ease,
            transform ${FADE_MS}ms ease;
          pointer-events: auto;
        }
        .jp-vocab-share-request-toast--leaving {
          opacity: 0;
          transform: translateY(0.5rem);
          pointer-events: none;
        }
        .jp-vocab-share-request-toast__close {
          position: absolute;
          top: 0.35rem;
          right: 0.4rem;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.6rem;
          height: 1.6rem;
          padding: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 1.2rem;
          line-height: 1;
          cursor: pointer;
        }
        .jp-vocab-share-request-toast__close:hover {
          color: var(--text);
          background: color-mix(in srgb, var(--text) 8%, transparent);
        }
        .jp-vocab-share-request-toast__title {
          margin: 0 0 0.35rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text);
        }
        .jp-vocab-share-request-toast__body {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.55;
          color: var(--text);
        }
        @media (max-width: 480px) {
          .jp-vocab-share-request-toast {
            right: 0.65rem;
            bottom: 0.65rem;
            width: calc(100vw - 1.3rem);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
