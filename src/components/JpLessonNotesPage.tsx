"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { parseLessonContent } from "@/lib/jp-lesson-shared";
import type { JpLessonKind, JpLessonNote, JpLessonRecord } from "@/lib/types";

type NoteField = {
  key: string;
  noteId?: number;
  body: string;
};

type ItemFields = Record<string, NoteField[]>;

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const AUTO_SAVE_MS = 800;

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
      return "已自动保存";
    case "error":
      return "保存失败";
    default:
      return "";
  }
}

export function JpLessonNotesPage() {
  const searchParams = useSearchParams();
  const lessonId = Number(searchParams.get("id"));
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, setUser } = useEtrAuth();
  const canEdit = canAccessJpVocab;
  const [showAuth, setShowAuth] = useState(false);
  const [lesson, setLesson] = useState<JpLessonRecord | null>(null);
  const [notes, setNotes] = useState<JpLessonNote[]>([]);
  const [itemFields, setItemFields] = useState<ItemFields>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const initialFieldsRef = useRef<ItemFields>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingAfterSaveRef = useRef(false);
  const saveNotesRef = useRef<(opts?: { auto?: boolean }) => Promise<void>>(
    async () => {}
  );

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
    setError("");
    setSaveStatus("idle");
  }, [items, lessonNotes]);

  const loadData = useCallback(async () => {
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      setError("无效的课程 ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/jp-lesson", { credentials: "include" });
      const data = (await res.json()) as {
        ok: boolean;
        lessons?: JpLessonRecord[];
        notes?: JpLessonNote[];
        error?: string;
      };
      if (!data.ok || !data.lessons) {
        throw new Error(data.error || "加载失败");
      }
      const found = data.lessons.find((l) => l.id === lessonId);
      if (!found) {
        throw new Error("未找到该课程");
      }
      setLesson(found);
      setNotes(data.notes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLesson(null);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!lesson || loading) return;
    initFields();
  }, [lesson?.id, loading, initFields]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const saveNotes = useCallback(
    async (opts?: { auto?: boolean }) => {
      if (!lesson) return;
      if (!canEdit) {
        if (!opts?.auto) {
          setShowAuth(true);
        }
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (savingRef.current) {
        pendingAfterSaveRef.current = true;
        return;
      }

      savingRef.current = true;
      setSubmitting(true);
      setSaveStatus("saving");
      if (!opts?.auto) setError("");

      try {
        let nextNotes = notes.filter((n) => n.lesson_id !== lesson.id);
        const lessonResult: JpLessonNote[] = [];

        for (const item of items) {
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

        nextNotes = [...lessonResult, ...nextNotes];
        setNotes(nextNotes);

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

        const nextFields = buildItemFields(items, lessonResult);
        initialFieldsRef.current = nextFields;
        setItemFields(nextFields);
        setSaveStatus("saved");
        window.setTimeout(() => {
          setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存失败";
        setSaveStatus("error");
        setError(message);
      } finally {
        savingRef.current = false;
        setSubmitting(false);
        if (pendingAfterSaveRef.current) {
          pendingAfterSaveRef.current = false;
          void saveNotesRef.current({ auto: true });
        }
      }
    },
    [canEdit, itemFields, items, lesson, lessonNotes, locale, notes]
  );

  saveNotesRef.current = saveNotes;

  const scheduleAutoSave = useCallback(() => {
    if (!canEdit) return;
    setSaveStatus("pending");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNotesRef.current({ auto: true });
    }, AUTO_SAVE_MS);
  }, [canEdit]);

  const updateFieldBody = (item: string, key: string, body: string) => {
    setItemFields((prev) => ({
      ...prev,
      [item]: (prev[item] ?? []).map((f) =>
        f.key === key ? { ...f, body } : f
      ),
    }));
    scheduleAutoSave();
  };

  const addField = (item: string) => {
    if (!canEdit) {
      setShowAuth(true);
      return;
    }
    setItemFields((prev) => ({
      ...prev,
      [item]: [...(prev[item] ?? []), { key: newFieldKey(item), body: "" }],
    }));
  };

  const removeField = (item: string, key: string) => {
    if (!canEdit) {
      setShowAuth(true);
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
    scheduleAutoSave();
  };

  const canRemoveField = (item: string, field: NoteField): boolean => {
    const fields = itemFields[item] ?? [];
    if (fields.length > 1) return true;
    return Boolean(field.noteId || field.body.trim());
  };

  const statusHint = saveStatusLabel(saveStatus);

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
              {lesson.completed ? " · 已完成（保存后同步到单词复习）" : ""}
            </p>
          ) : null}
        </div>
        {canEdit && user ? (
          <span className="jp-lesson-notes-user">{user.username}</span>
        ) : (
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
            onClick={() => setShowAuth(true)}
            disabled={checking}
          >
            {checking ? "验证中…" : "登录后编辑"}
          </button>
        )}
      </div>

      {!canEdit ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          访客可浏览笔记；登录后可编辑，输入后会自动保存。
        </p>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          输入后会自动保存；也可随时点「保存笔记」手动保存。
        </p>
      )}

      {showAuth && !canEdit ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <TeacherReviewAuth
            loginOnly
            variant="inline"
            title="登录 · 课堂笔记"
            subtitle="使用 LiLaoshi 或管理员账号登录。"
            onClose={() => setShowAuth(false)}
            onAuthenticated={(next) => {
              setUser(next);
              setShowAuth(false);
            }}
          />
        </div>
      ) : null}

      {loading ? (
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
                        disabled={submitting}
                        onClick={() => addField(item)}
                      >
                        + 添加
                      </button>
                    ) : null}
                  </div>

                  <div className="jp-lesson-notes-fields">
                    {fields.map((field, index) => (
                      <div key={field.key} className="jp-lesson-notes-field">
                        <textarea
                          className="jp-lesson-notes-textarea"
                          rows={3}
                          value={field.body}
                          disabled={!canEdit}
                          placeholder={
                            index === 0
                              ? "记录例句、用法、易错点…"
                              : "继续补充笔记…"
                          }
                          onChange={(e) =>
                            updateFieldBody(item, field.key, e.target.value)
                          }
                        />
                        {canEdit && canRemoveField(item, field) ? (
                          <button
                            type="button"
                            className="jp-lesson-notes-field-remove"
                            disabled={submitting}
                            onClick={() => removeField(item, field.key)}
                            aria-label="删除本条笔记"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {error && lesson ? (
              <p className="jp-lesson-notes-error">{error}</p>
            ) : null}
          </div>

          <div className="jp-lesson-notes-footer">
            {statusHint ? (
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
              </span>
            ) : (
              <span />
            )}
            <div className="jp-lesson-notes-footer-actions">
              {canEdit ? (
                <button
                  type="button"
                  className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
                  disabled={submitting}
                  onClick={() => void saveNotes()}
                >
                  {submitting ? "保存中…" : "保存笔记"}
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
          gap: 0.25rem;
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
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.1rem 1rem;
          border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
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
