"use client";

import { useCallback, useEffect, useState } from "react";

const RECENT_KEY = "nav-recent-v1";
const FAVORITES_KEY = "nav-favorites-v1";
const COUNTS_KEY = "nav-visit-counts-v1";
const MAX_RECENT = 5;

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeList(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

function readCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCounts(counts: Record<string, number>) {
  try {
    localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useNavPreferences() {
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setRecent(readList(RECENT_KEY));
    setFavorites(readList(FAVORITES_KEY));
    setVisitCounts(readCounts());
  }, []);

  const recordVisit = useCallback((id: string) => {
    setRecent((prev) => {
      if (prev[0] === id) return prev;
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
      writeList(RECENT_KEY, next);
      return next;
    });
    setVisitCounts((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      writeCounts(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      writeList(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites]
  );

  return { recent, favorites, visitCounts, recordVisit, toggleFavorite, isFavorite };
}
