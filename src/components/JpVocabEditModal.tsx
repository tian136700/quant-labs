"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { jpVocabRefApiPath, jpVocabRefViewerPath } from "@/lib/jp-vocab-ref-shared";
import {
  buildOptimisticJpVocabWord,
  syncJpVocabEditResponse,
} from "@/lib/jp-vocab-optimistic-save";
import { closeModalOnBackdropMouseDown } from "@/lib/modal-backdrop";
import { jpVocabSaveQueue } from "@/lib/request-queue";
import { formatUploadBytes, uploadFormWithProgress, type UploadProgressEvent } from "@/lib/upload-form-progress";
import type { JpVocabKind, JpVocabRef, JpVocabWord } from "@/lib/types";

type Props = {
  open: boolean;
  word: JpVocabWord | null;
  refs: Record<string, JpVocabRef>;
  locale: "en" | "zh";
  canEdit: boolean;
  /** 管理员可见/可编辑巧记 */
  showMnemonic?: boolean;
  onClose: () => void;
  onSaved: (word: JpVocabWord) => void;
  onRefUpdated: (ref: JpVocabRef) => void;
  onSaveFailed: (wordId: number, snapshot: JpVocabWord, message: string) => void;
  onNeedAuth: () => void;
};

const KIND_OPTIONS: { key: JpVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

const REF_ERR = {
  zh: {
    no_ref_key: "当前词条还没有绑定教案地址，暂时不能在这里替换教案。",
    file_required: "请选择或粘贴新的教案图片 / PDF。",
    file_too_large: "文件过大（最大 20MB）",
    ref_not_found: "未找到当前教案地址，无法替换。",
    empty_file: "文件为空",
    upload_failed: "教案上传失败",
  },
  en: {
    no_ref_key: "This entry is not linked to a lesson plan yet.",
    file_required: "Please choose or paste a new lesson plan file.",
    file_too_large: "File too large (max 20MB)",
    ref_not_found: "Lesson plan not found",
    empty_file: "Empty file",
    upload_failed: "Lesson plan upload failed",
  },
};

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

function uploadProgressLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") return "文件已传完，服务器保存中…";
  if (event.phase === "done") return "上传完成";
  if (event.total > 0) {
    return `正在上传 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) return `正在上传 ${formatUploadBytes(event.loaded)}…`;
  return "准备上传…";
}

export function JpVocabEditModal({
  open,
  word,
  refs,
  locale,
  canEdit,
  showMnemonic = false,
  onClose,
  onSaved,
  onRefUpdated,
  onSaveFailed,
  onNeedAuth,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<JpVocabKind>("word");
  const [wordText, setWordText] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [pos, setPos] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [exampleSentences, setExampleSentences] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState("");
  const [refError, setRefError] = useState("");
  const [currentRefMeta, setCurrentRefMeta] = useState<JpVocabRef | null>(null);
  const [newRefFile, setNewRefFile] = useState<File | null>(null);
  const [newRefPreviewUrl, setNewRefPreviewUrl] = useState<string | null>(null);
  const [zoomTarget, setZoomTarget] = useState<"current" | "new" | null>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEvent | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const initializedWordIdRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      initializedWordIdRef.current = null;
      return;
    }
    if (!word || initializedWordIdRef.current === word.id) return;

    initializedWordIdRef.current = word.id;
    setKind(word.kind);
    setWordText(word.word);
    setReading(word.reading || "");
    setMeaning(word.meaning || "");
    setPos(word.pos || "");
    setClassNotes(word.class_notes || "");
    setExampleSentences(word.example_sentences || "");
    setMnemonic(word.mnemonic || "");
    setError("");
    setRefError("");
    setCurrentRefMeta(word.ref_key ? refs[word.ref_key] ?? null : null);
    setNewRefFile(null);
    setNewRefPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setZoomTarget(null);
    setUploadProgress(null);
  }, [open, word, refs]);

  useEffect(() => {
    if (!open || !word?.ref_key) return;
    setCurrentRefMeta(refs[word.ref_key] ?? null);
  }, [open, word?.ref_key, refs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomTarget) {
        setZoomTarget(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, zoomTarget]);

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
      if (newRefPreviewUrl) URL.revokeObjectURL(newRefPreviewUrl);
    };
  }, [newRefPreviewUrl]);

  const applyRefFile = (file: File) => {
    setRefError("");
    setZoomTarget(null);
    setNewRefFile(file);
    setNewRefPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        return URL.createObjectURL(file);
      }
      return null;
    });
  };

  const clearRefFile = () => {
    setNewRefFile(null);
    setNewRefPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadProgress(null);
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const onRefPaste = (e: React.ClipboardEvent) => {
    if (uploadingRef || !canEdit) return;
    const picked = pickClipboardImage(e.clipboardData.items);
    if (!picked) return;
    e.preventDefault();
    applyRefFile(picked);
  };

  const openNewRefPreview = () => {
    if (!newRefFile || !newRefPreviewUrl) return;
    if (newRefFile.type.startsWith("image/")) {
      setZoomTarget("new");
      return;
    }
    if (newRefFile.type === "application/pdf") {
      window.open(newRefPreviewUrl, "_blank", "noopener,noreferrer");
    }
  };

  const currentRefKey = word?.ref_key || null;
  const currentRefMediaUrl =
    currentRefKey && currentRefMeta
      ? jpVocabRefApiPath(currentRefKey, { v: currentRefMeta.updated_at })
      : "";
  const currentRefViewerUrl =
    currentRefKey && currentRefMeta
      ? jpVocabRefViewerPath(currentRefKey, currentRefMeta.updated_at)
      : "";
  const currentRefIsPdf = currentRefMeta?.media_type === "pdf";

  const openCurrentRefPreview = () => {
    if (!currentRefKey || !currentRefMeta) return;
    if (currentRefIsPdf) {
      window.open(currentRefViewerUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setZoomTarget("current");
  };

  const saveRef = async (): Promise<JpVocabRef | null> => {
    if (!word) return null;
    if (!canEdit) {
      onNeedAuth();
      return null;
    }
    if (!currentRefKey) {
      setRefError(REF_ERR[locale].no_ref_key);
      return null;
    }
    if (!newRefFile) {
      setRefError(REF_ERR[locale].file_required);
      return null;
    }

    setUploadingRef(true);
    setRefError("");
    setUploadProgress({
      phase: "uploading",
      percent: 0,
      loaded: 0,
      total: newRefFile.size,
    });

    try {
      const form = new FormData();
      form.append("ref_key", currentRefKey);
      form.append("file", newRefFile);
      if (newRefFile.type === "application/pdf") {
        form.append("media_type", "pdf");
      }

      const result = await uploadFormWithProgress({
        url: "/api/jp-vocab/ref/replace",
        form,
        headers: { [LOCALE_HEADER]: locale },
        onProgress: setUploadProgress,
      });

      const data = result.data as {
        ok?: boolean;
        ref?: JpVocabRef;
        error?: string;
      };

      if (result.status === 401) {
        onNeedAuth();
        throw new Error(locale === "zh" ? "请登录后再编辑教案。" : "Please log in.");
      }
      if (!result.ok || !data.ok || !data.ref) {
        const msg =
          (data.error && REF_ERR[locale][data.error as keyof (typeof REF_ERR)["zh"]]) ||
          data.error ||
          REF_ERR[locale].upload_failed;
        throw new Error(msg);
      }

      setCurrentRefMeta(data.ref);
      onRefUpdated(data.ref);
      setUploadProgress({
        phase: "done",
        percent: 100,
        loaded: newRefFile.size,
        total: newRefFile.size,
      });
      clearRefFile();
      return data.ref;
    } catch (err) {
      setRefError(err instanceof Error ? err.message : REF_ERR[locale].upload_failed);
      setUploadProgress(null);
      return null;
    } finally {
      setUploadingRef(false);
    }
  };

  const save = async () => {
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
    setRefError("");

    if (newRefFile) {
      const savedRef = await saveRef();
      if (!savedRef) {
        return;
      }
    }

    const snapshot = word;
    const optimistic = buildOptimisticJpVocabWord(snapshot, {
      kind,
      word: trimmedWord,
      reading: kind === "word" ? reading.trim() || null : null,
      meaning: meaning.trim() || null,
      pos: pos.trim() || null,
      class_notes: classNotes.trim() || null,
      example_sentences: exampleSentences.trim() || null,
      ...(showMnemonic ? { mnemonic: mnemonic.trim() || null } : {}),
    });

    onSaved(optimistic);
    onClose();

    void jpVocabSaveQueue.enqueue(async () => {
      try {
        const res = await fetch("/api/jp-vocab/edit", {
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
            class_notes: classNotes.trim() || null,
            example_sentences: exampleSentences.trim() || null,
            ...(showMnemonic ? { mnemonic: mnemonic.trim() || null } : {}),
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
      } catch (err) {
        onSaveFailed(
          snapshot.id,
          snapshot,
          err instanceof Error ? err.message : locale === "zh" ? "保存失败" : "Save failed"
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
            {showMnemonic ? (
              <div className="field">
                <label htmlFor="jp-vocab-edit-mnemonic" className="jp-vocab-edit-label">
                  巧记
                </label>
                <textarea
                  id="jp-vocab-edit-mnemonic"
                  className="jp-vocab-edit-textarea jp-vocab-edit-textarea--lg"
                  rows={4}
                  value={mnemonic}
                  disabled={!canEdit}
                  placeholder="联想记忆、谐音梗、拆分口诀等（仅管理员可见）"
                  onChange={(e) => setMnemonic(e.target.value)}
                />
                <p className="jp-vocab-edit-hint">
                  用于管理员复习与自查，不会展示给老师或学生端。
                </p>
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="jp-vocab-edit-kind" className="jp-vocab-edit-label">
                类型
              </label>
              <select
                id="jp-vocab-edit-kind"
                className="jp-vocab-edit-select"
                value={kind}
                disabled={!canEdit}
                onChange={(e) => setKind(e.target.value as JpVocabKind)}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
                placeholder={kind === "grammar" ? "例如：～ばかり" : "例如：勉強"}
                onChange={(e) => setWordText(e.target.value)}
              />
            </div>

            {kind === "word" ? (
              <div className="field">
                <label htmlFor="jp-vocab-edit-reading" className="jp-vocab-edit-label">
                  读音（可选）
                </label>
                <input
                  id="jp-vocab-edit-reading"
                  type="text"
                  className="jp-vocab-edit-input"
                  value={reading}
                  disabled={!canEdit}
                  placeholder="例如：べんきょう"
                  onChange={(e) => setReading(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="jp-vocab-edit-meaning" className="jp-vocab-edit-label">
                释义
              </label>
              <textarea
                id="jp-vocab-edit-meaning"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={2}
                value={meaning}
                disabled={!canEdit}
                placeholder="例如：学习"
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
                placeholder="例如：名词、动词、形容词"
                onChange={(e) => setPos(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-edit-example-sentences" className="jp-vocab-edit-label">
                例句
              </label>
              <textarea
                id="jp-vocab-edit-example-sentences"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--sm"
                rows={3}
                value={exampleSentences}
                disabled={!canEdit}
                placeholder="日语例句与下一行汉语意思可成对写。例：&#10;日本語を習います。&#10;我学习日语。&#10;ピアノを習いたいです。&#10;我想学钢琴。"
                onChange={(e) => setExampleSentences(e.target.value)}
              />
              <p className="jp-vocab-edit-hint">
                保存后会在「课堂带读」列表中展示；日语抽问表格不显示此列。
              </p>
            </div>

            <div className="field jp-vocab-edit-notes-field">
              <label htmlFor="jp-vocab-edit-notes" className="jp-vocab-edit-label">
                备注
              </label>
              <textarea
                id="jp-vocab-edit-notes"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--lg"
                rows={4}
                value={classNotes}
                disabled={!canEdit}
                placeholder="记录例句、用法、易错点…"
                onChange={(e) => setClassNotes(e.target.value)}
              />
              <p className="jp-vocab-edit-hint">备注保存后会同步到日语新课。</p>
            </div>

            <div className="field jp-vocab-edit-ref-field" onPaste={onRefPaste}>
              <div className="jp-vocab-edit-ref-head">
                <label className="jp-vocab-edit-label">教案</label>
                {currentRefKey ? (
                  <span className="jp-vocab-edit-ref-key">共享地址：`{currentRefKey}`</span>
                ) : (
                  <span className="jp-vocab-edit-ref-key">当前词条还没绑定教案</span>
                )}
              </div>
              <p className="jp-vocab-edit-hint">
                同一个教案地址被多个语法 / 单词共用时，这里替换后会一起更新。
              </p>

              <div className="jp-vocab-edit-ref-grid">
                <div className="jp-vocab-edit-ref-col">
                  <div className="jp-vocab-edit-ref-title-row">
                    <span className="jp-vocab-edit-ref-title">旧教案</span>
                    {currentRefViewerUrl ? (
                      <a
                        href={currentRefViewerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jp-vocab-edit-ref-link"
                      >
                        新标签页打开
                      </a>
                    ) : null}
                  </div>
                  {currentRefKey && currentRefMeta ? (
                    currentRefIsPdf ? (
                      <button
                        type="button"
                        className="jp-vocab-edit-ref-card jp-vocab-edit-ref-card--pdf"
                        onClick={openCurrentRefPreview}
                      >
                        <span className="jp-vocab-edit-ref-pdf-badge">PDF</span>
                        <span className="jp-vocab-edit-ref-card-title">当前 PDF 教案</span>
                        <span className="jp-vocab-edit-ref-card-hint">点击预览</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="jp-vocab-edit-ref-card"
                        onClick={openCurrentRefPreview}
                        title="点击放大预览旧教案"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentRefMediaUrl}
                          alt="旧教案预览"
                          className="jp-vocab-edit-ref-current-img"
                        />
                        <span className="jp-vocab-edit-ref-card-hint">点击放大预览</span>
                      </button>
                    )
                  ) : (
                    <div className="jp-vocab-edit-ref-empty">暂无旧教案</div>
                  )}
                </div>

                <div className="jp-vocab-edit-ref-col">
                  <div className="jp-vocab-edit-ref-title-row">
                    <span className="jp-vocab-edit-ref-title">新教案</span>
                    <span className="jp-vocab-edit-ref-mini-hint">支持上传或直接粘贴截图</span>
                  </div>

                  <div
                    className={`jp-vocab-edit-ref-drop${newRefFile ? " has-file" : ""}${
                      uploadingRef ? " is-disabled" : ""
                    }`}
                    onPaste={onRefPaste}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!uploadingRef) e.currentTarget.classList.add("is-dragover");
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("is-dragover");
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("is-dragover");
                      if (uploadingRef) return;
                      const picked = e.dataTransfer.files[0];
                      if (picked) applyRefFile(picked);
                    }}
                  >
                    {newRefFile ? (
                      <div className="jp-vocab-edit-ref-picked">
                        {newRefPreviewUrl && newRefFile.type.startsWith("image/") ? (
                          <button
                            type="button"
                            className="jp-vocab-edit-ref-preview-btn"
                            onClick={() => setZoomTarget("new")}
                            title="点击放大预览新教案"
                            disabled={uploadingRef}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={newRefPreviewUrl}
                              alt="新教案预览"
                              className="jp-vocab-edit-ref-preview"
                            />
                            <span className="jp-vocab-edit-ref-preview-hint">点击放大</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="jp-vocab-edit-ref-pdf-icon"
                            onClick={openNewRefPreview}
                            disabled={uploadingRef}
                          >
                            PDF
                          </button>
                        )}
                        <div className="jp-vocab-edit-ref-picked-meta">
                          <span className="jp-vocab-edit-ref-picked-name">{newRefFile.name}</span>
                          <span className="jp-vocab-edit-ref-picked-size">
                            {formatUploadBytes(newRefFile.size)}
                          </span>
                          {newRefPreviewUrl ? (
                            <button
                              type="button"
                              className="jp-vocab-edit-ref-link-btn"
                              onClick={openNewRefPreview}
                              disabled={uploadingRef}
                            >
                              {newRefFile.type.startsWith("image/") ? "放大预览" : "预览 PDF"}
                            </button>
                          ) : null}
                        </div>
                        {!uploadingRef ? (
                          <button
                            type="button"
                            className="jp-vocab-edit-ref-remove"
                            onClick={clearRefFile}
                          >
                            移除
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <p className="jp-vocab-edit-ref-drop-title">拖拽、粘贴或选择图片 / PDF</p>
                        <p className="jp-vocab-edit-ref-drop-hint">
                          支持 PNG / JPG / PDF，最大 20MB；弹窗内可按 Ctrl+V / ⌘V 粘贴截图
                        </p>
                        <button
                          type="button"
                          className="jp-vocab-edit-ref-pick-btn"
                          disabled={!canEdit || uploadingRef || !currentRefKey}
                          onClick={() => refFileInputRef.current?.click()}
                        >
                          选择文件
                        </button>
                      </>
                    )}
                    <input
                      ref={refFileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      hidden
                      disabled={!canEdit || uploadingRef || !currentRefKey}
                      onChange={(e) => {
                        const picked = e.target.files?.[0];
                        if (picked) applyRefFile(picked);
                      }}
                    />
                  </div>
                </div>
              </div>

              {uploadingRef && uploadProgress ? (
                <div className="jp-vocab-edit-ref-progress" aria-live="polite">
                  <div className="jp-vocab-edit-ref-progress-head">
                    <span>{uploadProgressLabel(uploadProgress)}</span>
                    <span>
                      {uploadProgress.phase === "uploading" && uploadProgress.total > 0
                        ? `${uploadProgress.percent}%`
                        : uploadProgress.phase === "processing"
                          ? "处理中"
                          : "100%"}
                    </span>
                  </div>
                  <div
                    className={`jp-vocab-edit-ref-progress-track${
                      uploadProgress.phase === "processing" ? " is-processing" : ""
                    }`}
                  >
                    <div
                      className="jp-vocab-edit-ref-progress-bar"
                      style={{
                        width:
                          uploadProgress.phase === "processing"
                            ? "100%"
                            : `${uploadProgress.percent}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {refError ? <p className="jp-vocab-edit-error">{refError}</p> : null}
            </div>

            {error ? <p className="jp-vocab-edit-error">{error}</p> : null}
          </div>

          <div className="jp-vocab-edit-footer">
            {canEdit ? (
              <button
                type="button"
                className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                disabled={uploadingRef}
                onClick={() => void save()}
              >
                {uploadingRef ? "上传中…" : "保存"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .jp-vocab-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
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
          width: min(520px, 100%);
          max-height: min(92vh, 720px);
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
          border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-title {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-vocab-edit-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.75rem;
          line-height: 1.45;
          color: var(--muted);
        }

        .jp-vocab-edit-close {
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

        .jp-vocab-edit-body {
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          overflow-y: auto;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .jp-vocab-edit-label {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-input,
        .jp-vocab-edit-select,
        .jp-vocab-edit-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.55rem 0.65rem;
          line-height: 1.45;
        }

        .jp-vocab-edit-select {
          cursor: pointer;
        }

        .jp-vocab-edit-select:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-vocab-edit-textarea {
          resize: vertical;
        }

        .jp-vocab-edit-textarea--sm {
          min-height: 3.2rem;
        }

        .jp-vocab-edit-textarea--lg {
          min-height: 5.5rem;
        }

        .jp-vocab-edit-hint {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-field {
          gap: 0.5rem;
        }

        .jp-vocab-edit-ref-head,
        .jp-vocab-edit-ref-title-row,
        .jp-vocab-edit-ref-progress-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .jp-vocab-edit-ref-key,
        .jp-vocab-edit-ref-mini-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .jp-vocab-edit-ref-col {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-width: 0;
        }

        .jp-vocab-edit-ref-title {
          font-size: 0.8125rem;
          color: var(--text);
          font-weight: 600;
        }

        .jp-vocab-edit-ref-link,
        .jp-vocab-edit-ref-link-btn {
          padding: 0;
          border: none;
          background: none;
          color: var(--accent);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .jp-vocab-edit-ref-link {
          text-decoration: none;
        }

        .jp-vocab-edit-ref-link:hover {
          text-decoration: underline;
        }

        .jp-vocab-edit-ref-card,
        .jp-vocab-edit-ref-empty {
          width: 100%;
          min-height: 10.5rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg);
        }

        .jp-vocab-edit-ref-card {
          padding: 0;
          overflow: hidden;
          cursor: pointer;
        }

        .jp-vocab-edit-ref-card--pdf {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 1rem;
        }

        .jp-vocab-edit-ref-current-img {
          display: block;
          width: 100%;
          max-height: 9rem;
          object-fit: contain;
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }

        .jp-vocab-edit-ref-card-title {
          color: var(--text);
          font-size: 0.875rem;
        }

        .jp-vocab-edit-ref-card-hint {
          display: block;
          padding: 0.45rem 0.65rem;
          text-align: center;
          font-size: 0.75rem;
          color: var(--muted);
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--panel) 92%, transparent);
        }

        .jp-vocab-edit-ref-pdf-badge,
        .jp-vocab-edit-ref-pdf-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 3rem;
          height: 3rem;
          padding: 0.35rem 0.55rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--rise) 12%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
          font-weight: 700;
        }

        .jp-vocab-edit-ref-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          border-style: dashed;
          color: var(--muted);
          font-size: 0.8125rem;
        }

        .jp-vocab-edit-ref-drop {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 10.5rem;
          padding: 1rem;
          border: 1.5px dashed color-mix(in srgb, var(--border) 90%, var(--accent));
          border-radius: 10px;
          background:
            radial-gradient(
              circle at top,
              color-mix(in srgb, var(--accent) 8%, transparent),
              transparent 55%
            ),
            color-mix(in srgb, var(--bg) 70%, var(--panel));
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }

        .jp-vocab-edit-ref-drop.is-dragover {
          border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
        }

        .jp-vocab-edit-ref-drop.has-file {
          align-items: stretch;
          justify-content: flex-start;
        }

        .jp-vocab-edit-ref-drop.is-disabled {
          opacity: 0.72;
          pointer-events: none;
        }

        .jp-vocab-edit-ref-drop-title {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text);
          text-align: center;
        }

        .jp-vocab-edit-ref-drop-hint {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--muted);
          text-align: center;
        }

        .jp-vocab-edit-ref-pick-btn,
        .jp-vocab-edit-ref-remove {
          min-height: 2.2rem;
          padding: 0.35rem 0.9rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font: inherit;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .jp-vocab-edit-ref-remove {
          min-height: 2rem;
          padding: 0.25rem 0.65rem;
          border-color: var(--border);
          background: var(--panel);
          color: var(--muted);
        }

        .jp-vocab-edit-ref-picked {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .jp-vocab-edit-ref-preview-btn {
          position: relative;
          flex-shrink: 0;
          padding: 0;
          border: none;
          border-radius: 8px;
          background: none;
          cursor: pointer;
          overflow: hidden;
        }

        .jp-vocab-edit-ref-preview {
          display: block;
          width: 4.75rem;
          height: 4.75rem;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
        }

        .jp-vocab-edit-ref-preview-hint {
          position: absolute;
          inset: auto 0 0 0;
          padding: 0.15rem 0.25rem;
          font-size: 0.625rem;
          line-height: 1.2;
          text-align: center;
          color: #fff;
          background: rgba(0, 0, 0, 0.55);
        }

        .jp-vocab-edit-ref-picked-meta {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .jp-vocab-edit-ref-picked-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text);
          font-size: 0.875rem;
        }

        .jp-vocab-edit-ref-picked-size {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .jp-vocab-edit-ref-progress-head {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-vocab-edit-ref-progress-track {
          position: relative;
          height: 0.45rem;
          border-radius: 999px;
          overflow: hidden;
          background: color-mix(in srgb, var(--border) 70%, transparent);
        }

        .jp-vocab-edit-ref-progress-track.is-processing .jp-vocab-edit-ref-progress-bar {
          position: absolute;
          left: 0;
          top: 0;
          width: 35% !important;
          animation: jp-vocab-edit-ref-upload-indeterminate 1.1s ease-in-out infinite;
        }

        @keyframes jp-vocab-edit-ref-upload-indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        .jp-vocab-edit-ref-progress-bar {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            color-mix(in srgb, var(--accent) 85%, white),
            var(--accent)
          );
          transition: width 0.08s linear;
        }

        .jp-vocab-edit-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-vocab-edit-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          flex-shrink: 0;
        }

        .jp-vocab-edit-zoom {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: rgba(8, 12, 18, 0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }

        .jp-vocab-edit-zoom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: var(--muted);
          font-size: 0.8125rem;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        }

        .jp-vocab-edit-zoom-stage {
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          overflow: auto;
        }

        .jp-vocab-edit-zoom-stage :global(img) {
          max-width: min(96vw, 1200px);
          max-height: calc(100vh - 4rem);
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        }

        @media (max-width: 720px) {
          .jp-vocab-edit-ref-grid {
            grid-template-columns: 1fr;
          }

          .jp-vocab-edit-ref-picked {
            align-items: flex-start;
          }
        }
      `}</style>

      {zoomTarget &&
      ((zoomTarget === "current" && currentRefMediaUrl && !currentRefIsPdf) ||
        (zoomTarget === "new" && newRefPreviewUrl && newRefFile?.type.startsWith("image/"))) ? (
        <div
          className="jp-vocab-edit-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案大图预览"
          onClick={() => setZoomTarget(null)}
        >
          <div className="jp-vocab-edit-zoom-bar">
            <span>
              {zoomTarget === "current"
                ? "旧教案 · 点击空白处或按 Esc 关闭"
                : "新教案 · 点击空白处或按 Esc 关闭"}
            </span>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={() => setZoomTarget(null)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-edit-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomTarget === "current" ? currentRefMediaUrl : newRefPreviewUrl || ""}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
    </>,
    document.body
  );
}
