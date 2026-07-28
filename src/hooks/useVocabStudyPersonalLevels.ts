"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnVocabLevel, JpVocabLevel } from "@/lib/types";
import {
  readEnVocabStudentPersonalLevels,
  readEnVocabStudentPersonalUsageLevels,
  readJpVocabStudentPersonalLevels,
  writeEnVocabStudentPersonalLevel,
  writeEnVocabStudentPersonalUsageLevels,
  writeJpVocabStudentPersonalLevel,
} from "@/lib/vocab-student-personal-level";

/** 日语今日单词：学生自用熟悉程度（本机，不同步老师） */
export function useJpVocabStudyPersonalLevels(userId: number | undefined) {
  const [personalLevels, setPersonalLevels] = useState<
    Record<number, JpVocabLevel>
  >({});

  useEffect(() => {
    if (userId == null) {
      setPersonalLevels({});
      return;
    }
    setPersonalLevels(readJpVocabStudentPersonalLevels(userId));
  }, [userId]);

  const setPersonalLevel = useCallback(
    (wordId: number, level: JpVocabLevel) => {
      if (userId == null) return;
      writeJpVocabStudentPersonalLevel(userId, wordId, level);
      setPersonalLevels((prev) => ({ ...prev, [wordId]: level }));
    },
    [userId]
  );

  return { personalLevels, setPersonalLevel };
}

/** 英语今日单词：学生自用熟悉程度 / 用法档（本机，不同步老师） */
export function useEnVocabStudyPersonalLevels(userId: number | undefined) {
  const [personalLevels, setPersonalLevels] = useState<
    Record<number, EnVocabLevel>
  >({});
  const [personalUsageLevels, setPersonalUsageLevels] = useState<
    Record<number, Array<EnVocabLevel | null | undefined>>
  >({});

  useEffect(() => {
    if (userId == null) {
      setPersonalLevels({});
      setPersonalUsageLevels({});
      return;
    }
    setPersonalLevels(readEnVocabStudentPersonalLevels(userId));
    setPersonalUsageLevels(readEnVocabStudentPersonalUsageLevels(userId));
  }, [userId]);

  const setPersonalLevel = useCallback(
    (wordId: number, level: EnVocabLevel) => {
      if (userId == null) return;
      writeEnVocabStudentPersonalLevel(userId, wordId, level);
      setPersonalLevels((prev) => ({ ...prev, [wordId]: level }));
    },
    [userId]
  );

  const setPersonalUsageLevelsForWord = useCallback(
    (wordId: number, levels: Array<EnVocabLevel | null | undefined>) => {
      if (userId == null) return;
      writeEnVocabStudentPersonalUsageLevels(userId, wordId, levels);
      setPersonalUsageLevels((prev) => ({ ...prev, [wordId]: levels }));
      const complete = levels.every(
        (lv) => lv === "very" || lv === "normal" || lv === "weak"
      );
      if (complete) {
        let worst: EnVocabLevel = "very";
        for (const lv of levels) {
          if (lv === "weak") worst = "weak";
          else if (lv === "normal" && worst !== "weak") worst = "normal";
        }
        setPersonalLevels((prev) => ({ ...prev, [wordId]: worst }));
      }
    },
    [userId]
  );

  return {
    personalLevels,
    personalUsageLevels,
    setPersonalLevel,
    setPersonalUsageLevelsForWord,
  };
}
