"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  JP_VOCAB_POLL_MS,
  JP_VOCAB_POLL_HIDDEN_MS,
  JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_HIDDEN_MS,
  JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_MS,
  jpVocabPollIntervalMs,
} from "@/lib/jp-vocab-sync";
import { JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED } from "@/lib/jp-vocab-share-ui";
import type { JpVocabShareRequest } from "@/lib/types";

export function useJpVocabShareRequests(options: {
  canOperate: boolean;
  teacherIdleCompleteRef: MutableRefObject<boolean>;
  setStatus: (message: string) => void;
  username?: string | null;
}) {
  const { canOperate, teacherIdleCompleteRef, setStatus, username } = options;
  const usernameRef = useRef(username);
  usernameRef.current = username;

  const [shareRequests, setShareRequests] = useState<JpVocabShareRequest[]>([]);
  const [showShareRequestModal, setShowShareRequestModal] = useState(false);
  const shareRequestPollInFlightRef = useRef(false);
  const dismissingShareRequestsRef = useRef(false);

  useEffect(() => {
    if (!canOperate || !JP_VOCAB_STUDENT_REQUEST_SHARE_ENABLED) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollDelay = () =>
      jpVocabPollIntervalMs(
        JP_VOCAB_POLL_MS,
        JP_VOCAB_POLL_HIDDEN_MS,
        JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_MS,
        JP_VOCAB_SHARE_REQUEST_POLL_IDLE_COMPLETE_HIDDEN_MS,
        teacherIdleCompleteRef.current,
        { username: usernameRef.current }
      );

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      if (shareRequestPollInFlightRef.current) {
        schedule(pollDelay());
        return;
      }
      shareRequestPollInFlightRef.current = true;
      try {
        const res = await fetch("/api/jp-vocab/share-request", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: JpVocabShareRequest[];
        };
        if (data.ok && Array.isArray(data.items)) {
          setShareRequests(data.items);
          if (data.items.length > 0 && !dismissingShareRequestsRef.current) {
            setShowShareRequestModal(true);
          }
        }
      } catch {
        /* 轮询失败静默 */
      } finally {
        shareRequestPollInFlightRef.current = false;
        if (!cancelled) schedule(pollDelay());
      }
    };

    schedule(JP_VOCAB_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canOperate, teacherIdleCompleteRef, username]);

  const dismissShareRequests = useCallback(async () => {
    const ids = shareRequests.map((r) => r.id);
    if (!ids.length) {
      setShowShareRequestModal(false);
      return;
    }
    dismissingShareRequestsRef.current = true;
    setShowShareRequestModal(false);
    setStatus("请在单词表中找到刚才抽查的单词，点击「发给学生」。");
    try {
      const res = await fetch("/api/jp-vocab/share-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ request_ids: ids }),
      });
      if (res.ok) {
        setShareRequests([]);
      }
    } catch {
      /* 忽略 */
    } finally {
      dismissingShareRequestsRef.current = false;
    }
  }, [shareRequests, setStatus]);

  return {
    shareRequests,
    showShareRequestModal,
    setShowShareRequestModal,
    dismissShareRequests,
  };
}
