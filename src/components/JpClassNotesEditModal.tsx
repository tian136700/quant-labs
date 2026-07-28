"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  appendJpVocabClassNoteImageLine,
  collectJpVocabClassNoteImageRefKeys,
  jpVocabClassNoteImageRefKeyFromSrc,
  mergeJpVocabClassNoteDraftFromEdit,
  parseJpVocabClassNoteContent,
  parseJpVocabClassNotes,
  removeJpVocabClassNoteAtIndex,
  removeJpVocabClassNoteImageAt,
  saveJpVocabClassNoteDraft,
  splitJpVocabClassNoteDraftForEdit,
  type JpVocabClassNoteEditTarget,
  type JpVocabClassNoteEntry,
} from "@/lib/jp-vocab-class-notes";
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import {
  buildOptimisticJpVocabWord,
  syncJpVocabEditResponse,
} from "@/lib/jp-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import {
  formatUploadBytes,
  uploadFormWithProgress,
  type UploadProgressEvent,
} from "@/lib/upload-form-progress";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  jpVocabSaveProgressPercent,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  type JpVocabSaveProgressKind,
} from "@/lib/jp-vocab-save-progress";
import type { JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { JpClassNotesEditModalStyles } from "@/components/jp-class-notes-edit-modal/JpClassNotesEditModalStyles";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  sharedToday?: boolean;
  /** 抽问 / 带读卡片内编辑备注：点保存后询问是否共享给学生 */
  sharePromptOnSave?: boolean;
  onClose: () => void;
  onSaved: (word: JpVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth: () => void;
  /** 备注已共享到学生端（用于更新父页 sharedToday 状态） */
  onSharedToStudy?: (wordId: number) => void;
};

import {
  AUTO_SAVE_MS,
  POLL_MS,
  editTargetForEntry,
  historyEntriesFromWord,
  noteImageUploadLabel,
  noteImageUploadPercent,
  pickClipboardImage,
  type ActionProgress,
  type SaveStatus,
} from "@/components/jp-class-notes-edit-modal/helpers";
export function JpClassNotesEditModal({
  open,
  word,
  locale,
  canEdit,
  sharedToday = false,
  sharePromptOnSave = false,
  onClose,
  onSaved,
  onSaveFailed,
  onNeedAuth,
  onSharedToStudy,
}: Props) {
  const { canAccessJpVocab } = useEtrAuth();
  const canShareToStudy = canAccessJpVocab;
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyEntries, setHistoryEntries] = useState<JpVocabClassNoteEntry[]>([]);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionProgress, setActionProgress] = useState<ActionProgress | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<UploadProgressEvent | null>(
    null
  );
  const [editTarget, setEditTarget] = useState<JpVocabClassNoteEditTarget>({ mode: "new" });
  const dirtyRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const sessionTsRef = useRef<string | null>(null);
  const editTargetRef = useRef<JpVocabClassNoteEditTarget>({ mode: "new" });
  const [sessionTs, setSessionTs] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageUploadingRef = useRef(false);
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wordRef = useRef(word);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    wordRef.current = word;
  }, [word]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      const entries = historyEntriesFromWord(word);
      setHistoryEntries(entries);
      setDraft("");
      lastSavedDraftRef.current = "";
      sessionTsRef.current = null;
      setSessionTs(null);
      editTargetRef.current = { mode: "new" };
      setEditTarget({ mode: "new" });
      dirtyRef.current = false;
      setError("");
      setSaveStatus("idle");
      setActionProgress(null);
      setActionBusy(false);
      imageUploadingRef.current = false;
      setImageUploading(false);
      setImageUploadProgress(null);

      if (canEdit && entries.length > 0) {
        const latestIndex = entries.length - 1;
        const latest = entries[latestIndex]!;
        setDraft(latest.content);
        lastSavedDraftRef.current = latest.content;
        const target = editTargetForEntry(latest, latestIndex);
        editTargetRef.current = target;
        setEditTarget(target);
      }
    }
  }, [open, word?.id, canEdit]);

  useEffect(() => {
    if (!open || !word || dirtyRef.current) return;
    setHistoryEntries(historyEntriesFromWord(word));
  }, [open, word?.id, word?.class_notes, word?.updated_at]);

  const pullRemoteNotes = useCallback(async () => {
    const current = wordRef.current;
    if (!open || !current || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(current.id))}`,
        {
          headers: { [LOCALE_HEADER]: locale },
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = (await res.json()) as {
        ok: boolean;
        word?: JpVocabWord;
        error?: string;
      };
      if (!data.ok || !data.word) return;
      if (dirtyRef.current) {
        setHistoryEntries(parseJpVocabClassNotes(data.word.class_notes));
        return;
      }
      const local = wordRef.current;
      // Lite list payloads omit class_notes; hydrate when body differs, not only stamp.
      const notesChanged =
        (data.word.class_notes ?? null) !== (local?.class_notes ?? null);
      const stampChanged = data.word.updated_at !== local?.updated_at;
      if (notesChanged || stampChanged) {
        onSaved(data.word);
        setHistoryEntries(parseJpVocabClassNotes(data.word.class_notes));
      }
    } catch {
      /* ignore poll errors */
    } finally {
      pollInFlightRef.current = false;
    }
  }, [locale, onSaved, open]);

  useEffect(() => {
    if (!open || !word) return;
    void pullRemoteNotes();
    const timer = setInterval(() => void pullRemoteNotes(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, word?.id, pullRemoteNotes]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (actionProgressTimerRef.current) clearInterval(actionProgressTimerRef.current);
    };
  }, []);

  const clearActionProgressTimer = useCallback(() => {
    if (actionProgressTimerRef.current) {
      clearInterval(actionProgressTimerRef.current);
      actionProgressTimerRef.current = null;
    }
  }, []);

  const runActionProgress = useCallback(
    (kind: JpVocabSaveProgressKind, startedAtMs: number) => {
      clearActionProgressTimer();
      actionProgressTimerRef.current = setInterval(() => {
        setActionProgress({
          kind,
          percent: jpVocabSaveProgressPercent(Date.now() - startedAtMs),
        });
      }, 200);
    },
    [clearActionProgressTimer]
  );

  const flushSave = useCallback(
    async (draftRaw: string): Promise<boolean> => {
      const current = wordRef.current;
      if (!current || !canEdit) return true;

      const trimmed = draftRaw.trim();
      if (!trimmed) {
        setSaveStatus("saved");
        return true;
      }
      if (trimmed === lastSavedDraftRef.current.trim()) {
        setSaveStatus("saved");
        return true;
      }

      const saved = saveJpVocabClassNoteDraft(
        current.class_notes,
        editTargetRef.current,
        sessionTsRef.current,
        trimmed
      );
      sessionTsRef.current = saved.sessionTimestamp;
      setSessionTs(saved.sessionTimestamp);
      editTargetRef.current = saved.nextTarget;
      setEditTarget(saved.nextTarget);
      const nextNotes = saved.nextNotes;

      setSaveStatus("saving");
      const snapshot = current;
      const optimistic = buildOptimisticJpVocabWord(snapshot, {
        class_notes: nextNotes,
      });
      onSaved(optimistic);
      setHistoryEntries(parseJpVocabClassNotes(nextNotes));
      lastSavedDraftRef.current = trimmed;
      dirtyRef.current = false;

      try {
        await jpVocabSaveQueue.enqueue(async () => {
          const res = await fetch("/api/jp-vocab/class-notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({
              word_id: snapshot.id,
              class_notes: nextNotes,
            }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            error?: string;
          };
          await syncJpVocabEditResponse(res, data, locale, {
            onSaved,
            onSaveFailed,
            onNeedAuth,
          });
        });
        setSaveStatus("saved");
        setError("");
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : locale === "zh" ? "保存失败" : "Save failed";
        setSaveStatus("error");
        setError(message);
        onSaveFailed(snapshot.id, snapshot, message);
        return false;
      }
    },
    [canEdit, locale, onNeedAuth, onSaveFailed, onSaved]
  );

  const handleDeleteAtIndex = useCallback(
    async (index: number) => {
      const current = wordRef.current;
      if (!current || !canEdit || deletingIndex != null) return;

      const entries = parseJpVocabClassNotes(current.class_notes);
      const removed = entries[index];
      if (!removed) return;

      const nextNotes = removeJpVocabClassNoteAtIndex(current.class_notes, index);
      if (removed.timestamp && removed.timestamp === sessionTsRef.current) {
        sessionTsRef.current = null;
        setSessionTs(null);
        setDraft("");
        lastSavedDraftRef.current = "";
        editTargetRef.current = { mode: "new" };
        setEditTarget({ mode: "new" });
      } else if (
        editTargetRef.current.mode === "existing-timestamp" &&
        removed.timestamp === editTargetRef.current.originalTimestamp
      ) {
        sessionTsRef.current = null;
        setSessionTs(null);
        editTargetRef.current = { mode: "new" };
        setEditTarget({ mode: "new" });
        setDraft("");
        lastSavedDraftRef.current = "";
      } else if (
        editTargetRef.current.mode === "existing-index" &&
        editTargetRef.current.originalIndex === index
      ) {
        editTargetRef.current = { mode: "new" };
        setEditTarget({ mode: "new" });
        setDraft("");
        lastSavedDraftRef.current = "";
      } else if (
        editTargetRef.current.mode === "existing-index" &&
        editTargetRef.current.originalIndex > index
      ) {
        editTargetRef.current = {
          mode: "existing-index",
          originalIndex: editTargetRef.current.originalIndex - 1,
        };
        setEditTarget(editTargetRef.current);
      }

      setDeletingIndex(index);
      setSaveStatus("saving");
      const snapshot = current;
      const optimistic = buildOptimisticJpVocabWord(snapshot, {
        class_notes: nextNotes,
      });
      onSaved(optimistic);
      setHistoryEntries(parseJpVocabClassNotes(nextNotes));
      dirtyRef.current = false;

      try {
        await jpVocabSaveQueue.enqueue(async () => {
          const res = await fetch("/api/jp-vocab/class-notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({
              word_id: snapshot.id,
              class_notes: nextNotes,
            }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            word?: JpVocabWord;
            error?: string;
          };
          await syncJpVocabEditResponse(res, data, locale, {
            onSaved,
            onSaveFailed,
            onNeedAuth,
          });
        });
        setSaveStatus("saved");
        setError("");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : locale === "zh" ? "删除失败" : "Delete failed";
        setSaveStatus("error");
        setError(message);
        onSaveFailed(snapshot.id, snapshot, message);
        setHistoryEntries(parseJpVocabClassNotes(snapshot.class_notes));
      } finally {
        setDeletingIndex(null);
      }
    },
    [canEdit, deletingIndex, locale, onNeedAuth, onSaveFailed, onSaved]
  );

  const handleEditAtIndex = useCallback((index: number) => {
    const current = wordRef.current;
    if (!current) return;

    const entries = parseJpVocabClassNotes(current.class_notes);
    const entry = entries[index];
    if (!entry) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setDraft(entry.content);
    lastSavedDraftRef.current = entry.content;
    dirtyRef.current = false;
    setSaveStatus("saved");
    setError("");
    sessionTsRef.current = null;
    setSessionTs(null);

    const target = editTargetForEntry(entry, index);
    editTargetRef.current = target;
    setEditTarget(target);

    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      textareaRef.current?.focus();
    });
  }, []);

  const handleStartNewNote = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDraft("");
    lastSavedDraftRef.current = "";
    sessionTsRef.current = null;
    setSessionTs(null);
    editTargetRef.current = { mode: "new" };
    setEditTarget({ mode: "new" });
    dirtyRef.current = false;
    setSaveStatus("idle");
    setError("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const uploadNoteImage = useCallback(
    async (file: File) => {
      if (!canEdit) return;
      // 同步锁：避免连贴/连点时 React state 尚未更新导致并发上传打爆 Worker（1102）
      if (imageUploadingRef.current) {
        setError("请等待当前图片上传完成后再传下一张");
        return;
      }
      imageUploadingRef.current = true;
      setImageUploading(true);
      setImageUploadProgress({
        phase: "uploading",
        percent: 0,
        loaded: 0,
        total: file.size,
      });
      setError("");
      try {
        const form = new FormData();
        form.set("file", file);
        const result = await uploadFormWithProgress({
          url: "/api/jp-vocab/class-notes/upload",
          form,
          headers: { [LOCALE_HEADER]: locale },
          onProgress: setImageUploadProgress,
        });
        const data = (result.data ?? {}) as {
          ok?: boolean;
          view_path?: string;
          ref_key?: string;
          deduped?: boolean;
          error?: string;
        };
        if (result.status === 401) {
          onNeedAuth();
          return;
        }
        if (!result.ok || !data.ok || !data.view_path) {
          throw new Error(data.error || "图片上传失败");
        }
        const viewPath = data.view_path;
        const refKey =
          (typeof data.ref_key === "string" && data.ref_key.trim()) ||
          jpVocabClassNoteImageRefKeyFromSrc(viewPath);
        const existingKeys = collectJpVocabClassNoteImageRefKeys(
          wordRef.current?.class_notes,
          draftRef.current
        );
        if (refKey && existingKeys.has(refKey)) {
          setError("请审核你的图片：备注里已经有一张相同的了，请勿重复粘贴。");
          setImageUploadProgress(null);
          return;
        }
        setImageUploadProgress({
          phase: "done",
          percent: 100,
          loaded: file.size,
          total: file.size,
        });
        dirtyRef.current = true;
        setDraft((prev) => appendJpVocabClassNoteImageLine(prev, viewPath));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setImageUploadProgress(null);
      } finally {
        imageUploadingRef.current = false;
        setImageUploading(false);
        setImageUploadProgress(null);
      }
    },
    [canEdit, locale, onNeedAuth]
  );

  const handleImageFile = useCallback(
    (file: File | null | undefined) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("仅支持图片文件。");
        return;
      }
      void uploadNoteImage(file);
    },
    [uploadNoteImage]
  );

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canEdit) return;
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    if (imageUploadingRef.current) {
      setError("请等待当前图片上传完成后再传下一张");
      return;
    }
    void uploadNoteImage(file);
  };

  useEffect(() => {
    if (!open || !canEdit || !word) return;
    // 图片上传进行中不触发自动保存，避免与上传请求叠压 Worker
    if (imageUploading) return;

    if (!draft.trim()) {
      setSaveStatus((s) => (s === "pending" ? "saved" : s));
      return;
    }

    if (draft.trim() === lastSavedDraftRef.current.trim()) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave(draft);
    }, AUTO_SAVE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draft, open, canEdit, flushSave, imageUploading]);

  const shareToStudent = useCallback(async (): Promise<boolean> => {
    const current = wordRef.current;
    if (!current || !canShareToStudy) return false;

    const startedAt = Date.now();
    setError("");
    setActionProgress({ kind: "share", percent: 0 });
    runActionProgress("share", startedAt);

    try {
      const res = await fetch("/api/jp-vocab/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ word_id: current.id }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.status === 401) {
        clearActionProgressTimer();
        setActionProgress(null);
        onNeedAuth();
        return false;
      }
      if (!data.ok && res.status !== 409 && data.error !== "already_shared_today") {
        throw new Error(data.error || "共享失败");
      }
      clearActionProgressTimer();
      await animateJpVocabSaveProgressTo100(startedAt, (percent) => {
        setActionProgress({ kind: "share", percent });
      });
      notifyJpVocabSharedUpdated({
        wordId: current.id,
        openRemarks: true,
      });
      onSharedToStudy?.(current.id);
      return true;
    } catch (err) {
      clearActionProgressTimer();
      setActionProgress(null);
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [
    canShareToStudy,
    clearActionProgressTimer,
    locale,
    onNeedAuth,
    onSharedToStudy,
    runActionProgress,
  ]);

  const handleSaveClick = useCallback(async () => {
    if (actionBusy || imageUploading) return;

    const shouldPromptShare = sharePromptOnSave && canShareToStudy;
    let shouldShare = false;
    if (shouldPromptShare) {
      shouldShare = window.confirm(
        locale === "zh"
          ? `是否将「${wordRef.current?.word ?? "该词"}」的备注共享给学生？\n共享后学生会立刻在「今日日语单词」看到。`
          : `Share remarks for "${wordRef.current?.word ?? "this word"}" with the student?`
      );
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setActionBusy(true);
    try {
      const trimmed = draftRef.current.trim();
      const needsSave =
        canEdit && trimmed.length > 0 && trimmed !== lastSavedDraftRef.current.trim();

      if (needsSave) {
        const saveStartedAt = Date.now();
        setActionProgress({ kind: "save", percent: JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT });
        runActionProgress("save", saveStartedAt);
        const saved = await flushSave(trimmed);
        if (!saved) return;
        clearActionProgressTimer();
        await animateJpVocabSaveProgressTo100(saveStartedAt, (percent) => {
          setActionProgress({ kind: "save", percent });
        });
      }

      if (shouldShare) {
        const shared = await shareToStudent();
        if (!shared) return;
      }

      onClose();
    } finally {
      clearActionProgressTimer();
      setActionProgress(null);
      setActionBusy(false);
    }
  }, [
    actionBusy,
    canEdit,
    canShareToStudy,
    clearActionProgressTimer,
    flushSave,
    imageUploading,
    locale,
    onClose,
    runActionProgress,
    sharePromptOnSave,
    shareToStudent,
  ]);

  const statusLabel =
    saveStatus === "pending"
      ? "待保存…"
      : saveStatus === "saving"
        ? "保存中…"
        : saveStatus === "saved"
          ? "已同步"
          : saveStatus === "error"
            ? "保存失败"
            : canEdit
              ? "输入后约 1 秒自动保存 · 每 2 秒同步"
              : "每 2 秒自动同步";

  if (!open || !mounted || !word) return null;

  const draftHasImages = parseJpVocabClassNoteContent(draft).some(
    (segment) => segment.type === "image"
  );
  const { text: draftText, imageSrcs: draftImageSrcs } =
    splitJpVocabClassNoteDraftForEdit(draft);

  const isEntryHiddenInHistory = (entry: JpVocabClassNoteEntry, index: number) => {
    if (sessionTs && entry.timestamp === sessionTs) return true;
    if (
      editTarget.mode === "existing-timestamp" &&
      entry.timestamp === editTarget.originalTimestamp
    ) {
      return true;
    }
    if (editTarget.mode === "existing-index" && editTarget.originalIndex === index) {
      return true;
    }
    return false;
  };

  const editingHint =
    editTarget.mode === "existing-timestamp"
      ? `正在编辑 ${editTarget.originalTimestamp} 的备注，保存后将更新为当前编辑时间`
      : editTarget.mode === "existing-index"
        ? "正在编辑本条备注，保存后将更新为当前编辑时间"
        : sessionTs
          ? `最后编辑：${sessionTs}`
          : null;

  const showNewNoteButton =
    canEdit &&
    (historyEntries.length > 0 ||
      editTarget.mode !== "new" ||
      Boolean(draft.trim()) ||
      sessionTs != null);

  return createPortal(
    <>
      <div
        className="jp-notes-edit-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-notes-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-notes-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-notes-edit-header">
            <div>
              <h2 id="jp-notes-edit-title" className="jp-notes-edit-title">
                {canEdit ? "编辑备注" : "备注"}
              </h2>
              <p className="jp-notes-edit-subtitle">{word.word}</p>
            </div>
            <div className="jp-notes-edit-header-actions">
              <button
                type="button"
                className="jp-notes-edit-close"
                onClick={onClose}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </div>

          <div className="jp-notes-edit-body">
            {historyEntries.some((entry, index) => !isEntryHiddenInHistory(entry, index)) ? (
              <div className="jp-notes-edit-history" aria-label="历史备注">
                {historyEntries.map((entry, index) => {
                  if (isEntryHiddenInHistory(entry, index)) return null;
                  return (
                    <div
                      key={`${entry.timestamp ?? "legacy"}-${index}`}
                      className="jp-notes-edit-entry"
                    >
                      <div className="jp-notes-edit-entry-head">
                        {entry.timestamp ? (
                          <div className="jp-notes-edit-entry-ts">{entry.timestamp}</div>
                        ) : (
                          <span />
                        )}
                        {canEdit ? (
                          <div className="jp-notes-edit-entry-actions">
                            <button
                              type="button"
                              className="jp-notes-edit-entry-edit"
                              onClick={() => handleEditAtIndex(index)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="jp-notes-edit-entry-delete"
                              disabled={deletingIndex === index}
                              aria-label="删除本条备注"
                              onClick={() => void handleDeleteAtIndex(index)}
                            >
                              {deletingIndex === index ? "删除中…" : "删除"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <JpVocabClassNoteContent content={entry.content} />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {canEdit ? (
              <>
                <div className="jp-notes-edit-compose">
                  {editingHint ? (
                    <p className="jp-notes-edit-editing-hint">{editingHint}</p>
                  ) : null}
                  <div className="jp-notes-edit-compose-toolbar">
                    {showNewNoteButton ? (
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact"
                        onClick={handleStartNewNote}
                      >
                        新建备注
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact"
                      disabled={imageUploading}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {imageUploading ? "上传中…" : "上传图片"}
                    </button>
                    <span className="jp-notes-edit-compose-hint">
                      {imageUploading
                        ? "上传完成前不可再贴图或选图"
                        : "支持 Ctrl+V / ⌘V 粘贴截图；相同图片不会重复加入"}
                    </span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="jp-notes-edit-image-input"
                      disabled={imageUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        handleImageFile(file);
                      }}
                    />
                  </div>
                  {imageUploading && imageUploadProgress ? (
                    <JpVocabSaveProgressBar
                      label={noteImageUploadLabel(imageUploadProgress)}
                      percent={noteImageUploadPercent(imageUploadProgress)}
                      fullWidth
                    />
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    className="jp-notes-edit-textarea"
                    rows={8}
                    value={draftText}
                    placeholder="在此输入新备注，可粘贴或上传图片，保存后自动带上当前时间…"
                    onPaste={onPaste}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      setDraft(
                        mergeJpVocabClassNoteDraftFromEdit(
                          e.target.value,
                          draftImageSrcs
                        )
                      );
                    }}
                  />
                  {draftHasImages || draftText.trim() ? (
                    <div className="jp-notes-edit-draft-preview" aria-label="当前备注预览">
                      {draftText.trim() ? (
                        <JpVocabClassNoteContent content={draftText} />
                      ) : null}
                      {draftImageSrcs.length ? (
                        <div className="jp-notes-edit-draft-images">
                          {draftImageSrcs.map((src, index) => (
                            <div
                              key={`${src}-${index}`}
                              className="jp-notes-edit-draft-image-item"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={`备注图片 ${index + 1}`} loading="lazy" />
                              <button
                                type="button"
                                className="jp-notes-edit-draft-image-remove"
                                onClick={() => {
                                  dirtyRef.current = true;
                                  setDraft(removeJpVocabClassNoteImageAt(draft, index));
                                }}
                              >
                                移除图片
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : historyEntries.length === 0 ? (
              <p className="jp-notes-edit-empty">暂无备注</p>
            ) : null}

            <p
              className={`jp-notes-edit-hint${
                saveStatus === "saved"
                  ? " jp-notes-edit-hint--ok"
                  : saveStatus === "error"
                    ? " jp-notes-edit-hint--err"
                    : ""
              }`}
              aria-live="polite"
            >
              {statusLabel}
            </p>
            {error ? <p className="jp-notes-edit-error">{error}</p> : null}
          </div>

          <div className="jp-notes-edit-footer">
            {actionBusy && actionProgress ? (
              <JpVocabSaveProgressBar
                label={jpVocabSaveProgressLabel(actionProgress.kind)}
                percent={jpVocabSaveProgressDisplayPercent(actionProgress.percent)}
                fullWidth
              />
            ) : (
              <>
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                  disabled={imageUploading || deletingIndex != null}
                  onClick={() => void handleSaveClick()}
                >
                  保存
                </button>
                {canEdit && canShareToStudy ? (
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact jp-notes-edit-share-btn"
                    disabled={imageUploading || deletingIndex != null || actionBusy}
                    title={
                      sharedToday
                        ? "备注已在学生「今日日语单词」；可再点一次确认同步"
                        : "将本词备注共享到学生「今日日语单词」"
                    }
                    onClick={() => void shareToStudent()}
                  >
                    {sharedToday ? "已共享备注" : "共享备注给学生"}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      <JpClassNotesEditModalStyles />

    </>,
    document.body
  );
}
