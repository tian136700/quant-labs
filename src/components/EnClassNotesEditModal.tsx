"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  formatBeijingClassNoteTimestamp,
  parseEnVocabClassNotes,
  upsertEnVocabClassNoteSession,
  type EnVocabClassNoteEntry,
} from "@/lib/en-vocab-class-notes";
import { mergeEnVocabWordAfterClassNotesFetch } from "@/lib/en-vocab-teacher-quiz";
import { notifyEnVocabSharedUpdated } from "@/lib/en-vocab-shared-notify";
import {
  buildOptimisticEnVocabWord,
  syncEnVocabEditResponse,
} from "@/lib/en-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { enVocabSaveQueue } from "@/lib/request-queue";
import type { EnVocabWord } from "@/lib/types";
import { EnVocabClassNoteContent } from "@/components/EnVocabClassNoteContent";
import { EnVocabImageNotesField } from "@/components/EnVocabImageNotesField";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import {
  animateJpVocabSaveProgressTo100,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressLabel,
  jpVocabSaveProgressPercent,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
} from "@/lib/jp-vocab-save-progress";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  sharedToday?: boolean;
  onClose: () => void;
  onSaved: (word: EnVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: EnVocabWord, message: string) => void;
  onNeedAuth: () => void;
  onSharedToStudy?: (wordId: number) => void;
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function historyEntriesFromWord(word: EnVocabWord | null): EnVocabClassNoteEntry[] {
  if (!word) return [];
  return parseEnVocabClassNotes(word.class_notes);
}

export function EnClassNotesEditModal({
  open,
  word,
  locale,
  canEdit,
  sharedToday = false,
  onClose,
  onSaved,
  onSaveFailed,
  onNeedAuth,
  onSharedToStudy,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [historyEntries, setHistoryEntries] = useState<EnVocabClassNoteEntry[]>([]);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [sharing, setSharing] = useState(false);
  const [savePercent, setSavePercent] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedDraftRef = useRef("");
  const sessionTsRef = useRef<string | null>(null);
  const [sessionTs, setSessionTs] = useState<string | null>(null);
  const wordRef = useRef(word);
  const hydrateInFlightRef = useRef(false);
  const saveProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setSavePercent(null);
    }
  }, [open, word?.id]);

  /** 打开时拉一次正文（lite 列表可能无备注）；禁止定时轮询自动同步 */
  const hydrateOnce = useCallback(async () => {
    const current = wordRef.current;
    if (!open || !current || hydrateInFlightRef.current) return;
    hydrateInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/en-vocab/class-notes?word_id=${encodeURIComponent(String(current.id))}`,
        {
          headers: { [LOCALE_HEADER]: locale },
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = (await res.json()) as {
        ok: boolean;
        word?: EnVocabWord;
      };
      if (!data.ok || !data.word) return;
      if (dirtyRef.current) {
        setHistoryEntries(parseEnVocabClassNotes(data.word.class_notes));
        return;
      }
      const local = wordRef.current;
      const notesChanged =
        (data.word.class_notes ?? null) !== (local?.class_notes ?? null);
      const stampChanged = data.word.updated_at !== local?.updated_at;
      if (notesChanged || stampChanged) {
        const merged = mergeEnVocabWordAfterClassNotesFetch(
          local ?? current,
          data.word
        );
        onSaved(merged);
        setHistoryEntries(parseEnVocabClassNotes(merged.class_notes));
      }
    } catch {
      /* ignore hydrate errors */
    } finally {
      hydrateInFlightRef.current = false;
    }
  }, [locale, onSaved, open]);

  useEffect(() => {
    if (!open || !word) return;
    void hydrateOnce();
  }, [open, word?.id, hydrateOnce, word]);

  const requestClose = useCallback(() => {
    const unsaved =
      dirtyRef.current &&
      draft.trim().length > 0 &&
      draft.trim() !== lastSavedDraftRef.current.trim();
    if (unsaved && !window.confirm("有未保存的备注，确定关闭？")) return;
    onClose();
  }, [draft, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    return () => {
      if (saveProgressTimerRef.current) {
        clearInterval(saveProgressTimerRef.current);
        saveProgressTimerRef.current = null;
      }
    };
  }, []);

  const clearSaveProgress = () => {
    if (saveProgressTimerRef.current) {
      clearInterval(saveProgressTimerRef.current);
      saveProgressTimerRef.current = null;
    }
    setSavePercent(null);
  };

  const flushSave = useCallback(async () => {
    const current = wordRef.current;
    if (!current || !canEdit) return;

    const trimmed = draft.trim();
    if (!trimmed) {
      setError("请先输入备注内容");
      setSaveStatus("error");
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

    const nextNotes = upsertEnVocabClassNoteSession(
      current.class_notes,
      sessionTsRef.current,
      trimmed
    );

    setSaveStatus("saving");
    setError("");
    setSavePercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const startedAt = Date.now();
    if (saveProgressTimerRef.current) clearInterval(saveProgressTimerRef.current);
    saveProgressTimerRef.current = setInterval(() => {
      setSavePercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 100);

    const snapshot = current;
    const optimistic = buildOptimisticEnVocabWord(snapshot, {
      class_notes: nextNotes,
    });
    onSaved(optimistic);
    setHistoryEntries(parseEnVocabClassNotes(nextNotes));

    try {
      await enVocabSaveQueue.enqueue(async () => {
        const res = await fetch("/api/en-vocab/class-notes", {
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
          word?: EnVocabWord;
          error?: string;
        };
        await syncEnVocabEditResponse(res, data, locale, {
          onSaved,
          onSaveFailed,
          onNeedAuth,
        });
      });
      lastSavedDraftRef.current = trimmed;
      dirtyRef.current = false;
      await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);
      setSaveStatus("saved");
      setError("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : locale === "zh" ? "保存失败" : "Save failed";
      setSaveStatus("error");
      setError(message);
      onSaveFailed(snapshot.id, snapshot, message);
    } finally {
      clearSaveProgress();
    }
  }, [canEdit, draft, locale, onNeedAuth, onSaveFailed, onSaved]);

  const handleShare = async () => {
    const current = wordRef.current;
    if (!current || !canEdit || sharing) return;

    const unsaved =
      dirtyRef.current &&
      draft.trim().length > 0 &&
      draft.trim() !== lastSavedDraftRef.current.trim();
    if (unsaved) {
      setError("请先点「保存」再共享给学生");
      setSaveStatus("error");
      return;
    }

    setSharing(true);
    setError("");
    try {
      const res = await fetch("/api/en-vocab/share", {
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
        onNeedAuth();
        return;
      }
      if (!data.ok && res.status !== 409 && data.error !== "already_shared_today") {
        throw new Error(data.error || "共享失败");
      }
      notifyEnVocabSharedUpdated({
        wordId: current.id,
        openRemarks: true,
      });
      onSharedToStudy?.(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  };

  const pastEntries = useMemo(() => {
    if (!sessionTs) return historyEntries;
    return historyEntries.filter((e) => e.timestamp !== sessionTs);
  }, [historyEntries, sessionTs]);

  const canSave =
    canEdit &&
    draft.trim().length > 0 &&
    draft.trim() !== lastSavedDraftRef.current.trim() &&
    saveStatus !== "saving";

  const statusLabel =
    saveStatus === "saving"
      ? "正在保存…"
      : saveStatus === "saved"
        ? "已保存（对方刷新页面后可见）"
        : saveStatus === "error"
          ? "保存失败"
          : saveStatus === "dirty"
            ? "有未保存修改，请点「保存」"
            : canEdit
              ? "点「保存」写入；对方刷新页面后可见（不会自动同步）"
              : "只读 · 刷新页面后可见最新备注";

  if (!open || !mounted || !word) return null;

  return createPortal(
    <>
      <div
        className="jp-notes-edit-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, requestClose)}
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
                onClick={requestClose}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          </div>

          <div className="jp-notes-edit-body">
            {pastEntries.length > 0 ? (
              <div className="jp-notes-edit-history" aria-label="历史备注">
                {pastEntries.map((entry, index) => (
                  <div
                    key={`${entry.timestamp ?? "legacy"}-${index}`}
                    className="jp-notes-edit-entry"
                  >
                    {entry.timestamp ? (
                      <div className="jp-notes-edit-entry-ts">{entry.timestamp}</div>
                    ) : null}
                    <EnVocabClassNoteContent content={entry.content} />
                  </div>
                ))}
              </div>
            ) : null}

            {canEdit ? (
              <EnVocabImageNotesField
                id="en-notes-edit-draft"
                value={draft}
                onChange={(next) => {
                  dirtyRef.current = true;
                  setDraft(next);
                  const trimmed = next.trim();
                  if (
                    trimmed &&
                    trimmed !== lastSavedDraftRef.current.trim()
                  ) {
                    setSaveStatus("dirty");
                  } else if (!trimmed) {
                    setSaveStatus("idle");
                  } else {
                    setSaveStatus("saved");
                  }
                }}
                locale={locale}
                rows={8}
                mode="plain"
                textareaClassName="jp-notes-edit-textarea"
                placeholder="在此输入新备注，点「保存」后带上当前时间…可粘贴或上传图片"
                onNeedAuth={onNeedAuth}
                onError={setError}
                disabled={saveStatus === "saving"}
              />
            ) : pastEntries.length === 0 ? (
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
            {saveStatus === "saving" ? (
              <JpVocabSaveProgressBar
                label={jpVocabSaveProgressLabel("save")}
                percent={jpVocabSaveProgressDisplayPercent(savePercent)}
                fullWidth
              />
            ) : null}
          </div>

          <div className="jp-notes-edit-footer">
            {canEdit ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                disabled={!canSave}
                onClick={() => void flushSave()}
              >
                {saveStatus === "saving" ? "保存中…" : "保存"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              disabled={saveStatus === "saving"}
              onClick={requestClose}
            >
              完成
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact jp-notes-edit-share-btn"
                disabled={sharing || saveStatus === "saving"}
                title={
                  sharedToday
                    ? "将该词备注共享到学生「今日背英语单词」"
                    : "共享到学生「今日背英语单词」"
                }
                onClick={() => void handleShare()}
              >
                {sharing ? "共享中…" : sharedToday ? "已共享备注" : "共享备注给学生"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .jp-notes-edit-overlay {
          position: fixed;
          inset: 0;
          /* 须高于抽问卡 overlay(1002)；对齐日语 JpClassNotesEditModal(1100) */
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
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
          width: 2.75rem;
          height: 2.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          color: var(--muted);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
          touch-action: manipulation;
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

        .jp-notes-edit-entry-ts {
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          color: var(--muted);
          margin-bottom: 0.35rem;
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
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.25rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-notes-edit-footer .btn-rsi-filter {
          min-height: 2.75rem;
          touch-action: manipulation;
        }

        @media (max-width: 767px) {
          .jp-notes-edit-overlay {
            padding: 0.5rem;
            padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
            align-items: flex-end;
          }
          .jp-notes-edit-modal {
            width: 100%;
            max-height: min(92dvh, 92svh);
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
