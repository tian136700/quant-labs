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
import { findDuplicateJpVocabExamplePrimaries, JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL } from "@/lib/jp-vocab-example-sentences";
import {
  appendJpVocabClassNoteImageLine,
  collectJpVocabClassNoteImageRefKeys,
  hasJpVocabClassNotes,
  jpVocabClassNoteImageRefKeyFromSrc,
  mergeJpVocabClassNotesBlobFromEdit,
  removeJpVocabClassNotesBlobImageAt,
  splitJpVocabClassNotesBlobForEdit,
} from "@/lib/jp-vocab-class-notes";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { formatUploadBytes, uploadFormWithProgress, type UploadProgressEvent } from "@/lib/upload-form-progress";
import type { JpVocabKind, JpVocabRef, JpVocabWord } from "@/lib/types";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { JpVocabEditModalStyles } from "@/components/jp-vocab-edit-modal/JpVocabEditModalStyles";

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

/** 例句/备注：按内容撑开高度，避免小框内再滚一层 */
function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
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
  const [noteImageUploading, setNoteImageUploading] = useState(false);
  const [noteImageUploadProgress, setNoteImageUploadProgress] =
    useState<UploadProgressEvent | null>(null);
  const [noteZoomSrc, setNoteZoomSrc] = useState<string | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const noteImageUploadingRef = useRef(false);
  const classNotesValueRef = useRef("");
  const exampleSentencesRef = useRef<HTMLTextAreaElement>(null);
  const classNotesRef = useRef<HTMLTextAreaElement>(null);
  const editBodyRef = useRef<HTMLDivElement>(null);
  const [bodyCanScroll, setBodyCanScroll] = useState(false);
  const initializedWordIdRef = useRef<number | null>(null);
  /** lite 列表常省略 class_notes 正文；未拉齐前禁止把 null 写回，避免误清空 */
  const classNotesReadyRef = useRef(true);
  const [classNotesLoading, setClassNotesLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    classNotesValueRef.current = classNotes;
  }, [classNotes]);

  useEffect(() => {
    if (!open) {
      initializedWordIdRef.current = null;
      classNotesReadyRef.current = true;
      setClassNotesLoading(false);
      noteImageUploadingRef.current = false;
      setNoteImageUploading(false);
      setNoteImageUploadProgress(null);
      setNoteZoomSrc(null);
      return;
    }
    if (!word || initializedWordIdRef.current === word.id) return;

    initializedWordIdRef.current = word.id;
    setKind(word.kind);
    setWordText(word.word);
    setReading(word.reading || "");
    setMeaning(word.meaning || "");
    setPos(word.pos || "");
    const notesPresent = hasJpVocabClassNotes(word.class_notes, word.class_notes_present);
    const notesBody = word.class_notes || "";
    setClassNotes(notesBody);
    classNotesValueRef.current = notesBody;
    classNotesReadyRef.current = !notesPresent || Boolean(notesBody.trim());
    setClassNotesLoading(notesPresent && !notesBody.trim());
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
    setNoteZoomSrc(null);
    setUploadProgress(null);
    noteImageUploadingRef.current = false;
    setNoteImageUploading(false);
    setNoteImageUploadProgress(null);
  }, [open, word, refs]);

  useEffect(() => {
    if (!open || !word) return;
    if (classNotesReadyRef.current) return;
    if ((word.class_notes || "").trim()) {
      setClassNotes(word.class_notes || "");
      classNotesReadyRef.current = true;
      setClassNotesLoading(false);
      return;
    }
    if (!hasJpVocabClassNotes(word.class_notes, word.class_notes_present)) {
      classNotesReadyRef.current = true;
      setClassNotesLoading(false);
      return;
    }

    let cancelled = false;
    setClassNotesLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/jp-vocab/class-notes?word_id=${encodeURIComponent(String(word.id))}`,
          {
            headers: { [LOCALE_HEADER]: locale },
            credentials: "include",
            cache: "no-store",
          }
        );
        const data = (await res.json()) as { ok: boolean; word?: JpVocabWord };
        if (cancelled || !data.ok || !data.word) return;
        if (initializedWordIdRef.current !== word.id) return;
        setClassNotes(data.word.class_notes || "");
        classNotesReadyRef.current = true;
      } catch {
        if (!cancelled && initializedWordIdRef.current === word.id) {
          setError(
            locale === "zh"
              ? "备注加载失败。请关闭后重试；此时保存不会改动备注。"
              : "Failed to load remarks. Close and retry; saving now will not change remarks."
          );
        }
      } finally {
        if (!cancelled && initializedWordIdRef.current === word.id) {
          setClassNotesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, word, locale]);

  useEffect(() => {
    if (!open || !word?.ref_key) return;
    setCurrentRefMeta(refs[word.ref_key] ?? null);
  }, [open, word?.ref_key, refs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (noteZoomSrc) {
        setNoteZoomSrc(null);
        return;
      }
      if (zoomTarget) {
        setZoomTarget(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, zoomTarget, noteZoomSrc]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    return () => {
      if (newRefPreviewUrl) URL.revokeObjectURL(newRefPreviewUrl);
    };
  }, [newRefPreviewUrl]);

  useEffect(() => {
    if (!open) return;
    autoGrowTextarea(exampleSentencesRef.current);
    autoGrowTextarea(classNotesRef.current);
    const body = editBodyRef.current;
    const raf = requestAnimationFrame(() => {
      if (!body) return;
      setBodyCanScroll(body.scrollHeight > body.clientHeight + 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, exampleSentences, classNotes, word?.id]);

  useEffect(() => {
    if (!open) {
      setBodyCanScroll(false);
      return;
    }
    const body = editBodyRef.current;
    if (!body) return;

    const update = () => {
      setBodyCanScroll(body.scrollHeight > body.clientHeight + 2);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(body);
    if (exampleSentencesRef.current) ro.observe(exampleSentencesRef.current);
    if (classNotesRef.current) ro.observe(classNotesRef.current);
    body.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      body.removeEventListener("scroll", update);
    };
  }, [open, exampleSentences, classNotes, word?.id, kind, meaning, pos, mnemonic]);

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

  /** 单张备注图上传（不占锁）；调用方负责串行与锁 */
  const uploadOneNoteImage = async (file: File): Promise<"ok" | "dup" | "auth" | "fail"> => {
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
      if (result.status === 401) {
        onNeedAuth();
        return "auth";
      }
      if (!result.ok || !data.ok || !data.view_path) {
        throw new Error(data.error || "图片上传失败");
      }
      const viewPath = data.view_path;
      const refKey =
        (typeof data.ref_key === "string" && data.ref_key.trim()) ||
        jpVocabClassNoteImageRefKeyFromSrc(viewPath);
      const existingKeys = collectJpVocabClassNoteImageRefKeys(classNotesValueRef.current);
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
    if (!canEdit || classNotesLoading) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      setError("仅支持图片文件。");
      return;
    }
    // 同步锁：避免连贴/连点时 React state 尚未更新导致并发上传打爆 Worker（1102）
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
        if (outcome === "auth" || outcome === "fail") break;
      }
    } finally {
      noteImageUploadingRef.current = false;
      setNoteImageUploading(false);
      setNoteImageUploadProgress(null);
    }
  };

  const onNotesPaste = (e: React.ClipboardEvent) => {
    if (!canEdit || classNotesLoading) return;
    const picked = pickClipboardImage(e.clipboardData.items);
    if (!picked) return;
    e.preventDefault();
    void uploadNoteImages([picked]);
  };

  const onNotesDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("is-dragover");
    if (!canEdit || classNotesLoading || noteImageUploadingRef.current) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    void uploadNoteImages(files);
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

    const duplicateExamples = findDuplicateJpVocabExamplePrimaries(exampleSentences);
    if (duplicateExamples.length > 0) {
      const listed = duplicateExamples.map((s) => `「${s}」`).join("\n");
      const message =
        locale === "zh"
          ? `检测到重复的日语例句，请查证后再保存：\n\n${listed}\n\n仍要强制保存吗？`
          : `Duplicate example sentences found. Please review before saving:\n\n${listed}\n\nSave anyway?`;
      if (!window.confirm(message)) {
        setError(
          locale === "zh"
            ? `例句重复，请查证后再保存：${duplicateExamples.join("；")}`
            : `Duplicate examples: ${duplicateExamples.join("; ")}`
        );
        return;
      }
    }

    setError("");
    setRefError("");

    if (classNotesLoading) {
      setError(
        locale === "zh"
          ? "备注仍在加载，请稍后再保存，以免清空已有备注。"
          : "Remarks are still loading. Please wait before saving."
      );
      return;
    }

    if (noteImageUploading || noteImageUploadingRef.current) {
      setError(
        locale === "zh"
          ? "备注图片仍在上传，请稍后再保存。"
          : "Remark images are still uploading. Please wait before saving."
      );
      return;
    }

    if (newRefFile) {
      const savedRef = await saveRef();
      if (!savedRef) {
        return;
      }
    }

    const snapshot = word;
    const notesReady = classNotesReadyRef.current;
    const nextClassNotes = classNotes.trim() || null;
    const nextExamples = exampleSentences.trim() || null;
    const prevExamples = (snapshot.example_sentences || "").trim() || null;
    const nextExampleSource =
      nextExamples !== prevExamples
        ? nextExamples
          ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
          : null
        : snapshot.example_sentences_source ?? null;
    const nextMeaning = meaning.trim() || null;
    const prevMeaning = (snapshot.meaning || "").trim() || null;
    const nextMeaningSource =
      nextMeaning !== prevMeaning
        ? nextMeaning
          ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
          : null
        : snapshot.meaning_source ?? null;
    const optimistic = buildOptimisticJpVocabWord(snapshot, {
      kind,
      word: trimmedWord,
      reading: kind === "word" ? reading.trim() || null : null,
      meaning: nextMeaning,
      meaning_source: nextMeaningSource,
      pos: pos.trim() || null,
      ...(notesReady ? { class_notes: nextClassNotes } : {}),
      example_sentences: nextExamples,
      example_sentences_source: nextExampleSource,
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
            meaning: nextMeaning,
            pos: pos.trim() || null,
            ...(notesReady ? { class_notes: nextClassNotes } : {}),
            example_sentences: nextExamples,
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

  const {
    text: classNotesText,
    images: classNotesImages,
    imageSrcs: classNotesImageSrcs,
  } = splitJpVocabClassNotesBlobForEdit(classNotes);

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

          <div
            ref={editBodyRef}
            className={`jp-vocab-edit-body${bodyCanScroll ? " is-scrollable" : ""}`}
          >
            {bodyCanScroll ? (
              <p className="jp-vocab-edit-scroll-hint" aria-live="polite">
                内容较长，右侧可滚动 · 也可用鼠标滚轮上下浏览
              </p>
            ) : null}
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
                placeholder="例如：休息；假期（多义用中文分号；分隔，最多 3 个）"
                onChange={(e) => setMeaning(e.target.value)}
              />
              <p className="jp-vocab-edit-hint">
                {word?.meaning_source?.trim()
                  ? `当前释义来源：${word.meaning_source.trim()}（在此修改并保存后记为「手动」）。`
                  : "人手填写并保存后，释义来源记为「手动」。多义用「；」分隔，最多 3 个常用义。"}
              </p>
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
                ref={exampleSentencesRef}
                id="jp-vocab-edit-example-sentences"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
                rows={4}
                value={exampleSentences}
                disabled={!canEdit}
                placeholder="例：&#10;日本語を習います。&#10;译文：我学习日语。&#10;ピアノを習いたいです。&#10;译文：我想学钢琴。"
                onChange={(e) => {
                  setExampleSentences(e.target.value);
                  autoGrowTextarea(e.currentTarget);
                }}
              />
              <p className="jp-vocab-edit-hint">
                格式：日语句下一行写「译文：…」。列表展示时日语自动带 1、2、3…，译义行不占序号。两条例句完全相同会在保存前提醒。课堂带读会展示；日语抽问表格不显示此列。
                {word?.example_sentences_source?.trim()
                  ? ` 当前例句来源：${word.example_sentences_source.trim()}（你在此修改并保存后会记为「手动」）。`
                  : " 人手填写并保存后，例句来源记为「手动」。"}
              </p>
            </div>

            <div
              className="field jp-vocab-edit-notes-field"
              onPaste={onNotesPaste}
              onDragOver={(e) => {
                if (!canEdit || classNotesLoading || noteImageUploading) return;
                if (![...e.dataTransfer.types].includes("Files")) return;
                e.preventDefault();
                e.currentTarget.classList.add("is-dragover");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("is-dragover");
              }}
              onDrop={onNotesDrop}
            >
              <label htmlFor="jp-vocab-edit-notes" className="jp-vocab-edit-label">
                备注
              </label>
              {canEdit ? (
                <div className="jp-vocab-edit-notes-toolbar">
                  <button
                    type="button"
                    className="btn-rsi-filter btn-rsi-filter--compact"
                    disabled={noteImageUploading || classNotesLoading}
                    onClick={() => noteImageInputRef.current?.click()}
                  >
                    {noteImageUploading ? "上传中…" : "上传图片"}
                  </button>
                  <span className="jp-vocab-edit-notes-toolbar-hint">
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
                    disabled={noteImageUploading || classNotesLoading}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      if (files.length) void uploadNoteImages(files);
                    }}
                  />
                </div>
              ) : null}
              {noteImageUploading && noteImageUploadProgress ? (
                <JpVocabSaveProgressBar
                  label={noteImageUploadLabel(noteImageUploadProgress)}
                  percent={noteImageUploadPercent(noteImageUploadProgress)}
                  fullWidth
                />
              ) : null}
              <textarea
                ref={classNotesRef}
                id="jp-vocab-edit-notes"
                className="jp-vocab-edit-textarea jp-vocab-edit-textarea--expand"
                rows={5}
                value={classNotesLoading ? "" : classNotesText}
                disabled={!canEdit || classNotesLoading || noteImageUploading}
                placeholder={
                  classNotesLoading
                    ? "正在加载备注…"
                    : "点击此处修改备注文字（时间戳行可保留；可粘贴/上传多张图片，见下方缩略图）"
                }
                onPaste={onNotesPaste}
                onChange={(e) => {
                  setClassNotes(
                    mergeJpVocabClassNotesBlobFromEdit(e.target.value, classNotesImages)
                  );
                  autoGrowTextarea(e.currentTarget);
                }}
              />
              {classNotesImageSrcs.length ? (
                <div className="jp-vocab-edit-notes-images" aria-label="备注图片">
                  {classNotesImageSrcs.map((src, index) => (
                    <div key={`${src}-${index}`} className="jp-vocab-edit-notes-image-item">
                      <button
                        type="button"
                        className="jp-vocab-edit-notes-image-preview"
                        title="点击放大预览"
                        onClick={() => setNoteZoomSrc(src)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`备注图片 ${index + 1}`} loading="lazy" />
                        <span className="jp-vocab-edit-notes-image-hint">点击放大</span>
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          className="jp-vocab-edit-notes-image-remove"
                          disabled={noteImageUploading}
                          onClick={() => {
                            if (!window.confirm(`确定移除第 ${index + 1} 张备注图片吗？`)) return;
                            const next = removeJpVocabClassNotesBlobImageAt(classNotes, index);
                            classNotesValueRef.current = next;
                            setClassNotes(next);
                          }}
                        >
                          移除图片
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="jp-vocab-edit-hint">
                {canEdit
                  ? "上方文本框可直接改字；图片与「修改备注」弹窗相同：居中展示、可点放大。备注保存后会同步到日语新课。图片地址已隐藏，避免误改；可用「移除图片」删除。"
                  : "备注保存后会同步到日语新课。图片居中展示；地址已隐藏，避免误改。"}
              </p>
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
                disabled={uploadingRef || classNotesLoading || noteImageUploading}
                onClick={() => void save()}
              >
                {uploadingRef
                  ? "上传中…"
                  : noteImageUploading
                    ? "备注图片上传中…"
                    : classNotesLoading
                      ? "备注加载中…"
                      : "保存"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <JpVocabEditModalStyles />

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

      {noteZoomSrc ? (
        <div
          className="jp-vocab-edit-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="备注图片大图预览"
          onClick={() => setNoteZoomSrc(null)}
        >
          <div className="jp-vocab-edit-zoom-bar">
            <span>备注图片 · 点击空白处或按 Esc 关闭</span>
            <button
              type="button"
              className="jp-vocab-edit-close"
              onClick={() => setNoteZoomSrc(null)}
              aria-label="关闭大图预览"
            >
              ×
            </button>
          </div>
          <div className="jp-vocab-edit-zoom-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={noteZoomSrc} alt="备注图片大图" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      ) : null}
    </>,
    document.body
  );
}
