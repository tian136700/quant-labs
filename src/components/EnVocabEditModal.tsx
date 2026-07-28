"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EnVocabImageNotesField } from "@/components/EnVocabImageNotesField";
import {
  EN_VOCAB_CATEGORY_PRESETS,
  EN_VOCAB_DEFAULT_CATEGORY,
  displayEnVocabCategory,
} from "@/lib/en-vocab-category";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import type { EnVocabKind, EnVocabWord } from "@/lib/types";
import {
  buildOptimisticEnVocabWord,
  syncEnVocabEditResponse,
} from "@/lib/en-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { enVocabSaveQueue } from "@/lib/request-queue";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

type Props = {
  open: boolean;
  word: EnVocabWord | null;
  locale: "en" | "zh";
  canEdit: boolean;
  /** 仅管理员可编辑巧记 */
  showMnemonic?: boolean;
  onClose: () => void;
  onSaved: (word: EnVocabWord) => void;
  onSaveFailed: (wordId: number, snapshot: EnVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

const KIND_OPTIONS: { key: EnVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

export function EnVocabEditModal({
  open,
  word,
  locale,
  canEdit,
  showMnemonic = false,
  onClose,
  onSaved,
  onSaveFailed,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<EnVocabKind>("word");
  const [wordText, setWordText] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [pos, setPos] = useState("");
  const [category, setCategory] = useState(EN_VOCAB_DEFAULT_CATEGORY);
  const [mnemonic, setMnemonic] = useState("");
  const [usage, setUsage] = useState("");
  const [exampleSentences, setExampleSentences] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && word) {
      setKind(word.kind);
      setWordText(word.word);
      setReading(word.reading || "");
      setMeaning(word.meaning || "");
      setPos(word.pos || "");
      setCategory(displayEnVocabCategory(word.category));
      setMnemonic(word.mnemonic || "");
      setUsage(word.usage || "");
      setExampleSentences(word.example_sentences || "");
      setClassNotes(word.class_notes || "");
      setError("");
    }
  }, [open, word]);

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

  const save = () => {
    if (!word) return;
    if (!canEdit) {
      onNeedAuth();
      return;
    }

    const trimmedWord = wordText.trim();
    if (!trimmedWord) {
      setError(locale === "zh" ? "请填写单词或语法。" : "Word is required.");
      return;
    }

    setError("");
    const snapshot = word;
    const nextExamples = exampleSentences.trim() || null;
    const prevExamples = (snapshot.example_sentences || "").trim() || null;
    const nextExampleSource =
      nextExamples !== prevExamples
        ? nextExamples
          ? "手动"
          : null
        : snapshot.example_sentences_source ?? null;
    const optimistic = buildOptimisticEnVocabWord(snapshot, {
      kind,
      word: trimmedWord,
      reading: kind === "word" ? reading.trim() || null : null,
      meaning: meaning.trim() || null,
      pos: pos.trim() || null,
      category: category.trim() || EN_VOCAB_DEFAULT_CATEGORY,
      class_notes: classNotes.trim() || null,
      usage: usage.trim() || null,
      example_sentences: nextExamples,
      example_sentences_source: nextExampleSource,
      ...(showMnemonic ? { mnemonic: mnemonic.trim() || null } : {}),
    });

    onSaved(optimistic);
    onClose();

    void enVocabSaveQueue.enqueue(async () => {
      try {
        const res = await fetch("/api/en-vocab/edit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [LOCALE_HEADER]: locale,
          },
          credentials: "include",
          body: JSON.stringify({
            word_id: snapshot.id,
            kind,
            word: trimmedWord,
            reading: kind === "word" ? reading.trim() || null : null,
            meaning: meaning.trim() || null,
            pos: pos.trim() || null,
            category: category.trim() || EN_VOCAB_DEFAULT_CATEGORY,
            class_notes: classNotes.trim() || null,
            usage: usage.trim() || null,
            example_sentences: nextExamples,
            ...(showMnemonic ? { mnemonic: mnemonic.trim() || null } : {}),
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
      } catch (err) {
        onSaveFailed(
          snapshot.id,
          snapshot,
          err instanceof Error
            ? err.message
            : locale === "zh"
              ? "保存失败"
              : "Save failed"
        );
      }
    });
  };

  if (!open || !mounted || !word) return null;

  return createPortal(
    <>
      <div
        className="jp-vocab-edit-overlay"
        role="presentation"
        onMouseDown={(e) => closeModalOnBackdropMouseDown(e, onClose)}
      >
        <div
          className="jp-vocab-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-vocab-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jp-vocab-edit-header">
            <div>
              <h2 id="jp-vocab-edit-title" className="jp-vocab-edit-title">
                编辑词条
              </h2>
              <p className="jp-vocab-edit-subtitle">
                熟悉程度、抽查次数等统计请在表格中直接操作，此处不可修改。
              </p>
            </div>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-vocab-edit-body">
            <div className="field">
              <label htmlFor="jp-vocab-edit-kind" className="jp-vocab-edit-label">
                类型
              </label>
              <select
                id="jp-vocab-edit-kind"
                className="jp-vocab-edit-select"
                value={kind}
                disabled={!canEdit}
                onChange={(e) => setKind(e.target.value as EnVocabKind)}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label
                htmlFor="en-vocab-edit-category"
                className="jp-vocab-edit-label"
              >
                分类
              </label>
              <input
                id="en-vocab-edit-category"
                type="text"
                className="jp-vocab-edit-input"
                list="en-vocab-category-presets"
                value={category}
                disabled={!canEdit}
                placeholder={EN_VOCAB_DEFAULT_CATEGORY}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="en-vocab-category-presets">
                {EN_VOCAB_CATEGORY_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-word" className="jp-vocab-edit-label">
                {kind === "grammar" ? "语法" : "单词 / 语法"}
                <span className="etr-required">*</span>
              </label>
              <textarea
                id="jp-vocab-edit-word"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={wordText}
                disabled={!canEdit}
                placeholder={
                  kind === "grammar" ? "例如：look forward to" : "例如：above"
                }
                onChange={(e) => setWordText(e.target.value)}
              />
            </div>

            {kind === "word" ? (
              <div className="field">
                <label
                  htmlFor="jp-vocab-edit-reading"
                  className="jp-vocab-edit-label"
                >
                  音标（可选）
                </label>
                <input
                  id="jp-vocab-edit-reading"
                  type="text"
                  className="jp-vocab-edit-input"
                  value={reading}
                  disabled={!canEdit}
                  placeholder="例如：/həˈloʊ/"
                  onChange={(e) => setReading(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label
                htmlFor="jp-vocab-edit-meaning"
                className="jp-vocab-edit-label"
              >
                释义
              </label>
              <textarea
                id="jp-vocab-edit-meaning"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={meaning}
                disabled={!canEdit}
                placeholder="例如：在……之上"
                onChange={(e) => setMeaning(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-pos" className="jp-vocab-edit-label">
                词性
              </label>
              <textarea
                id="jp-vocab-edit-pos"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={pos}
                disabled={!canEdit}
                placeholder="例如：prep/adv"
                onChange={(e) => setPos(e.target.value)}
              />
            </div>

            {showMnemonic ? (
              <div className="field">
                <label
                  htmlFor="jp-vocab-edit-mnemonic"
                  className="jp-vocab-edit-label"
                >
                  巧记
                </label>
                <textarea
                  id="jp-vocab-edit-mnemonic"
                  className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                  rows={3}
                  value={mnemonic}
                  disabled={!canEdit}
                  placeholder="联想记忆 / 口诀（仅管理员可见）"
                  onChange={(e) => setMnemonic(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label
                htmlFor="en-vocab-edit-usage"
                className="jp-vocab-edit-label"
              >
                用法
              </label>
              <EnVocabImageNotesField
                id="en-vocab-edit-usage"
                value={usage}
                onChange={setUsage}
                locale={locale}
                disabled={!canEdit}
                rows={5}
                mode="plain"
                placeholder={
                  "1. [8] 介词：表示「在……之上」；常用于描述位置关系。\n2. [5] 副词：表示「在上方；在上文中」。"
                }
                onNeedAuth={onNeedAuth}
                onError={setError}
              />
              <p className="jp-vocab-edit-hint">
                写常用用法即可（勿写考试名称标签）；编号后可写 [1]～[10]
                出现频次（如「1. [8] 动词：…」）。支持粘贴或上传图片（居中显示）。
              </p>
            </div>

            <div className="field">
              <label
                htmlFor="en-vocab-edit-example-sentences"
                className="jp-vocab-edit-label"
              >
                例句
              </label>
              <textarea
                id="en-vocab-edit-example-sentences"
                className="jp-vocab-edit-textarea"
                rows={6}
                value={exampleSentences}
                disabled={!canEdit}
                placeholder={
                  "I put the book above the shelf.\n译文：我把书放在架子上面。\nSee the note above for details.\n译文：详情见上文注释。"
                }
                onChange={(e) => setExampleSentences(e.target.value)}
              />
              <p className="jp-vocab-edit-hint">
                格式：英文句下一行写「译文：…」。列表展示时英文自动带 1、2、3…，译义行不占序号。宜与「用法」条数一一对应。
                {word?.example_sentences_source?.trim()
                  ? ` 当前例句来源：${word.example_sentences_source.trim()}（你在此修改并保存后会记为「手动」）。`
                  : " 人手填写并保存后，例句来源记为「手动」。"}
              </p>
            </div>

            <div className="field">
              <label
                htmlFor="en-vocab-edit-notes"
                className="jp-vocab-edit-label"
              >
                备注
              </label>
              <EnVocabImageNotesField
                id="en-vocab-edit-notes"
                value={classNotes}
                onChange={setClassNotes}
                locale={locale}
                disabled={!canEdit}
                rows={4}
                mode="notes-blob"
                placeholder="记录例句、易错点…"
                onNeedAuth={onNeedAuth}
                onError={setError}
              />
              <p className="jp-vocab-edit-hint">
                备注保存后会同步到英语新课；支持粘贴或上传图片（居中显示）。
              </p>
            </div>

            {error ? <p className="jp-vocab-edit-error">{error}</p> : null}
          </div>

          <div className="jp-vocab-edit-footer">
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--compact"
              onClick={onClose}
            >
              取消
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                onClick={save}
              >
                保存
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-vocab-edit-overlay {
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

        .jp-vocab-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(560px, 100%);
          max-height: min(92vh, 820px);
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-vocab-edit-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1.1rem 0.85rem;
          border-bottom: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-vocab-edit-subtitle {
          margin: 0.25rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-close {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }

        .jp-vocab-edit-body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .jp-vocab-edit-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--muted);
        }

        :global(.jp-vocab-edit-select),
        :global(.jp-vocab-edit-input),
        :global(.jp-vocab-edit-textarea) {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          padding: 0.5rem 0.65rem;
        }

        :global(.jp-vocab-edit-textarea) {
          resize: vertical;
          min-height: 2.5rem;
        }

        .jp-vocab-edit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-error {
          margin: 0;
          color: #e85d6f;
          font-size: 0.875rem;
        }

        .jp-vocab-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid
            color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }
      `}</style>
    </>,
    document.body
  );
}
