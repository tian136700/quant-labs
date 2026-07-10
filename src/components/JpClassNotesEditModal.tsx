"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  appendJpVocabClassNoteImageLine,
  formatBeijingClassNoteTimestamp,
  parseJpVocabClassNoteContent,
  parseJpVocabClassNotes,
  removeJpVocabClassNoteAtIndex,
  upsertJpVocabClassNoteSession,
  type JpVocabClassNoteEntry,
} from "@/lib/jp-vocab-class-notes";
import { notifyJpVocabSharedUpdated } from "@/lib/jp-vocab-shared-notify";
import {
  buildOptimisticJpVocabWord,
  syncJpVocabEditResponse,
} from "@/lib/jp-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import type { JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  sharedToday?: boolean;
  onClose: () => void;
  onSaved: (word: JpVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const AUTO_SAVE_MS = 1_000;
const POLL_MS = 2_000;
const JP_NOTES_SHARE_DURATION_MS = 5_000;

function pickClipboardImage(items: DataTransferItemList): File | null {
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

function jpNotesShareProgressPercent(elapsedMs: number): number {
  return Math.min(100, Math.round((elapsedMs / JP_NOTES_SHARE_DURATION_MS) * 100));
}

async function animateJpNotesShareProgressTo100(
  wordId: number,
  startedAtMs: number,
  setShareProgress: (next: { wordId: number; percent: number } | null) => void
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const current = jpNotesShareProgressPercent(elapsed);
  if (current >= 100) {
    setShareProgress({ wordId, percent: 100 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    return;
  }
  const steps = Math.max(4, Math.ceil((100 - current) / 5));
  const stepMs = Math.min(80, Math.round(400 / steps));
  for (let i = 1; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    const percent = current + Math.round(((100 - current) * i) / steps);
    setShareProgress({ wordId, percent });
  }
  setShareProgress({ wordId, percent: 100 });
  await new Promise((resolve) => setTimeout(resolve, 120));
}

function historyEntriesFromWord(word: JpVocabWord | null): JpVocabClassNoteEntry[] {
  if (!word) return [];
  return parseJpVocabClassNotes(word.class_notes);
}

export function JpClassNotesEditModal({
  open,
  word,
  locale,
  canEdit,
  sharedToday = false,
  onClose,
  onSaved,
  onSaveFailed,
  onNeedAuth,
}: Props) {
  const { canAccessJpVocab } = useEtrAuth();
  const canShareToStudy = canAccessJpVocab;
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyEntries, setHistoryEntries] = useState<JpVocabClassNoteEntry[]>([]);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [sharing, setSharing] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [shareProgress, setShareProgress] = useState<{ wordId: number; percent: number } | null>(
    null
  );
  const [imageUploading, setImageUploading] = useState(false);
  const dirtyRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const sessionTsRef = useRef<string | null>(null);
  const [sessionTs, setSessionTs] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const wordRef = useRef(word);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    wordRef.current = word;
  }, [word]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      setHistoryEntries(historyEntriesFromWord(word));
      setDraft("");
      lastSavedDraftRef.current = "";
      sessionTsRef.current = null;
      setSessionTs(null);
      dirtyRef.current = false;
      setError("");
      setSaveStatus("idle");
      setShareProgress(null);
      setImageUploading(false);
    }
  }, [open, word?.id]);

  useEffect(() => {
    if (!open || !word || dirtyRef.current) return;
    setHistoryEntries(historyEntriesFromWord(word));
  }, [open, word?.id, word?.class_notes, word?.updated_at, word]);

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
      if (data.word.updated_at !== wordRef.current?.updated_at) {
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
  }, [open, word?.id, pullRemoteNotes, word]);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (shareProgressTimerRef.current) clearInterval(shareProgressTimerRef.current);
    };
  }, []);

  const flushSave = useCallback(
    async (draftRaw: string) => {
      const current = wordRef.current;
      if (!current || !canEdit) return;

      const trimmed = draftRaw.trim();
      if (!trimmed) {
        setSaveStatus("saved");
        return;
      }
      if (trimmed === lastSavedDraftRef.current.trim()) {
        setSaveStatus("saved");
        return;
      }

      if (!sessionTsRef.current) {
        sessionTsRef.current = formatBeijingClassNoteTimestamp();
        setSessionTs(sessionTsRef.current);
      }

      const nextNotes = upsertJpVocabClassNoteSession(
        current.class_notes,
        sessionTsRef.current,
        trimmed
      );

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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : locale === "zh" ? "保存失败" : "Save failed";
        setSaveStatus("error");
        setError(message);
        onSaveFailed(snapshot.id, snapshot, message);
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

  const uploadNoteImage = useCallback(
    async (file: File) => {
      if (!canEdit || imageUploading) return;
      setImageUploading(true);
      setError("");
      try {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/jp-vocab/class-notes/upload", {
          method: "POST",
          headers: { [LOCALE_HEADER]: locale },
          credentials: "include",
          body: form,
        });
        const parsed = await readApiJson<{
          ok: boolean;
          view_path?: string;
          error?: string;
        }>(res);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        const data = parsed.data;
        if (parsed.status === 401) {
          onNeedAuth();
          return;
        }
        if (!data.ok || !data.view_path) {
          throw new Error(data.error || "图片上传失败");
        }
        const viewPath = data.view_path;
        dirtyRef.current = true;
        setDraft((prev) => appendJpVocabClassNoteImageLine(prev, viewPath));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setImageUploading(false);
      }
    },
    [canEdit, imageUploading, locale, onNeedAuth]
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
    if (!canEdit || imageUploading) return;
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    void uploadNoteImage(file);
  };

  useEffect(() => {
    if (!open || !canEdit || !word) return;

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
  }, [draft, open, canEdit, word, flushSave]);

  const handleShare = async () => {
    const current = wordRef.current;
    if (!current || !canShareToStudy || sharing) return;

    const startedAt = Date.now();
    setSharing(true);
    setShareProgress({ wordId: current.id, percent: 0 });
    setError("");
    shareProgressTimerRef.current = setInterval(() => {
      setShareProgress({
        wordId: current.id,
        percent: jpNotesShareProgressPercent(Date.now() - startedAt),
      });
    }, 200);

    const clearShareTimer = () => {
      if (shareProgressTimerRef.current) {
        clearInterval(shareProgressTimerRef.current);
        shareProgressTimerRef.current = null;
      }
    };

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
        clearShareTimer();
        setShareProgress(null);
        onNeedAuth();
        return;
      }
      if (!data.ok && res.status !== 409 && data.error !== "already_shared_today") {
        throw new Error(data.error || "共享失败");
      }
      clearShareTimer();
      await animateJpNotesShareProgressTo100(current.id, startedAt, setShareProgress);
      notifyJpVocabSharedUpdated({
        wordId: current.id,
        openRemarks: true,
      });
    } catch (err) {
      clearShareTimer();
      setShareProgress(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setShareProgress(null);
      setSharing(false);
    }
  };

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
            {historyEntries.some((e) => !sessionTs || e.timestamp !== sessionTs) ? (
              <div className="jp-notes-edit-history" aria-label="历史备注">
                {historyEntries.map((entry, index) => {
                  if (sessionTs && entry.timestamp === sessionTs) return null;
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
                          <button
                            type="button"
                            className="jp-notes-edit-entry-delete"
                            disabled={deletingIndex === index}
                            aria-label="删除本条备注"
                            onClick={() => void handleDeleteAtIndex(index)}
                          >
                            {deletingIndex === index ? "删除中…" : "删除"}
                          </button>
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
                  <div className="jp-notes-edit-compose-toolbar">
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact"
                      disabled={imageUploading}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {imageUploading ? "上传中…" : "上传图片"}
                    </button>
                    <span className="jp-notes-edit-compose-hint">
                      支持 Ctrl+V / ⌘V 粘贴截图
                    </span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="jp-notes-edit-image-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        handleImageFile(file);
                      }}
                    />
                  </div>
                  <textarea
                    className="jp-notes-edit-textarea"
                    rows={8}
                    value={draft}
                    placeholder="在此输入新备注，可粘贴或上传图片，保存后自动带上当前时间…"
                    onPaste={onPaste}
                    onChange={(e) => {
                      dirtyRef.current = true;
                      setDraft(e.target.value);
                    }}
                  />
                  {draftHasImages ? (
                    <div className="jp-notes-edit-draft-preview" aria-label="当前备注预览">
                      <JpVocabClassNoteContent content={draft} />
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
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
              onClick={onClose}
            >
              完成
            </button>
            {canShareToStudy ? (
              sharing && shareProgress?.wordId === word.id ? (
                <div className="jp-notes-share-progress" aria-live="polite">
                  <span className="jp-notes-share-progress-label">正在发给学生，传输中…</span>
                  <div
                    className="jp-notes-share-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={shareProgress.percent}
                    aria-label="共享备注给学生进度"
                  >
                    <div
                      className="jp-notes-share-progress-fill"
                      style={{ width: `${shareProgress.percent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact jp-notes-edit-share-btn"
                  disabled={sharing}
                  title={
                    sharedToday
                      ? "将该词备注共享到学生「今日日语单词」"
                      : "共享到学生「今日日语单词」，并标记为不熟悉"
                  }
                  onClick={() => void handleShare()}
                >
                  共享备注给学生
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-notes-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .jp-notes-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(760px, 100%);
          max-height: min(88vh, 720px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-notes-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.25rem 0.85rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-notes-edit-header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .jp-notes-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-notes-edit-subtitle {
          margin: 0.3rem 0 0;
          font-size: 0.8125rem;
          color: var(--accent);
        }

        .jp-notes-edit-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-notes-edit-body {
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .jp-notes-edit-history {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .jp-notes-edit-entry {
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
          background: color-mix(in srgb, var(--bg) 45%, var(--panel));
        }

        .jp-notes-edit-entry-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }

        .jp-notes-edit-entry-ts {
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
        }

        .jp-notes-edit-entry-delete {
          flex-shrink: 0;
          border: none;
          background: transparent;
          color: var(--rise);
          font-size: 0.75rem;
          padding: 0.1rem 0.25rem;
          cursor: pointer;
          font: inherit;
        }

        .jp-notes-edit-entry-delete:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-notes-edit-entry-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-notes-edit-entry-body {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          font-size: 0.9375rem;
          line-height: 1.55;
          color: var(--text);
        }

        .jp-notes-edit-compose {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .jp-notes-edit-compose-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.65rem;
        }

        .jp-notes-edit-compose-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-notes-edit-image-input {
          display: none;
        }

        .jp-notes-edit-draft-preview {
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 50%, var(--panel));
        }

        .jp-notes-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.9375rem;
          padding: 0.75rem 0.85rem;
          resize: vertical;
          min-height: 10rem;
          line-height: 1.55;
        }

        .jp-notes-edit-share-btn:not(:disabled) {
          color: #f0a030;
          border-color: color-mix(in srgb, #f0a030 58%, var(--border));
          background: color-mix(in srgb, #f0a030 16%, var(--panel));
        }

        .jp-notes-edit-share-btn:not(:disabled):hover {
          color: #f5b85a;
          border-color: color-mix(in srgb, #f0a030 78%, var(--border));
          background: color-mix(in srgb, #f0a030 26%, var(--panel));
        }

        .jp-notes-edit-share-btn:disabled {
          opacity: 0.55;
        }

        .jp-notes-share-progress {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.3rem;
          min-width: 10.25rem;
          max-width: 14rem;
          padding: 0.35rem 0.45rem;
          border-radius: 6px;
          border: 1px solid color-mix(in srgb, #f0a840 45%, var(--border));
          background: color-mix(in srgb, var(--panel) 90%, #f0a840 10%);
        }

        .jp-notes-share-progress-label {
          font-size: 0.75rem;
          line-height: 1.3;
          color: #f0a840;
          text-align: center;
          white-space: nowrap;
        }

        .jp-notes-share-progress-track {
          height: 0.4rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 70%, transparent);
          overflow: hidden;
        }

        .jp-notes-share-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, #f0a840 80%, #fff),
            #f0a840
          );
          transition: width 0.2s linear;
        }

        .jp-notes-edit-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-notes-edit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-notes-edit-hint--ok {
          color: var(--fall);
        }

        .jp-notes-edit-hint--err {
          color: var(--rise);
        }

        .jp-notes-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-notes-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.25rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
