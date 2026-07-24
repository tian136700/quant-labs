"use client";

/** 老师抽查卡片右上角计时器：MM:SS（从 00:00 起计，不落库） */
export function formatEnVocabQuizElapsedLabel(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const LEVELS: { key: EnVocabLevel; label: string }[] = [
  { key: "very", label: "非常熟悉" },
  { key: "normal", label: "一般" },
  { key: "weak", label: "不熟悉" },
];

export const LEVEL_LABEL: Record<EnVocabLevel, string> = {
  very: "非常熟悉",
  normal: "一般",
  weak: "不熟悉",
};
export export const EN_VOCAB_LEVEL_SYNC_HINT_SHORT = "勾选后同步给学生复习查看";
export const EN_VOCAB_LEVEL_SYNC_HINT = "勾选后，该单词将同步给学生复习查看";
export export export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED_SHORT = "已共享给学生，勾选仅更新熟悉程度";
export export const EN_VOCAB_LEVEL_SYNC_HINT_ALREADY_SHARED =
  "已共享给学生，勾选熟悉程度仅更新记录，不会重复发送";

/** 多条历史备注合并为展示用正文（不含时间戳行） */
export function formatEnVocabClassNotesForDisplay(raw: string | null | undefined): string {
  return parseEnVocabClassNotes(raw)
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

type Props = {
  open: boolean;
  session: EnVocabTeacherQuizSession | null;
  wordsById: Map<number, EnVocabWord>;
  refs: Record<string, EnVocabRef>;
  locale: "zh" | "en";
  displayOrder: EnVocabDailyDisplayOrder;
  sessionLevel: Record<number, EnVocabLevel | undefined>;
  /** 按用法勾选草稿 / 已选（与编号用法条数对齐） */
  sessionUsageLevels?: Record<number, Array<EnVocabLevel | null | undefined>>;
  reviewLockedByWordId: Record<number, boolean>;
  savingWordId: number | null;
  wordSyncState?: Record<number, "queued" | "syncing">;
  dailySeqByWordId: ReadonlyMap<number, number>;
  /** 今日抽查进度（队列仅含未抽查词时，进度条仍按今日目标 已抽/总数 展示） */
  dailyQuizProgress?: EnVocabDailyQuizProgress | null;
  canOperate?: boolean;
  shareUiEnabled?: boolean;
  shareProgressMap?: Record<number, number>;
  sharedTodayWordIds?: ReadonlySet<number>;
  /** 学生已自行查看老师当前抽查词 */
  studentPeeked?: boolean;
  /** 管理员预览抽问卡片样式（只读，不写熟悉程度/不同步给学生） */
  previewMode?: boolean;
  /** 老师抽问 / 学生端今日共享：复用同一套抽问卡片 UI */
  mode?: "quiz" | "study";
  onClose: () => void;
  /** 最后一词勾选后点「完成」 */
  onComplete: () => void;
  /** 无编号用法时的整词勾选兜底 */
  onSelectLevel: (wordId: number, level: EnVocabLevel) => void;
  /** 有编号用法：每条用法旁勾选（可未齐）；齐了由父组件汇总写库 */
  onSelectUsageLevels?: (
    wordId: number,
    levels: Array<EnVocabLevel | null | undefined>
  ) => void;
  onNavigate: (index: number) => void;
  onOpenRef: (refKey: string, ref?: EnVocabRef) => void;
  onViewRemarks: (word: EnVocabWord) => void;
  onEditRemarks?: (word: EnVocabWord) => void;
  onEditWord?: (word: EnVocabWord) => void;
  onShare?: (wordId: number) => void;
  onUnshare?: (wordId: number) => void;
  onWordUpdated?: (word: EnVocabWord) => void;
  nestedModalOpen?: boolean;
};

