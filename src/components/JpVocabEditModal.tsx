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
import { JpVocabEditBasicFields } from "@/components/jp-vocab-edit-modal/JpVocabEditBasicFields";
import { JpVocabEditExamplesField } from "@/components/jp-vocab-edit-modal/JpVocabEditExamplesField";
import { JpVocabEditUsageField } from "@/components/jp-vocab-edit-modal/JpVocabEditUsageField";
import { JpVocabEditConnectionField } from "@/components/jp-vocab-edit-modal/JpVocabEditConnectionField";
import { JpVocabEditRelatedCompoundsField } from "@/components/jp-vocab-edit-modal/JpVocabEditRelatedCompoundsField";
import { JpVocabEditGrammarPairPreview } from "@/components/jp-vocab-edit-modal/JpVocabEditGrammarPairPreview";
import { JpVocabEditNotesField } from "@/components/jp-vocab-edit-modal/JpVocabEditNotesField";
import { JpVocabEditRefField } from "@/components/jp-vocab-edit-modal/JpVocabEditRefField";
import { JpVocabEditZoomOverlays } from "@/components/jp-vocab-edit-modal/JpVocabEditZoomOverlays";
import {
  autoGrowTextarea,
  pickClipboardImage,
  REF_ERR,
} from "@/components/jp-vocab-edit-modal/helpers";

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
  const [usage, setUsage] = useState("");
  const [connection, setConnection] = useState("");
  const [relatedCompounds, setRelatedCompounds] = useState("");
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
  const usageRef = useRef<HTMLTextAreaElement>(null);
  const connectionRef = useRef<HTMLTextAreaElement>(null);
  const relatedCompoundsRef = useRef<HTMLTextAreaElement>(null);
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
    setUsage(word.usage || "");
    setConnection(word.connection || "");
    setRelatedCompounds(word.related_compounds || "");
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
    autoGrowTextarea(usageRef.current);
    autoGrowTextarea(connectionRef.current);
    autoGrowTextarea(relatedCompoundsRef.current);
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
    if (usageRef.current) ro.observe(usageRef.current);
    if (connectionRef.current) ro.observe(connectionRef.current);
    if (relatedCompoundsRef.current) ro.observe(relatedCompoundsRef.current);
    if (classNotesRef.current) ro.observe(classNotesRef.current);
    body.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      body.removeEventListener("scroll", update);
    };
  }, [open, exampleSentences, usage, connection, relatedCompounds, classNotes, word?.id, kind, meaning, pos, mnemonic]);

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
    const nextUsage =
      kind === "grammar" ? usage.trim() || null : null;
    const prevUsage = (snapshot.usage || "").trim() || null;
    const nextUsageSource =
      kind === "grammar"
        ? nextUsage !== prevUsage
          ? nextUsage
            ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
            : null
          : snapshot.usage_source ?? null
        : null;
    const nextConnection = connection.trim() || null;
    const prevConnection = (snapshot.connection || "").trim() || null;
    const nextConnectionSource =
      nextConnection !== prevConnection
        ? nextConnection
          ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
          : null
        : snapshot.connection_source ?? null;
    const nextRelatedCompounds =
      kind === "word" ? relatedCompounds.trim() || null : null;
    const prevRelatedCompounds =
      (snapshot.related_compounds || "").trim() || null;
    const nextRelatedCompoundsSource =
      kind === "word"
        ? nextRelatedCompounds !== prevRelatedCompounds
          ? nextRelatedCompounds
            ? JP_VOCAB_EXAMPLE_SENTENCES_SOURCE_MANUAL
            : null
          : snapshot.related_compounds_source ?? null
        : null;
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
      usage: nextUsage,
      usage_source: nextUsageSource,
      connection: nextConnection,
      connection_source: nextConnectionSource,
      related_compounds: nextRelatedCompounds,
      related_compounds_source: nextRelatedCompoundsSource,
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
            usage: nextUsage,
            connection: nextConnection,
            related_compounds: nextRelatedCompounds,
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
            <JpVocabEditBasicFields
              canEdit={canEdit}
              showMnemonic={showMnemonic}
              kind={kind}
              wordText={wordText}
              reading={reading}
              meaning={meaning}
              pos={pos}
              mnemonic={mnemonic}
              word={word}
              onKindChange={setKind}
              onWordTextChange={setWordText}
              onReadingChange={setReading}
              onMeaningChange={setMeaning}
              onPosChange={setPos}
              onMnemonicChange={setMnemonic}
            />

            {kind === "grammar" ? (
              <JpVocabEditUsageField
                canEdit={canEdit}
                usage={usage}
                word={word}
                usageRef={usageRef}
                onUsageChange={setUsage}
              />
            ) : null}

            <JpVocabEditExamplesField
              canEdit={canEdit}
              exampleSentences={exampleSentences}
              word={word}
              exampleSentencesRef={exampleSentencesRef}
              onExampleSentencesChange={setExampleSentences}
            />

            {kind === "word" ? (
              <JpVocabEditRelatedCompoundsField
                canEdit={canEdit}
                relatedCompounds={relatedCompounds}
                word={word}
                relatedCompoundsRef={relatedCompoundsRef}
                onRelatedCompoundsChange={setRelatedCompounds}
              />
            ) : null}

            <JpVocabEditConnectionField
              canEdit={canEdit}
              connection={connection}
              word={word}
              connectionRef={connectionRef}
              onConnectionChange={setConnection}
            />

            {kind === "grammar" ? (
              <JpVocabEditGrammarPairPreview
                usage={usage}
                exampleSentences={exampleSentences}
                wordLabel={wordText || word?.word}
              />
            ) : null}

            <JpVocabEditNotesField
              canEdit={canEdit}
              classNotesLoading={classNotesLoading}
              noteImageUploading={noteImageUploading}
              noteImageUploadProgress={noteImageUploadProgress}
              classNotesText={classNotesText}
              classNotesImageSrcs={classNotesImageSrcs}
              classNotes={classNotes}
              classNotesImages={classNotesImages}
              classNotesRef={classNotesRef}
              noteImageInputRef={noteImageInputRef}
              onNotesPaste={onNotesPaste}
              onNotesDrop={onNotesDrop}
              onClassNotesChange={setClassNotes}
              onNoteZoom={setNoteZoomSrc}
              onRemoveNoteImage={(index) => {
                const next = removeJpVocabClassNotesBlobImageAt(classNotes, index);
                classNotesValueRef.current = next;
                setClassNotes(next);
              }}
              onUploadNoteImages={(files) => void uploadNoteImages(files)}
            />

            <JpVocabEditRefField
              canEdit={canEdit}
              currentRefKey={currentRefKey}
              currentRefMeta={currentRefMeta}
              currentRefMediaUrl={currentRefMediaUrl}
              currentRefViewerUrl={currentRefViewerUrl}
              currentRefIsPdf={currentRefIsPdf}
              newRefFile={newRefFile}
              newRefPreviewUrl={newRefPreviewUrl}
              uploadingRef={uploadingRef}
              uploadProgress={uploadProgress}
              refError={refError}
              refFileInputRef={refFileInputRef}
              onRefPaste={onRefPaste}
              onOpenCurrentRefPreview={openCurrentRefPreview}
              onOpenNewRefPreview={openNewRefPreview}
              onSetZoomTarget={setZoomTarget}
              onApplyRefFile={applyRefFile}
              onClearRefFile={clearRefFile}
            />

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

      <JpVocabEditZoomOverlays
        zoomTarget={zoomTarget}
        currentRefMediaUrl={currentRefMediaUrl}
        currentRefIsPdf={currentRefIsPdf}
        newRefPreviewUrl={newRefPreviewUrl}
        newRefFile={newRefFile}
        noteZoomSrc={noteZoomSrc}
        onCloseZoomTarget={() => setZoomTarget(null)}
        onCloseNoteZoom={() => setNoteZoomSrc(null)}
      />
    </>,
    document.body
  );
}
