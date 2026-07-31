import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import {
  appendJpVocabClassNoteImageLine,
  collectJpVocabClassNoteImageRefKeysFromContent,
  jpVocabClassNoteImageRefKeyFromSrc,
  mergeJpVocabClassNoteDraftFromEdit,
  removeJpVocabClassNoteImageAt,
  splitJpVocabClassNoteDraftForEdit,
} from "@/lib/jp-vocab-class-notes";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import {
  formatUploadBytes,
  uploadFormWithProgress,
  type UploadProgressEvent,
} from "@/lib/upload-form-progress";
import type { JpLessonKind, JpLessonNote, JpLessonRecord } from "@/lib/types";
import {
  JP_LESSON_CACHE_KEY,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  patchClientCache,
  readClientCache,
} from "@/lib/client-swr-cache";

export type SavingTarget = string | "__all__" | null;

export type NoteField = {
  key: string;
  noteId?: number;
  body: string;
};

export type ItemFields = Record<string, NoteField[]>;

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function readLessonCache(): JpLessonApiPayload | null {
  return readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

export function pickLessonFromCache(lessonId: number): {
  lesson: JpLessonRecord;
  notes: JpLessonNote[];
} | null {
  const cached = readLessonCache();
  if (!cached) return null;
  const lesson = cached.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  // 列表缓存不再带笔记正文；notes 页须再拉 /api/jp-lesson/notes
  return { lesson, notes: [] };
}

/** 保存后：刷新列表角标 note_counts（不再往列表缓存塞正文） */
export function persistLessonNotesCache(
  lessonId: number,
  lessonNotes: JpLessonNote[]
) {
  const count = lessonNotes.filter((n) => n.lesson_id === lessonId).length;
  patchClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY, (prev) => {
    if (!prev) return prev;
    const note_counts = { ...(prev.note_counts ?? {}) };
    if (count > 0) note_counts[lessonId] = count;
    else delete note_counts[lessonId];
    return { ...prev, notes: [], note_counts };
  });
}

export function kindLabel(kind: JpLessonKind): string {
  if (kind === "grammar") return "语法";
  if (kind === "word_grammar") return "单词加语法";
  return "单词";
}

export function buildItemFields(
  items: string[],
  lessonNotes: JpLessonNote[]
): ItemFields {
  const map: ItemFields = {};
  for (const item of items) {
    const saved = lessonNotes
      .filter((n) => n.item_word === item)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    map[item] =
      saved.length > 0
        ? saved.map((n) => ({
            key: `note-${n.id}`,
            noteId: n.id,
            body: n.body,
          }))
        : [{ key: `empty-${item}`, body: "" }];
  }
  return map;
}

let fieldKeyCounter = 0;
export function newFieldKey(item: string): string {
  fieldKeyCounter += 1;
  return `new-${item}-${fieldKeyCounter}`;
}

export function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "pending":
      return "待保存…";
    case "saving":
      return "保存中…";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "";
  }
}

export function pickClipboardImage(items: DataTransferItemList): File | null {
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const ext = item.type.split("/")[1] || "png";
        return new File([blob], `pasted.${ext}`, { type: item.type });
      }
    }
  }
  return null;
}

export function noteImageUploadLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") {
    return "图片已传完，服务器保存中…";
  }
  if (event.phase === "done") {
    return "图片上传完成";
  }
  if (event.total > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)}…`;
  }
  return "正在上传图片…";
}

export function noteImageUploadPercent(event: UploadProgressEvent): number {
  if (event.phase === "processing") return 95;
  if (event.phase === "done") return 100;
  return Math.max(0, Math.min(92, event.percent));
}

export function collectItemNoteImageRefKeys(fields: NoteField[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    for (const key of collectJpVocabClassNoteImageRefKeysFromContent(field.body)) {
      keys.add(key);
    }
  }
  return keys;
}

export function ItemSectionSaveFooter({
  canEdit,
  saving,
  status,
  showSyncHint,
  disabled,
  onSave,
}: {
  canEdit: boolean;
  saving: boolean;
  status: SaveStatus;
  showSyncHint: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const saveProgress = useSaveProgressBar(saving);
  const hint = saveStatusLabel(status);
  const progressLabel = showSyncHint
    ? "正在保存并同步到单词复习备注…"
    : jpVocabSaveProgressLabel("save");

  return (
    <div className="jp-lesson-notes-section-footer">
      <div className="jp-lesson-notes-section-footer-status">
        {saveProgress.visible ? (
          <JpVocabSaveProgressBar
            label={progressLabel}
            percent={saveProgress.percent}
            fullWidth
          />
        ) : hint ? (
          <span
            className={`jp-lesson-notes-status${
              status === "saved"
                ? " jp-lesson-notes-status--saved"
                : status === "error"
                  ? " jp-lesson-notes-status--error"
                  : ""
            }`}
          >
            {hint}
            {status === "saved" && showSyncHint ? "，已同步到单词复习备注" : ""}
          </span>
        ) : showSyncHint ? (
          <span className="jp-lesson-notes-sync-hint">保存后同步到日语抽问备注</span>
        ) : null}
      </div>
      {canEdit ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
          disabled={disabled}
          onClick={onSave}
        >
          保存
        </button>
      ) : null}
    </div>
  );
}

