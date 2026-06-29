"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { JpVocabWord } from "@/lib/types";
import {
  buildOptimisticJpVocabWord,
  syncJpVocabEditResponse,
} from "@/lib/jp-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { jpVocabSaveQueue } from "@/lib/request-queue";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  onClose: () => void;
  onSaved: (word: JpVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const AUTO_SAVE_MS = 1_000;

export function JpClassNotesEditModal({
  open,
  word,
  locale,
  canEdit,
  onClose,
  onSaved,
  onSaveFailed,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordRef = useRef(word);

  useEffect(() => {
    wordRef.current = word;
  }, [word]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      const notes = word.class_notes || "";
      setBody(notes);
      lastSavedRef.current = notes;
      dirtyRef.current = false;
      setError("");
      setSaveStatus("idle");
    }
  }, [open, word?.id]);

  useEffect(() => {
    if (!open || !word || dirtyRef.current) return;
    const notes = word.class_notes || "";
    setBody(notes);
    lastSavedRef.current = notes;
  }, [open, word?.id, word?.class_notes, word?.updated_at, word]);

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
    };
  }, []);

  const flushSave = useCallback(
    async (notesRaw: string) => {
      const current = wordRef.current;
      if (!current || !canEdit) return;

      const notes = notesRaw.trim() || null;
      const lastSaved = lastSavedRef.current.trim() || null;
      if (notes === lastSaved) {
        setSaveStatus("saved");
        return;
      }

      setSaveStatus("saving");
      const snapshot = current;
      const optimistic = buildOptimisticJpVocabWord(snapshot, {
        class_notes: notes,
      });
      onSaved(optimistic);
      lastSavedRef.current = notesRaw;
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
              class_notes: notes,
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

  useEffect(() => {
    if (!open || !canEdit || !word) return;

    const notes = body.trim() || null;
    const lastSaved = lastSavedRef.current.trim() || null;
    if (notes === lastSaved) {
      setSaveStatus((s) => (s === "pending" ? "saved" : s));
      return;
    }

    setSaveStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushSave(body);
    }, AUTO_SAVE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [body, open, canEdit, word, flushSave]);

  const statusLabel =
    saveStatus === "pending"
      ? "待保存…"
      : saveStatus === "saving"
        ? "保存中…"
        : saveStatus === "saved"
          ? "已同步"
          : saveStatus === "error"
            ? "保存失败"
            : "输入后约 1 秒自动保存";

  if (!open || !mounted || !word) return null;

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
                编辑备注
              </h2>
              <p className="jp-notes-edit-subtitle">{word.word}</p>
            </div>
            <button
              type="button"
              className="jp-notes-edit-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-notes-edit-body">
            <textarea
              className="jp-notes-edit-textarea"
              rows={12}
              value={body}
              disabled={!canEdit}
              placeholder="记录例句、用法、易错点…"
              onChange={(e) => {
                dirtyRef.current = true;
                setBody(e.target.value);
              }}
            />
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
          gap: 0.5rem;
          flex: 1;
          min-height: 0;
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
          min-height: 16rem;
          line-height: 1.55;
          flex: 1;
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
