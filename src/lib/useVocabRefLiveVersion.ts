"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeVocabRefUpdated,
  VOCAB_REF_LIVE_POLL_HIDDEN_MS,
  VOCAB_REF_LIVE_POLL_MS,
  vocabRefMetaApiPath,
  type VocabRefMetaResponse,
  type VocabRefSubject,
} from "@/lib/vocab-ref-live";

/**
 * 查看页 live `?v=`：仅当服务端 updated_at 因保存而变化时更新。
 * 不整页 reload；探测失败静默忽略。
 */
export function useVocabRefLiveVersion(opts: {
  subject: VocabRefSubject;
  refKey: string;
  initialUpdatedAt: string | null | undefined;
}): { liveUpdatedAt: string | null; banner: string | null } {
  const { subject, refKey, initialUpdatedAt } = opts;
  const initial = (initialUpdatedAt || "").trim() || null;
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(initial);
  const [banner, setBanner] = useState<string | null>(null);
  const liveRef = useRef(liveUpdatedAt);
  liveRef.current = liveUpdatedAt;

  useEffect(() => {
    const next = (initialUpdatedAt || "").trim() || null;
    setLiveUpdatedAt(next);
    setBanner(null);
  }, [refKey, initialUpdatedAt]);

  useEffect(() => {
    if (!refKey) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;

    const applyUpdatedAt = (next: string, showBanner: boolean) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === liveRef.current) return;
      liveRef.current = trimmed;
      setLiveUpdatedAt(trimmed);
      if (showBanner) {
        setBanner("教案已更新");
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => {
          if (!cancelled) setBanner(null);
        }, 2500);
      }
    };

    const pollMs = () =>
      document.hidden ? VOCAB_REF_LIVE_POLL_HIDDEN_MS : VOCAB_REF_LIVE_POLL_MS;

    const fetchMeta = async () => {
      try {
        const res = await fetch(vocabRefMetaApiPath(subject, refKey), {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as VocabRefMetaResponse;
        if (cancelled || typeof data.updated_at !== "string") return;
        applyUpdatedAt(data.updated_at, true);
      } catch {
        /* network / parse — ignore */
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchMeta().finally(() => {
          if (!cancelled) schedule();
        });
      }, pollMs());
    };

    const onVisibility = () => {
      if (document.hidden) return;
      void fetchMeta();
      schedule();
    };

    const unsub = subscribeVocabRefUpdated((detail) => {
      if (detail.subject !== subject || detail.refKey !== refKey) return;
      applyUpdatedAt(detail.updatedAt, true);
    });

    schedule();
    window.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (bannerTimer) clearTimeout(bannerTimer);
      window.removeEventListener("visibilitychange", onVisibility);
      unsub();
    };
  }, [subject, refKey]);

  return { liveUpdatedAt, banner };
}
