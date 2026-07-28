/** 学生端自用熟悉程度（仅本机；不写老师抽查统计、不轮询回老师） */

import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import type { EnVocabLevel, JpVocabLevel } from "@/lib/types";

type Lang = "jp" | "en";

type Store = {
  date: string;
  levels: Record<string, string>;
  usageLevels: Record<string, Array<string | null>>;
};

function storageKey(lang: Lang, userId: number): string {
  return `vocab-student-personal-level:v1:${lang}:${userId}`;
}

function emptyStore(): Store {
  return { date: beijingDateString(), levels: {}, usageLevels: {} };
}

function readStore(lang: Lang, userId: number): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(storageKey(lang, userId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const today = beijingDateString();
    if (parsed.date !== today) return emptyStore();
    return {
      date: today,
      levels: parsed.levels && typeof parsed.levels === "object" ? parsed.levels : {},
      usageLevels:
        parsed.usageLevels && typeof parsed.usageLevels === "object"
          ? parsed.usageLevels
          : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(lang: Lang, userId: number, store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(lang, userId), JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function readJpVocabStudentPersonalLevels(
  userId: number
): Record<number, JpVocabLevel> {
  const store = readStore("jp", userId);
  const out: Record<number, JpVocabLevel> = {};
  for (const [id, level] of Object.entries(store.levels)) {
    if (level === "very" || level === "normal" || level === "weak") {
      out[Number(id)] = level;
    }
  }
  return out;
}

export function writeJpVocabStudentPersonalLevel(
  userId: number,
  wordId: number,
  level: JpVocabLevel
): void {
  const store = readStore("jp", userId);
  store.date = beijingDateString();
  store.levels[String(wordId)] = level;
  writeStore("jp", userId, store);
}

export function readEnVocabStudentPersonalLevels(
  userId: number
): Record<number, EnVocabLevel> {
  const store = readStore("en", userId);
  const out: Record<number, EnVocabLevel> = {};
  for (const [id, level] of Object.entries(store.levels)) {
    if (level === "very" || level === "normal" || level === "weak") {
      out[Number(id)] = level;
    }
  }
  return out;
}

export function writeEnVocabStudentPersonalLevel(
  userId: number,
  wordId: number,
  level: EnVocabLevel
): void {
  const store = readStore("en", userId);
  store.date = beijingDateString();
  store.levels[String(wordId)] = level;
  writeStore("en", userId, store);
}

export function readEnVocabStudentPersonalUsageLevels(
  userId: number
): Record<number, Array<EnVocabLevel | null | undefined>> {
  const store = readStore("en", userId);
  const out: Record<number, Array<EnVocabLevel | null | undefined>> = {};
  for (const [id, levels] of Object.entries(store.usageLevels)) {
    if (!Array.isArray(levels)) continue;
    out[Number(id)] = levels.map((lv) =>
      lv === "very" || lv === "normal" || lv === "weak" ? lv : null
    );
  }
  return out;
}

export function writeEnVocabStudentPersonalUsageLevels(
  userId: number,
  wordId: number,
  levels: Array<EnVocabLevel | null | undefined>
): void {
  const store = readStore("en", userId);
  store.date = beijingDateString();
  store.usageLevels[String(wordId)] = levels.map((lv) =>
    lv === "very" || lv === "normal" || lv === "weak" ? lv : null
  );
  const complete = levels.every((lv) => lv === "very" || lv === "normal" || lv === "weak");
  if (complete) {
    // 自用总体档：取最严（weak > normal > very）便于「对自己严格」
    let worst: EnVocabLevel = "very";
    for (const lv of levels) {
      if (lv === "weak") worst = "weak";
      else if (lv === "normal" && worst !== "weak") worst = "normal";
    }
    store.levels[String(wordId)] = worst;
  }
  writeStore("en", userId, store);
}
