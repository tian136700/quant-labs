"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  animateJpVocabSaveProgressTo100,
  JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT,
  jpVocabSaveProgressDisplayPercent,
  jpVocabSaveProgressPercent,
} from "@/lib/jp-vocab-save-progress";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { KO_PRON_CATEGORIES } from "@/lib/ko-pron-seed";
import type { KoPronLetter } from "@/lib/types";

type EditableLetter = Pick<
  KoPronLetter,
  "id" | "letter" | "reading" | "meaning" | "category"
>;

type Props = {
  open: boolean;
  letter: EditableLetter | null;
  onClose: () => void;
  onSaved: (letter: KoPronLetter) => void;
};

/** 韩语字母编辑：字段对齐日语词条卡（字母≈词条、罗马音≈读音、说明≈释义、分类≈词性） */
export function KoPronEditModal({ open, letter, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  const [letterText, setLetterText] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savePercent, setSavePercent] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !letter) return;
    setLetterText(letter.letter || "");
    setReading(letter.reading || "");
    setMeaning(letter.meaning || "");
    setCategory(letter.category || "");
    setError("");
    setSaving(false);
    setSavePercent(null);
  }, [open, letter]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !letter) return null;

  const handleSave = async () => {
    const trimmedLetter = letterText.trim();
    if (!trimmedLetter) {
      setError("字母不能为空");
      return;
    }
    setSaving(true);
    setError("");
    setSavePercent(JP_VOCAB_SAVE_PROGRESS_QUEUED_PERCENT);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSavePercent(jpVocabSaveProgressPercent(Date.now() - startedAt));
    }, 200);

    try {
      const res = await fetch("/api/ko-pron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          letter_id: letter.id,
          letter: trimmedLetter,
          reading: reading.trim(),
          meaning: meaning.trim(),
          category: category.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        letter?: KoPronLetter;
      };
      if (!res.ok || !data.ok || !data.letter) {
        throw new Error(data.error || "保存失败");
      }
      await animateJpVocabSaveProgressTo100(startedAt, setSavePercent);
      onSaved(data.letter);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.clearInterval(timer);
      setSaving(false);
      setSavePercent(null);
    }
  };

  return createPortal(
    <div
      className="ko-pron-edit-overlay"
      role="presentation"
      onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
    >
      <div
        className="ko-pron-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ko-pron-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ko-pron-edit-top">
          <h2 id="ko-pron-edit-title">编辑字母</h2>
          <button
            type="button"
            className="ko-pron-edit-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <label className="ko-pron-edit-field">
          <span>字母</span>
          <input
            value={letterText}
            onChange={(e) => setLetterText(e.target.value)}
            disabled={saving}
            autoComplete="off"
          />
        </label>
        <label className="ko-pron-edit-field">
          <span>罗马音 / 读法</span>
          <input
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            disabled={saving}
            autoComplete="off"
            placeholder="如 ya / 야"
          />
        </label>
        <label className="ko-pron-edit-field">
          <span>说明</span>
          <input
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            disabled={saving}
            autoComplete="off"
          />
        </label>
        <label className="ko-pron-edit-field">
          <span>分类</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving}
          >
            <option value="">（未分类）</option>
            {KO_PRON_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="ko-pron-edit-error">{error}</p> : null}

        {saving ? (
          <JpVocabSaveProgressBar
            label="正在保存…"
            percent={
              savePercent != null
                ? savePercent
                : jpVocabSaveProgressDisplayPercent(null)
            }
            fullWidth
          />
        ) : null}

        <div className="ko-pron-edit-actions">
          <button
            type="button"
            className="ko-pron-edit-btn ko-pron-edit-btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="ko-pron-edit-btn ko-pron-edit-btn--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx global>{`
        .ko-pron-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1400;
          background: rgba(8, 12, 18, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .ko-pron-edit-modal {
          width: min(24rem, 100%);
          background: var(--panel);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 0.85rem;
          padding: 1rem 1.1rem 1.1rem;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
        }
        .ko-pron-edit-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.85rem;
        }
        .ko-pron-edit-top h2 {
          margin: 0;
          font-size: 1.05rem;
        }
        .ko-pron-edit-close {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 1.4rem;
          cursor: pointer;
          line-height: 1;
        }
        .ko-pron-edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          margin-bottom: 0.7rem;
          font-size: 0.85rem;
        }
        .ko-pron-edit-field span {
          color: var(--muted);
          font-weight: 600;
        }
        .ko-pron-edit-field input,
        .ko-pron-edit-field select {
          border: 1px solid var(--border);
          border-radius: 0.45rem;
          padding: 0.5rem 0.6rem;
          background: var(--bg);
          color: var(--text);
          font: inherit;
        }
        .ko-pron-edit-error {
          color: var(--rise);
          font-size: 0.85rem;
          margin: 0 0 0.55rem;
        }
        .ko-pron-edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }
        .ko-pron-edit-btn {
          border-radius: 0.5rem;
          padding: 0.45rem 0.85rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
        }
        .ko-pron-edit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ko-pron-edit-btn--ghost {
          background: transparent;
          color: var(--text);
        }
        .ko-pron-edit-btn--primary {
          border: none;
          background: #f97316;
          color: #fff;
        }
      `}</style>
    </div>,
    document.body
  );
}
