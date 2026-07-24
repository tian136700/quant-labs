"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readApiJson } from "@/lib/api-json";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  jpVocabRefKeyFromBytes,
  sha256HexBytes,
} from "@/lib/jp-vocab-ref-shared";
import { findDuplicateJpVocabExamplePrimaries } from "@/lib/jp-vocab-example-sentences";
import {
  appendJpVocabClassNoteImageLine,
  collectJpVocabClassNoteImageRefKeysFromContent,
  jpVocabClassNoteImageRefKeyFromSrc,
  mergeJpVocabClassNoteDraftFromEdit,
  removeJpVocabClassNoteImageAt,
  splitJpVocabClassNoteDraftForEdit,
} from "@/lib/jp-vocab-class-notes";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import {
  formatUploadBytes,
  uploadFormWithProgress,
  type UploadProgressEvent,
} from "@/lib/upload-form-progress";
import type { JpVocabKind, JpVocabRef, JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { JpVocabManualAddModalStyles } from "@/components/jp-vocab-manual-add-modal/JpVocabManualAddModalStyles";

type Props = {
  open: boolean;
  locale: "en" | "zh";
  onClose: () => void;
  onAdded: (word: JpVocabWord, ref?: JpVocabRef, refDeduped?: boolean) => void;
};

type ImageState = {
  file: File;
  previewUrl: string;
  hash: string;
  refKey: string;
};

const KIND_OPTIONS: { key: JpVocabKind; label: string }[] = [
  { key: "word", label: "单词" },
  { key: "grammar", label: "语法" },
];

const imageRefCache = new Map<string, string>();
const uploadedImageHashes = new Set<string>();

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

function noteImageUploadLabel(event: UploadProgressEvent): string {
  if (event.phase === "processing") return "图片已传完，服务器保存中…";
  if (event.phase === "done") return "图片上传完成";
  if (event.total > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) return `正在上传图片 ${formatUploadBytes(event.loaded)}…`;
  return "正在上传图片…";
}

function noteImageUploadPercent(event: UploadProgressEvent): number {
  if (event.phase === "processing") return 95;
  if (event.phase === "done") return 100;
  return Math.max(0, Math.min(92, event.percent));
}

export function JpVocabManualAddModal({
  open,
  locale,
  onClose,
  onAdded,
}: Props) {
  const [kind, setKind] = useState<JpVocabKind>("word");
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [classNotes, setClassNotes] = useState("");
  const [exampleSentences, setExampleSentences] = useState("");
  const [refTitle, setRefTitle] = useState("");
  const [image, setImage] = useState<ImageState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dedupeHint, setDedupeHint] = useState("");
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const [noteImageUploading, setNoteImageUploading] = useState(false);
  const [noteImageUploadProgress, setNoteImageUploadProgress] =
    useState<UploadProgressEvent | null>(null);
  const [noteZoomSrc, setNoteZoomSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const noteImageUploadingRef = useRef(false);
  const classNotesValueRef = useRef("");
  const dropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    classNotesValueRef.current = classNotes;
  }, [classNotes]);

  const resetForm = useCallback(() => {
    setKind("word");
    setWord("");
    setReading("");
    setMeaning("");
    setClassNotes("");
    classNotesValueRef.current = "";
    setExampleSentences("");
    setRefTitle("");
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setError("");
    setDedupeHint("");
    setImageZoomOpen(false);
    setNoteZoomSrc(null);
    noteImageUploadingRef.current = false;
    setNoteImageUploading(false);
    setNoteImageUploadProgress(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || submitting) return;
      if (noteZoomSrc) {
        setNoteZoomSrc(null);
        return;
      }
      if (imageZoomOpen) {
        setImageZoomOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose, imageZoomOpen, noteZoomSrc]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  const applyImageFile = async (file: File) => {
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const hash = await sha256HexBytes(bytes);
      const refKey = await jpVocabRefKeyFromBytes(bytes);
      const reuseUploaded = uploadedImageHashes.has(hash);
      imageRefCache.set(hash, refKey);

      const previewUrl = URL.createObjectURL(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return { file, previewUrl, hash, refKey };
      });
      setDedupeHint(
        reuseUploaded
          ? "检测到相同教案图片，将共用已有链接（不会重复上传）。"
          : ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片处理失败");
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    // 备注区自己处理贴图；避免冒泡到整窗后误当成教案图
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".jp-vocab-add-notes-field")) return;
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    void applyImageFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void applyImageFile(file);
  };

  const uploadOneNoteImage = async (file: File): Promise<"ok" | "dup" | "fail"> => {
    setNoteImageUploadProgress({
      phase: "uploading",
      percent: 0,
      loaded: 0,
      total: file.size,
    });
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadFormWithProgress({
        url: "/api/jp-vocab/class-notes/upload",
        form,
        headers: { [LOCALE_HEADER]: locale },
        onProgress: setNoteImageUploadProgress,
      });
      const data = (result.data ?? {}) as {
        ok?: boolean;
        view_path?: string;
        ref_key?: string;
        error?: string;
      };
      if (!result.ok || !data.ok || !data.view_path) {
        throw new Error(data.error || "图片上传失败");
      }
      const viewPath = data.view_path;
      const refKey =
        (typeof data.ref_key === "string" && data.ref_key.trim()) ||
        jpVocabClassNoteImageRefKeyFromSrc(viewPath);
      const existingKeys = collectJpVocabClassNoteImageRefKeysFromContent(
        classNotesValueRef.current
      );
      if (refKey && existingKeys.has(refKey)) {
        setError("请审核你的图片：备注里已经有一张相同的了，请勿重复粘贴。");
        return "dup";
      }
      setNoteImageUploadProgress({
        phase: "done",
        percent: 100,
        loaded: file.size,
        total: file.size,
      });
      const next = appendJpVocabClassNoteImageLine(classNotesValueRef.current, viewPath);
      classNotesValueRef.current = next;
      setClassNotes(next);
      setError("");
      return "ok";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return "fail";
    }
  };

  const uploadNoteImages = async (files: File[]) => {
    if (submitting) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      setError("仅支持图片文件。");
      return;
    }
    if (noteImageUploadingRef.current) {
      setError("请等待当前图片上传完成后再传下一张");
      return;
    }
    noteImageUploadingRef.current = true;
    setNoteImageUploading(true);
    setError("");
    try {
      for (const file of images) {
        const outcome = await uploadOneNoteImage(file);
        if (outcome === "fail") break;
      }
    } finally {
      noteImageUploadingRef.current = false;
      setNoteImageUploading(false);
      setNoteImageUploadProgress(null);
    }
  };

  const onNotesPaste = (e: React.ClipboardEvent) => {
    if (submitting) return;
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    void uploadNoteImages([file]);
  };

  const onNotesDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("is-dragover");
    if (submitting || noteImageUploadingRef.current) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    void uploadNoteImages(files);
  };

  const submit = async () => {
    if (submitting) return;
    if (noteImageUploading || noteImageUploadingRef.current) {
      setError("备注图片仍在上传，请稍后再添加。");
      return;
    }
    const trimmedWord = word.trim();
    if (!trimmedWord) {
      setError("请填写单词或语法。");
      return;
    }

    const duplicateExamples = findDuplicateJpVocabExamplePrimaries(exampleSentences);
    if (duplicateExamples.length > 0) {
      const listed = duplicateExamples.map((s) => `「${s}」`).join("\n");
      if (
        !window.confirm(
          `检测到重复的日语例句，请查证后再保存：\n\n${listed}\n\n仍要强制保存吗？`
        )
      ) {
        setError(`例句重复，请查证后再保存：${duplicateExamples.join("；")}`);
        return;
      }
    }

    setSubmitting(true);
    setError("");

    const postAdd = async (reuseRefOnly: boolean) => {
      const form = new FormData();
      form.set("word", trimmedWord);
      form.set("kind", kind);
      if (reading.trim()) form.set("reading", reading.trim());
      if (meaning.trim()) form.set("meaning", meaning.trim());
      if (classNotes.trim()) form.set("class_notes", classNotes.trim());
      if (exampleSentences.trim()) form.set("example_sentences", exampleSentences.trim());
      if (refTitle.trim()) form.set("ref_title", refTitle.trim());

      if (image) {
        if (reuseRefOnly && uploadedImageHashes.has(image.hash)) {
          form.set("ref_key", image.refKey);
        } else {
          form.set("file", image.file);
        }
      }

      const res = await fetch("/api/jp-vocab/add", {
        method: "POST",
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        body: form,
      });

      return readApiJson<{
        ok: boolean;
        word?: JpVocabWord;
        ref_key?: string | null;
        ref_deduped?: boolean;
        error?: string;
      }>(res);
    };

    try {
      let parsed = await postAdd(true);
      const refInvalid =
        image &&
        uploadedImageHashes.has(image.hash) &&
        parsed.ok &&
        !parsed.data.ok &&
        (parsed.data.error === "教案链接无效" ||
          parsed.data.error === "Invalid ref_key");

      if (refInvalid) {
        uploadedImageHashes.delete(image.hash);
        parsed = await postAdd(false);
      }

      if (!parsed.ok) {
        throw new Error(parsed.error || "添加失败");
      }

      const { data, status } = parsed;
      if (status >= 400 || !data.ok || !data.word) {
        throw new Error(data.error || `添加失败（${status}）`);
      }

      if (data.ref_key && image) {
        imageRefCache.set(image.hash, data.ref_key);
        uploadedImageHashes.add(image.hash);
      }

      const ref: JpVocabRef | undefined =
        data.ref_key != null
          ? {
              ref_key: data.ref_key,
              title: refTitle.trim() || null,
              media_type: "image",
              r2_key: `local:${data.ref_key}`,
              created_at: data.word.created_at,
              updated_at: data.word.updated_at,
            }
          : undefined;

      onAdded(data.word, ref, data.ref_deduped);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted) return null;

  const { text: classNotesText, imageSrcs: classNotesImageSrcs } =
    splitJpVocabClassNoteDraftForEdit(classNotes);

  return createPortal(
    <>
      <div
        className="jp-vocab-add-overlay"
        role="presentation"
        onClick={() => {
          if (!submitting) onClose();
        }}
      >
        <div
          className="jp-vocab-add-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jp-vocab-add-title"
          onClick={(e) => e.stopPropagation()}
          onPaste={onPaste}
        >
          <div className="jp-vocab-add-header">
            <div className="jp-vocab-add-heading">
              <h2 id="jp-vocab-add-title" className="jp-vocab-add-title">
                手动添加词条
              </h2>
              <p className="jp-vocab-add-subtitle">补充单词或语法，可选关联教案</p>
            </div>
            <button
              type="button"
              className="jp-vocab-add-close"
              onClick={onClose}
              disabled={submitting}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div className="jp-vocab-add-body">
            <div className="field">
              <span className="jp-vocab-add-field-label">类型</span>
              <div className="jp-vocab-add-segment" role="radiogroup" aria-label="词条类型">
                {KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={kind === opt.key}
                    className={`jp-vocab-add-segment-btn${
                      kind === opt.key ? " is-active" : ""
                    }`}
                    onClick={() => setKind(opt.key)}
                    disabled={submitting}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-word">
                {kind === "grammar" ? "语法" : "单词"}
                <span className="etr-required">*</span>
              </label>
              <input
                id="jp-vocab-add-word"
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={kind === "grammar" ? "例如：～ばかり" : "例如：勉強"}
                disabled={submitting}
                autoFocus
              />
            </div>

            {kind === "word" ? (
              <div className="field">
                <label htmlFor="jp-vocab-add-reading">读音（可选）</label>
                <input
                  id="jp-vocab-add-reading"
                  type="text"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                  placeholder="例如：べんきょう"
                  disabled={submitting}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="jp-vocab-add-meaning">释义</label>
              <input
                id="jp-vocab-add-meaning"
                type="text"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="例如：学习"
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-example-sentences">例句（可选）</label>
              <textarea
                id="jp-vocab-add-example-sentences"
                className="jp-vocab-add-textarea"
                rows={3}
                value={exampleSentences}
                onChange={(e) => setExampleSentences(e.target.value)}
                placeholder="例：&#10;日本語を習います。&#10;译文：我学习日语。"
                disabled={submitting}
              />
            </div>

            <div
              className="field jp-vocab-add-notes-field"
              onPaste={onNotesPaste}
              onDragOver={(e) => {
                if (submitting || noteImageUploading) return;
                if (![...e.dataTransfer.types].includes("Files")) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.add("is-dragover");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("is-dragover");
              }}
              onDrop={onNotesDrop}
            >
              <label htmlFor="jp-vocab-add-notes">备注（可选）</label>
              <div className="jp-vocab-add-notes-toolbar">
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  disabled={submitting || noteImageUploading}
                  onClick={() => noteImageInputRef.current?.click()}
                >
                  {noteImageUploading ? "上传中…" : "上传图片"}
                </button>
                <span className="jp-vocab-add-notes-toolbar-hint">
                  {noteImageUploading
                    ? "上传完成前不可再贴图或选图"
                    : "可多选；支持拖拽 / Ctrl+V / ⌘V 粘贴截图；相同图片不会重复加入"}
                </span>
                <input
                  ref={noteImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={submitting || noteImageUploading}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (files.length) void uploadNoteImages(files);
                  }}
                />
              </div>
              {noteImageUploading && noteImageUploadProgress ? (
                <JpVocabSaveProgressBar
                  label={noteImageUploadLabel(noteImageUploadProgress)}
                  percent={noteImageUploadPercent(noteImageUploadProgress)}
                  fullWidth
                />
              ) : null}
              <textarea
                id="jp-vocab-add-notes"
                className="jp-vocab-add-textarea"
                rows={6}
                value={classNotesText}
                onPaste={onNotesPaste}
                onChange={(e) => {
                  const next = mergeJpVocabClassNoteDraftFromEdit(
                    e.target.value,
                    classNotesImageSrcs
                  );
                  classNotesValueRef.current = next;
                  setClassNotes(next);
                }}
                placeholder="记录例句、用法、易错点…（可粘贴/上传多张图片）"
                disabled={submitting || noteImageUploading}
              />
              {classNotesImageSrcs.length ? (
                <div className="jp-vocab-add-notes-images" aria-label="备注图片">
                  {classNotesImageSrcs.map((src, index) => (
                    <div key={`${src}-${index}`} className="jp-vocab-add-notes-image-item">
                      <button
                        type="button"
                        className="jp-vocab-add-notes-image-preview"
                        title="点击放大预览"
                        onClick={() => setNoteZoomSrc(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`备注图片 ${index + 1}`} loading="lazy" />
                        <span className="jp-vocab-add-notes-image-hint">点击放大</span>
                      </button>
                      <button
                        type="button"
                        className="jp-vocab-add-notes-image-remove"
                        disabled={submitting || noteImageUploading}
                        onClick={() => {
                          if (!window.confirm(`确定移除第 ${index + 1} 张备注图片吗？`)) return;
                          const next = removeJpVocabClassNoteImageAt(classNotes, index);
                          classNotesValueRef.current = next;
                          setClassNotes(next);
                        }}
                      >
                        移除图片
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="jp-vocab-add-hint">
                图片与「修改备注」相同：居中展示、可点放大；地址已隐藏，避免误改。教案图请用下方「教案图片」。
              </p>
            </div>

            <div className="field">
              <label htmlFor="jp-vocab-add-ref-title">教案标题（可选）</label>
              <input
                id="jp-vocab-add-ref-title"
                type="text"
                value={refTitle}
                onChange={(e) => setRefTitle(e.target.value)}
                placeholder="例如：第 3 课文法"
                disabled={submitting}
              />
            </div>

            <div className="field">
              <span className="jp-vocab-add-field-label">教案图片（可选）</span>
              <div
                ref={dropRef}
                className="jp-vocab-add-drop"
                tabIndex={0}
                onPaste={onPaste}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("is-dragover");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("is-dragover");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("is-dragover");
                  const file = e.dataTransfer.files[0];
                  if (file?.type.startsWith("image/")) void applyImageFile(file);
                }}
              >
                {image ? (
                  <div className="jp-vocab-add-preview">
                    <button
                      type="button"
                      className="jp-vocab-add-preview-thumb"
                      onClick={() => setImageZoomOpen(true)}
                      disabled={submitting}
                      title="点击放大查看"
                      aria-label="放大查看教案图片"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.previewUrl} alt="教案预览" />
                      <span className="jp-vocab-add-preview-zoom-hint">点击放大</span>
                    </button>
                    <div className="jp-vocab-add-preview-actions">
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                        onClick={() => setImageZoomOpen(true)}
                        disabled={submitting}
                      >
                        放大查看
                      </button>
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact"
                        onClick={() => {
                          setImageZoomOpen(false);
                          setImage((prev) => {
                            if (prev) URL.revokeObjectURL(prev.previewUrl);
                            return null;
                          });
                          setDedupeHint("");
                        }}
                        disabled={submitting}
                      >
                        移除图片
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="jp-vocab-add-drop-hint">
                      点击上传、拖拽图片到此处，或在弹窗内按 Ctrl+V / ⌘V 粘贴截图
                    </p>
                    <button
                      type="button"
                      className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                    >
                      选择图片
                    </button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onFileChange}
                />
              </div>
              {dedupeHint ? (
                <p className="jp-vocab-add-hint">{dedupeHint}</p>
              ) : null}
            </div>

            {error ? (
              <p className="jp-vocab-add-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="jp-vocab-add-footer">
            <button
              type="button"
              className="btn-rsi-filter"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-rsi-filter btn-rsi-filter--primary"
              onClick={() => void submit()}
              disabled={submitting || noteImageUploading}
            >
              {submitting
                ? "添加中…"
                : noteImageUploading
                  ? "备注图片上传中…"
                  : "添加"}
            </button>
          </div>
        </div>
      </div>

      {image && imageZoomOpen ? (
        <div
          className="jp-vocab-add-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="教案图片大图预览"
          onClick={() => setImageZoomOpen(false)}
        >
          <div className="jp-vocab-add-zoom-bar">
            <span>确认图片是否正确 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-vocab-add-close"
              onClick={() => setImageZoomOpen(false)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-add-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt="教案大图预览"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      {noteZoomSrc ? (
        <div
          className="jp-vocab-add-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="备注图片大图预览"
          onClick={() => setNoteZoomSrc(null)}
        >
          <div className="jp-vocab-add-zoom-bar">
            <span>备注图片 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-vocab-add-close"
              onClick={() => setNoteZoomSrc(null)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-add-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={noteZoomSrc}
              alt="备注图片大图"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
      <JpVocabManualAddModalStyles />

    </>,
    document.body
  );
}
