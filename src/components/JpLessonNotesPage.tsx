"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_LESSON_CACHE_KEY,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  fetchWithClientCache,
  patchClientCache,
  readClientCache,
} from "@/lib/client-swr-cache";
import { JpVocabClassNoteContent } from "@/components/JpVocabClassNoteContent";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import {
  appendJpVocabClassNoteImageLine,
  collectJpVocabClassNoteImageRefKeysFromContent,
  jpVocabClassNoteImageRefKeyFromSrc,
  mergeJpVocabClassNoteDraftFromEdit,
  removeJpVocabClassNoteImageAt,
  splitJpVocabClassNoteDraftForEdit,
} from "@/lib/jp-vocab-class-notes";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import {
  formatUploadBytes,
  uploadFormWithProgress,
  type UploadProgressEvent,
} from "@/lib/upload-form-progress";
import type { JpLessonKind, JpLessonNote, JpLessonRecord } from "@/lib/types";

type SavingTarget = string | "__all__" | null;

function readLessonCache(): JpLessonApiPayload | null {
  return readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

function pickLessonFromCache(lessonId: number): {
  lesson: JpLessonRecord;
  notes: JpLessonNote[];
} | null {
  const cached = readLessonCache();
  if (!cached) return null;
  const lesson = cached.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;
  return { lesson, notes: cached.notes };
}

function persistLessonNotesCache(nextNotes: JpLessonNote[]) {
  patchClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY, (prev) =>
    prev ? { ...prev, notes: nextNotes } : prev
  );
}

type NoteField = {
  key: string;
  noteId?: number;
  body: string;
};

type ItemFields = Record<string, NoteField[]>;

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function kindLabel(kind: JpLessonKind): string {
  return kind === "grammar" ? "语法" : "单词";
}

function buildItemFields(
  items: string[],
  lessonNotes: JpLessonNote[]
): ItemFields {
  const map: ItemFields = {};
  for (const item of items) {
    const saved = lessonNotes
      .filter((n) => n.item_word === item)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    map[item] =
      saved.length > 0
        ? saved.map((n) => ({
            key: `note-${n.id}`,
            noteId: n.id,
            body: n.body,
          }))
        : [{ key: `empty-${item}`, body: "" }];
  }
  return map;
}

let fieldKeyCounter = 0;
function newFieldKey(item: string): string {
  fieldKeyCounter += 1;
  return `new-${item}-${fieldKeyCounter}`;
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "pending":
      return "待保存…";
    case "saving":
      return "保存中…";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "";
  }
}

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
  if (event.phase === "processing") {
    return "图片已传完，服务器保存中…";
  }
  if (event.phase === "done") {
    return "图片上传完成";
  }
  if (event.total > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)} / ${formatUploadBytes(event.total)}`;
  }
  if (event.loaded > 0) {
    return `正在上传图片 ${formatUploadBytes(event.loaded)}…`;
  }
  return "正在上传图片…";
}

function noteImageUploadPercent(event: UploadProgressEvent): number {
  if (event.phase === "processing") return 95;
  if (event.phase === "done") return 100;
  return Math.max(0, Math.min(92, event.percent));
}

function collectItemNoteImageRefKeys(fields: NoteField[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    for (const key of collectJpVocabClassNoteImageRefKeysFromContent(field.body)) {
      keys.add(key);
    }
  }
  return keys;
}

function ItemSectionSaveFooter({
  canEdit,
  saving,
  status,
  showSyncHint,
  disabled,
  onSave,
}: {
  canEdit: boolean;
  saving: boolean;
  status: SaveStatus;
  showSyncHint: boolean;
  disabled: boolean;
  onSave: () => void;
}) {
  const saveProgress = useSaveProgressBar(saving);
  const hint = saveStatusLabel(status);
  const progressLabel = showSyncHint
    ? "正在保存并同步到单词复习备注…"
    : jpVocabSaveProgressLabel("save");

  return (
    <div className="jp-lesson-notes-section-footer">
      <div className="jp-lesson-notes-section-footer-status">
        {saveProgress.visible ? (
          <JpVocabSaveProgressBar
            label={progressLabel}
            percent={saveProgress.percent}
            fullWidth
          />
        ) : hint ? (
          <span
            className={`jp-lesson-notes-status${
              status === "saved"
                ? " jp-lesson-notes-status--saved"
                : status === "error"
                  ? " jp-lesson-notes-status--error"
                  : ""
            }`}
          >
            {hint}
            {status === "saved" && showSyncHint ? "，已同步到单词复习备注" : ""}
          </span>
        ) : showSyncHint ? (
          <span className="jp-lesson-notes-sync-hint">保存后同步到日语抽问备注</span>
        ) : null}
      </div>
      {canEdit ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
          disabled={disabled}
          onClick={onSave}
        >
          保存
        </button>
      ) : null}
    </div>
  );
}

export function JpLessonNotesPage() {
  const searchParams = useSearchParams();
  const lessonId = Number(searchParams.get("id"));
  const { locale } = useI18n();
  const { user, checking, hasPermission, isAdmin, openAuthPanel } = useEtrAuth();
  const canViewJpLesson =
    !user ||
    isAdmin ||
    hasPermission("jp_lesson:read") ||
    hasPermission("jp_lesson:operate");
  const canEdit = isAdmin || hasPermission("jp_lesson:operate");

  const openJpAuth = useCallback(() => {
    openAuthPanel({
      mode: "login",
      loginOnly: true,
      title: "登录 · 课堂笔记",
      subtitle: "登录用户方可修改数据。",
    });
  }, [openAuthPanel]);
  const initialCached =
    Number.isInteger(lessonId) && lessonId > 0 ? pickLessonFromCache(lessonId) : null;
  const [lesson, setLesson] = useState<JpLessonRecord | null>(() => initialCached?.lesson ?? null);
  const [notes, setNotes] = useState<JpLessonNote[]>(() => initialCached?.notes ?? []);
  const [itemFields, setItemFields] = useState<ItemFields>({});
  const [loading, setLoading] = useState(() => initialCached == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [itemSaveStatus, setItemSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(() => new Set());
  const [savingTarget, setSavingTarget] = useState<SavingTarget>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] =
    useState<UploadProgressEvent | null>(null);
  const [imageUploadFieldKey, setImageUploadFieldKey] = useState<string | null>(
    null
  );
  const initialFieldsRef = useRef<ItemFields>({});
  const savingRef = useRef(false);
  const pendingAfterSaveRef = useRef(false);
  const imageUploadingRef = useRef(false);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemFieldsRef = useRef<ItemFields>({});
  const saveNotesRef = useRef<() => Promise<void>>(async () => {});

  itemFieldsRef.current = itemFields;

  const items = useMemo(
    () => (lesson ? parseLessonContent(lesson.content) : []),
    [lesson]
  );

  const lessonNotes = useMemo(
    () =>
      lesson
        ? notes
            .filter((n) => n.lesson_id === lesson.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [],
    [lesson, notes]
  );

  const initFields = useCallback(() => {
    const next = buildItemFields(items, lessonNotes);
    initialFieldsRef.current = next;
    setItemFields(next);
    setDirtyItems(new Set());
    setItemSaveStatus({});
    setError("");
    setSaveStatus("idle");
  }, [items, lessonNotes]);

  const loadData = useCallback(async () => {
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      setError("无效的课程 ID");
      setLoading(false);
      return;
    }

    const cachedEntry = pickLessonFromCache(lessonId);
    if (cachedEntry) {
      setLesson(cachedEntry.lesson);
      setNotes(cachedEntry.notes);
      setRefreshing(true);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const payload = await fetchWithClientCache(
        JP_LESSON_CACHE_KEY,
        "/api/jp-lesson",
        parseJpLessonApi,
        {
          onCached: (data) => {
            const found = data.lessons.find((l) => l.id === lessonId);
            if (found) {
              setLesson(found);
              setNotes(data.notes);
            }
          },
        }
      );
      const found = payload.lessons.find((l) => l.id === lessonId);
      if (!found) {
        throw new Error("未找到该课程");
      }
      setLesson(found);
      setNotes(payload.notes);
    } catch (err) {
      if (!cachedEntry) {
        setError(err instanceof Error ? err.message : String(err));
        setLesson(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lessonId]);

  useEffect(() => {
    if (checking) return;
    if (user && !canViewJpLesson) return;
    void loadData();
  }, [loadData, checking, user, canViewJpLesson]);

  useEffect(() => {
    if (!lesson || loading) return;
    initFields();
  }, [lesson?.id, loading, initFields]);

  const saveNotes = useCallback(
    async (onlyItem?: string) => {
      if (!lesson) return;
      if (!canEdit) {
        if (!user) openJpAuth();
        return;
      }

      const target: SavingTarget = onlyItem ?? "__all__";

      if (savingRef.current) {
        pendingAfterSaveRef.current = true;
        return;
      }

      savingRef.current = true;
      setSubmitting(true);
      setSavingTarget(target);
      setSaveStatus("saving");
      if (onlyItem) {
        setItemSaveStatus((prev) => ({ ...prev, [onlyItem]: "saving" }));
      } else {
        setItemSaveStatus((prev) => {
          const next = { ...prev };
          for (const item of items) next[item] = "saving";
          return next;
        });
      }
      setError("");

      const itemsToSave = onlyItem ? [onlyItem] : items;

      try {
        const otherLessonNotes = notes.filter(
          (n) => n.lesson_id === lesson.id && !itemsToSave.includes(n.item_word)
        );
        const lessonResult: JpLessonNote[] = [...otherLessonNotes];

        for (const item of itemsToSave) {
          const fields = itemFields[item] ?? [];
          const initial = initialFieldsRef.current[item] ?? [];
          const initialById = new Map(
            initial.filter((f) => f.noteId).map((f) => [f.noteId!, f])
          );
          const currentIds = new Set(
            fields.filter((f) => f.noteId).map((f) => f.noteId!)
          );

          for (const init of initial) {
            if (init.noteId && !currentIds.has(init.noteId)) {
              const res = await fetch("/api/jp-lesson/notes", {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  [LOCALE_HEADER]: locale,
                },
                credentials: "include",
                body: JSON.stringify({ note_id: init.noteId }),
              });
              const data = (await res.json()) as { ok: boolean; error?: string };
              if (!data.ok) throw new Error(data.error || "删除失败");
            }
          }

          for (const field of fields) {
            const trimmed = field.body.trim();
            if (field.noteId) {
              if (!trimmed) {
                const res = await fetch("/api/jp-lesson/notes", {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                    [LOCALE_HEADER]: locale,
                  },
                  credentials: "include",
                  body: JSON.stringify({ note_id: field.noteId }),
                });
                const data = (await res.json()) as { ok: boolean; error?: string };
                if (!data.ok) throw new Error(data.error || "删除失败");
                continue;
              }

              const original = initialById.get(field.noteId);
              if (original && original.body === trimmed) {
                const saved = lessonNotes.find((n) => n.id === field.noteId);
                if (saved) lessonResult.push(saved);
                continue;
              }

              const res = await fetch("/api/jp-lesson/notes", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  [LOCALE_HEADER]: locale,
                },
                credentials: "include",
                body: JSON.stringify({ note_id: field.noteId, body: trimmed }),
              });
              const data = (await res.json()) as {
                ok: boolean;
                note?: JpLessonNote;
                error?: string;
              };
              if (!data.ok || !data.note) {
                throw new Error(data.error || "保存失败");
              }
              lessonResult.push(data.note);
              continue;
            }

            if (!trimmed) continue;

            const res = await fetch("/api/jp-lesson/notes", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                [LOCALE_HEADER]: locale,
              },
              credentials: "include",
              body: JSON.stringify({
                lesson_id: lesson.id,
                item_word: item,
                body: trimmed,
              }),
            });
            const data = (await res.json()) as {
              ok: boolean;
              note?: JpLessonNote;
              error?: string;
            };
            if (!data.ok || !data.note) {
              throw new Error(data.error || "保存失败");
            }
            lessonResult.push(data.note);
          }
        }

        const nextNotes = [
          ...lessonResult,
          ...notes.filter((n) => n.lesson_id !== lesson.id),
        ];
        setNotes(nextNotes);
        persistLessonNotesCache(nextNotes);

        if (lesson.completed) {
          const syncRes = await fetch("/api/jp-lesson/notes/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [LOCALE_HEADER]: locale,
            },
            credentials: "include",
            body: JSON.stringify({ lesson_id: lesson.id }),
          });
          const syncData = (await syncRes.json()) as { ok: boolean; error?: string };
          if (!syncData.ok) {
            throw new Error(syncData.error || "同步到单词复习失败");
          }
        }

        if (onlyItem) {
          const itemNotes = lessonResult.filter((n) => n.item_word === onlyItem);
          const itemFieldUpdate = buildItemFields([onlyItem], itemNotes);
          initialFieldsRef.current = {
            ...initialFieldsRef.current,
            ...itemFieldUpdate,
          };
          setItemFields((prev) => ({ ...prev, ...itemFieldUpdate }));
          setItemSaveStatus((prev) => ({ ...prev, [onlyItem]: "saved" }));
          setDirtyItems((prev) => {
            const next = new Set(prev);
            next.delete(onlyItem);
            setSaveStatus(next.size > 0 ? "pending" : "idle");
            return next;
          });
          window.setTimeout(() => {
            setItemSaveStatus((prev) =>
              prev[onlyItem] === "saved" ? { ...prev, [onlyItem]: "idle" } : prev
            );
          }, 2000);
        } else {
          const nextFields = buildItemFields(items, lessonResult);
          initialFieldsRef.current = nextFields;
          setItemFields(nextFields);
          setDirtyItems(new Set());
          setItemSaveStatus({});
          setSaveStatus("saved");
          window.setTimeout(() => {
            setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
          }, 2000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存失败";
        setSaveStatus("error");
        if (onlyItem) {
          setItemSaveStatus((prev) => ({ ...prev, [onlyItem]: "error" }));
        } else {
          setItemSaveStatus((prev) => {
            const next = { ...prev };
            for (const item of itemsToSave) next[item] = "error";
            return next;
          });
        }
        setError(message);
      } finally {
        savingRef.current = false;
        setSubmitting(false);
        setSavingTarget(null);
        if (pendingAfterSaveRef.current) {
          pendingAfterSaveRef.current = false;
          void saveNotesRef.current();
        }
      }
    },
    [canEdit, itemFields, items, lesson, lessonNotes, locale, notes, user, openJpAuth]
  );

  saveNotesRef.current = saveNotes;

  const markItemDirty = useCallback(
    (item: string) => {
      if (!canEdit) return;
      setDirtyItems((prev) => new Set(prev).add(item));
      setItemSaveStatus((prev) => ({ ...prev, [item]: "pending" }));
      setSaveStatus("pending");
    },
    [canEdit]
  );

  const updateFieldBody = (item: string, key: string, body: string) => {
    setItemFields((prev) => ({
      ...prev,
      [item]: (prev[item] ?? []).map((f) =>
        f.key === key ? { ...f, body } : f
      ),
    }));
    markItemDirty(item);
  };

  const uploadNoteImage = useCallback(
    async (item: string, fieldKey: string, file: File) => {
      if (!canEdit) {
        if (!user) openJpAuth();
        return;
      }
      if (imageUploadingRef.current) {
        setError("请等待当前图片上传完成后再传下一张");
        return;
      }
      imageUploadingRef.current = true;
      setImageUploading(true);
      setImageUploadFieldKey(fieldKey);
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
          error?: string;
        };
        if (result.status === 401) {
          openJpAuth();
          return;
        }
        if (!result.ok || !data.ok || !data.view_path) {
          throw new Error(data.error || "图片上传失败");
        }
        const viewPath = data.view_path;
        const refKey =
          (typeof data.ref_key === "string" && data.ref_key.trim()) ||
          jpVocabClassNoteImageRefKeyFromSrc(viewPath);
        const itemFieldsNow = itemFieldsRef.current[item] ?? [];
        const existingKeys = collectItemNoteImageRefKeys(itemFieldsNow);
        if (refKey && existingKeys.has(refKey)) {
          setError("请审核你的图片：该知识点备注里已经有一张相同的了，请勿重复粘贴。");
          setImageUploadProgress(null);
          return;
        }
        const field = itemFieldsNow.find((f) => f.key === fieldKey);
        if (!field) return;
        const nextBody = appendJpVocabClassNoteImageLine(field.body, viewPath);
        setItemFields((prev) => ({
          ...prev,
          [item]: (prev[item] ?? []).map((f) =>
            f.key === fieldKey ? { ...f, body: nextBody } : f
          ),
        }));
        setDirtyItems((prev) => new Set(prev).add(item));
        setItemSaveStatus((prev) => ({ ...prev, [item]: "pending" }));
        setSaveStatus("pending");
        setImageUploadProgress({
          phase: "done",
          percent: 100,
          loaded: file.size,
          total: file.size,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setImageUploadProgress(null);
      } finally {
        imageUploadingRef.current = false;
        setImageUploading(false);
        setImageUploadFieldKey(null);
        setImageUploadProgress(null);
      }
    },
    [canEdit, locale, openJpAuth, user]
  );

  const handleImageFile = useCallback(
    (item: string, fieldKey: string, file: File | null | undefined) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("仅支持图片文件。");
        return;
      }
      void uploadNoteImage(item, fieldKey, file);
    },
    [uploadNoteImage]
  );

  const onFieldPaste = (
    item: string,
    fieldKey: string,
    e: ClipboardEvent<HTMLTextAreaElement>
  ) => {
    if (!canEdit) return;
    const file = pickClipboardImage(e.clipboardData.items);
    if (!file) return;
    e.preventDefault();
    if (imageUploadingRef.current) {
      setError("请等待当前图片上传完成后再传下一张");
      return;
    }
    void uploadNoteImage(item, fieldKey, file);
  };

  const addField = (item: string) => {
    if (!canEdit) {
      openJpAuth();
      return;
    }
    setItemFields((prev) => ({
      ...prev,
      [item]: [...(prev[item] ?? []), { key: newFieldKey(item), body: "" }],
    }));
    markItemDirty(item);
  };

  const removeField = (item: string, key: string) => {
    if (!canEdit) {
      openJpAuth();
      return;
    }
    setItemFields((prev) => {
      const fields = prev[item] ?? [];
      if (fields.length <= 1) return prev;
      const next = fields.filter((f) => f.key !== key);
      return {
        ...prev,
        [item]: next.length ? next : [{ key: newFieldKey(item), body: "" }],
      };
    });
    markItemDirty(item);
  };

  const canRemoveField = (item: string, field: NoteField): boolean => {
    const fields = itemFields[item] ?? [];
    if (fields.length > 1) return true;
    return Boolean(field.noteId || field.body.trim());
  };

  const footerSaveProgress = useSaveProgressBar(savingTarget === "__all__");
  const statusHint = saveStatusLabel(saveStatus);
  const footerProgressLabel = lesson?.completed
    ? "正在保存全部并同步到单词复习备注…"
    : jpVocabSaveProgressLabel("save");

  return (
    <main
      className="page-wrap jp-lesson-notes-page"
      style={{ maxWidth: "min(720px, 96vw)", paddingTop: "1.5rem" }}
    >
      <div className="jp-lesson-notes-page-head">
        <div>
          <p className="jp-lesson-notes-back">
            <Link href="/jp-lesson">← 返回日语新课</Link>
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.25rem 0 0" }}>课堂笔记</h1>
          {lesson ? (
            <p className="jp-lesson-notes-subtitle">
              ID {lesson.id} · {kindLabel(lesson.kind)} · 共 {items.length}{" "}
              个知识点
              {lesson.completed ? " · 已完成（保存后同步到日语抽问备注）" : ""}
            </p>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          {user
            ? "当前账号没有新课编辑权限，笔记为只读。"
            : "当前为浏览模式；编辑笔记需登录并具有新课编辑权限。"}
        </p>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          每条知识点下方可单独保存；支持粘贴或上传图片（与日语抽问备注相同）。教案标记为「已完成」后，文字与图片会一并同步到抽问卡片备注。
        </p>
      )}

      {checking ? (
        <p style={{ color: "var(--muted)" }}>验证中…</p>
      ) : user && !canViewJpLesson ? (
        <section className="section etr-panel">
          <p style={{ color: "var(--muted)", margin: 0 }}>
            您没有日语新课的查看权限，无法打开课堂笔记。
          </p>
        </section>
      ) : loading ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : error && !lesson ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : lesson ? (
        <section className="section etr-panel jp-lesson-notes-panel">
          <div className="jp-lesson-notes-body">
            {items.map((item) => {
              const fields = itemFields[item] ?? [{ key: `empty-${item}`, body: "" }];
              return (
                <section key={item} className="jp-lesson-notes-section">
                  <div className="jp-lesson-notes-section-head">
                    <span className="jp-lesson-notes-item-name">{item}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="jp-lesson-notes-section-add"
                        disabled={submitting || imageUploading}
                        onClick={() => addField(item)}
                      >
                        + 添加
                      </button>
                    ) : null}
                  </div>

                  <div className="jp-lesson-notes-fields">
                    {fields.map((field, index) => {
                      const { text: fieldText, imageSrcs } =
                        splitJpVocabClassNoteDraftForEdit(field.body);
                      const fieldUploading =
                        imageUploading && imageUploadFieldKey === field.key;
                      return (
                        <div key={field.key} className="jp-lesson-notes-field">
                          {canEdit ? (
                            <>
                              <div className="jp-lesson-notes-field-toolbar">
                                <button
                                  type="button"
                                  className="btn-rsi-filter btn-rsi-filter--compact"
                                  disabled={submitting || imageUploading}
                                  onClick={() =>
                                    imageInputRefs.current[field.key]?.click()
                                  }
                                >
                                  {fieldUploading ? "上传中…" : "上传图片"}
                                </button>
                                <span className="jp-lesson-notes-field-hint">
                                  {imageUploading
                                    ? "上传完成前不可再贴图或选图"
                                    : "支持 Ctrl+V / ⌘V 粘贴截图；相同图片不会重复加入"}
                                </span>
                                <input
                                  ref={(el) => {
                                    imageInputRefs.current[field.key] = el;
                                  }}
                                  type="file"
                                  accept="image/*"
                                  className="jp-lesson-notes-image-input"
                                  disabled={submitting || imageUploading}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    handleImageFile(item, field.key, file);
                                  }}
                                />
                              </div>
                              {fieldUploading && imageUploadProgress ? (
                                <JpVocabSaveProgressBar
                                  label={noteImageUploadLabel(imageUploadProgress)}
                                  percent={noteImageUploadPercent(imageUploadProgress)}
                                  fullWidth
                                />
                              ) : null}
                              <textarea
                                className="jp-lesson-notes-textarea"
                                rows={3}
                                value={fieldText}
                                disabled={submitting || imageUploading}
                                placeholder={
                                  index === 0
                                    ? "记录例句、用法、易错点；可粘贴或上传图片…"
                                    : "继续补充笔记；可粘贴或上传图片…"
                                }
                                onPaste={(e) => onFieldPaste(item, field.key, e)}
                                onChange={(e) =>
                                  updateFieldBody(
                                    item,
                                    field.key,
                                    mergeJpVocabClassNoteDraftFromEdit(
                                      e.target.value,
                                      imageSrcs
                                    )
                                  )
                                }
                              />
                              {imageSrcs.length > 0 ? (
                                <div className="jp-lesson-notes-draft-images">
                                  {imageSrcs.map((src, imgIndex) => (
                                    <div
                                      key={`${src}-${imgIndex}`}
                                      className="jp-lesson-notes-draft-image-item"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={src}
                                        alt={`笔记图片 ${imgIndex + 1}`}
                                        loading="lazy"
                                      />
                                      <button
                                        type="button"
                                        className="jp-lesson-notes-draft-image-remove"
                                        disabled={submitting || imageUploading}
                                        onClick={() =>
                                          updateFieldBody(
                                            item,
                                            field.key,
                                            removeJpVocabClassNoteImageAt(
                                              field.body,
                                              imgIndex
                                            )
                                          )
                                        }
                                      >
                                        移除图片
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : field.body.trim() ? (
                            <div className="jp-lesson-notes-readonly">
                              <JpVocabClassNoteContent content={field.body} />
                            </div>
                          ) : (
                            <p className="jp-lesson-notes-empty">暂无笔记</p>
                          )}
                          {canEdit && canRemoveField(item, field) ? (
                            <button
                              type="button"
                              className="jp-lesson-notes-field-remove"
                              disabled={submitting || imageUploading}
                              onClick={() => removeField(item, field.key)}
                              aria-label="删除本条笔记"
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <ItemSectionSaveFooter
                    canEdit={canEdit}
                    saving={savingTarget === item}
                    status={itemSaveStatus[item] ?? "idle"}
                    showSyncHint={Boolean(lesson.completed)}
                    disabled={submitting || imageUploading}
                    onSave={() => void saveNotes(item)}
                  />
                </section>
              );
            })}

            {error && lesson ? (
              <p className="jp-lesson-notes-error">{error}</p>
            ) : null}
          </div>

          <div className="jp-lesson-notes-footer">
            <div className="jp-lesson-notes-footer-status">
              {footerSaveProgress.visible ? (
                <JpVocabSaveProgressBar
                  label={footerProgressLabel}
                  percent={footerSaveProgress.percent}
                  fullWidth
                />
              ) : statusHint ? (
                <span
                  className={`jp-lesson-notes-status${
                    saveStatus === "saved"
                      ? " jp-lesson-notes-status--saved"
                      : saveStatus === "error"
                        ? " jp-lesson-notes-status--error"
                        : ""
                  }`}
                >
                  {statusHint}
                  {saveStatus === "saved" && lesson.completed
                    ? "，已同步到日语抽问备注"
                    : ""}
                </span>
              ) : dirtyItems.size > 0 ? (
                <span className="jp-lesson-notes-status">
                  {dirtyItems.size} 条知识点待保存
                </span>
              ) : (
                <span />
              )}
            </div>
            <div className="jp-lesson-notes-footer-actions">
              {canEdit ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact"
                  disabled={submitting || imageUploading || dirtyItems.size === 0}
                  onClick={() => void saveNotes()}
                >
                  保存全部
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .jp-lesson-notes-page-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.35rem;
        }

        .jp-lesson-notes-back {
          margin: 0;
          font-size: 0.8125rem;
        }

        .jp-lesson-notes-back :global(a) {
          color: var(--accent);
          text-decoration: none;
        }

        .jp-lesson-notes-back :global(a:hover) {
          text-decoration: underline;
        }

        .jp-lesson-notes-subtitle {
          margin: 0.35rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-user {
          flex-shrink: 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-panel {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 0;
          overflow: hidden;
        }

        .jp-lesson-notes-body {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem 1.1rem;
        }

        .jp-lesson-notes-section {
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .jp-lesson-notes-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.55rem;
        }

        .jp-lesson-notes-item-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--accent);
        }

        .jp-lesson-notes-section-add {
          flex-shrink: 0;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          border-radius: 6px;
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          color: var(--accent);
          font-size: 0.75rem;
          padding: 0.2rem 0.45rem;
          cursor: pointer;
          font: inherit;
        }

        .jp-lesson-notes-section-add:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
        }

        .jp-lesson-notes-section-add:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-notes-fields {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .jp-lesson-notes-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .jp-lesson-notes-field-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.45rem 0.65rem;
        }

        .jp-lesson-notes-field-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-notes-image-input {
          display: none;
        }

        .jp-lesson-notes-draft-images {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .jp-lesson-notes-draft-image-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0.45rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 55%, var(--panel));
        }

        .jp-lesson-notes-draft-image-item :global(img) {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 240px;
          margin: 0 auto;
          object-fit: contain;
        }

        .jp-lesson-notes-draft-image-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--rise);
          font: inherit;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.1rem 0.25rem;
        }

        .jp-lesson-notes-draft-image-remove:hover:not(:disabled) {
          text-decoration: underline;
        }

        .jp-lesson-notes-draft-image-remove:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-notes-readonly {
          padding: 0.55rem 0.65rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
          background: color-mix(in srgb, var(--bg) 50%, var(--panel));
        }

        .jp-lesson-notes-empty {
          margin: 0;
          font-size: 0.875rem;
          color: var(--muted);
        }

        .jp-lesson-notes-textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.875rem;
          padding: 0.5rem 0.6rem;
          resize: vertical;
          min-height: 4rem;
          line-height: 1.45;
        }

        .jp-lesson-notes-textarea:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .jp-lesson-notes-field-remove {
          align-self: flex-end;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0;
        }

        .jp-lesson-notes-field-remove:hover:not(:disabled) {
          color: var(--rise);
        }

        .jp-lesson-notes-section-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.65rem;
          padding-top: 0.55rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
        }

        .jp-lesson-notes-section-footer-status {
          flex: 1;
          min-width: 0;
        }

        .jp-lesson-notes-sync-hint {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-notes-error {
          margin: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--rise) 35%, var(--border));
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.8125rem;
        }

        .jp-lesson-notes-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
        }

        .jp-lesson-notes-footer-status {
          flex: 1;
          min-width: 0;
        }

        .jp-lesson-notes-status {
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-notes-status--saved {
          color: var(--fall);
        }

        .jp-lesson-notes-status--error {
          color: var(--rise);
        }

        .jp-lesson-notes-footer-actions {
          display: flex;
          gap: 0.5rem;
        }
      `}</style>
    </main>
  );
}
