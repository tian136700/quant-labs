"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import { planLessonTeacherNameForUpdate } from "@/lib/lesson-teacher-name";
import { filterLessonTeachersBySearch } from "@/lib/lesson-teacher-search";
import { sortJpLessonTeachersByLessonCount } from "@/lib/jp-lesson-teacher-rate";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import type { EnLessonRecord, EnLessonTeacher } from "@/lib/types";

export type EnLessonTeacherUpdateInput = {
  id: number;
  name: string;
};

type TeacherDraft = {
  name: string;
};

type TeacherDraftTouched = {
  name?: boolean;
};

function teacherToDraft(teacher: EnLessonTeacher): TeacherDraft {
  return { name: teacher.name.trim() };
}

type Props = {
  open: boolean;
  lesson: EnLessonRecord | null;
  teachers: EnLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates: EnLessonTeacherUpdateInput[],
    options?: { keepOpen?: boolean }
  ) => void | Promise<void>;
  onAddTeacher: (name: string) => Promise<EnLessonTeacher | null>;
  onDeleteTeacher: (id: number, name: string) => Promise<boolean>;
};

export function EnLessonTeacherEditModal({
  open,
  lesson,
  teachers,
  saving = false,
  onClose,
  onSave,
  onAddTeacher,
  onDeleteTeacher,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, TeacherDraft>>({});
  const [addName, setAddName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [deletingTeacherId, setDeletingTeacherId] = useState<number | null>(null);
  const [addError, setAddError] = useState("");
  const [saveError, setSaveError] = useState("");
  const touchedFieldsRef = useRef<Record<number, TeacherDraftTouched>>({});

  const sortedTeachers = useMemo(
    () => sortJpLessonTeachersByLessonCount(teachers),
    [teachers]
  );

  const saveBusy = saving || addingTeacher || deletingTeacherId != null;
  const saveProgress = useSaveProgressBar(saveBusy);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lesson) return;

    setSelectedIds([...(lesson.teacher_ids ?? [])]);
    setDrafts(Object.fromEntries(teachers.map((teacher) => [teacher.id, teacherToDraft(teacher)])));
    touchedFieldsRef.current = {};
    setAddName("");
    setSearchQuery("");
    setAddError("");
    setSaveError("");
  }, [open, lesson?.id]);

  useEffect(() => {
    if (!open) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const teacher of teachers) {
        const server = teacherToDraft(teacher);
        const existing = next[teacher.id];
        if (!existing) {
          next[teacher.id] = server;
          changed = true;
          continue;
        }
        const touched = touchedFieldsRef.current[teacher.id] ?? {};
        if (!touched.name && existing.name !== server.name) {
          next[teacher.id] = { ...existing, name: server.name };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, teachers]);

  const updateDraft = (teacherId: number, patch: Partial<TeacherDraft>) => {
    if (!touchedFieldsRef.current[teacherId]) {
      touchedFieldsRef.current[teacherId] = {};
    }
    if (patch.name !== undefined) {
      touchedFieldsRef.current[teacherId].name = true;
    }
    setDrafts((prev) => ({
      ...prev,
      [teacherId]: { ...prev[teacherId], ...patch },
    }));
    if (saveError) setSaveError("");
  };

  const toggleTeacher = (teacherId: number) => {
    setSelectedIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const resolveExistingTeacher = (name: string): EnLessonTeacher | undefined =>
    sortedTeachers.find((t) => t.name === name);

  const pendingAddName = addName.trim();
  const pendingExistingTeacher = useMemo(
    () => (pendingAddName ? resolveExistingTeacher(pendingAddName) : undefined),
    [pendingAddName, sortedTeachers]
  );

  useEffect(() => {
    if (!open || !pendingExistingTeacher) return;
    setSelectedIds((prev) =>
      prev.includes(pendingExistingTeacher.id)
        ? prev
        : [...prev, pendingExistingTeacher.id]
    );
  }, [open, pendingExistingTeacher?.id]);

  const filteredTeachers = useMemo(() => {
    const draftsById = new Map(
      sortedTeachers.map((teacher) => [
        teacher.id,
        { draftName: drafts[teacher.id]?.name ?? teacher.name },
      ])
    );
    return filterLessonTeachersBySearch(sortedTeachers, searchQuery, draftsById);
  }, [drafts, searchQuery, sortedTeachers]);

  const handleAddTeacher = async (options?: {
    persist?: boolean;
  }): Promise<number[] | null> => {
    const persist = options?.persist !== false;
    const trimmed = addName.trim();
    if (!trimmed || addingTeacher || saving) return null;

    setAddError("");

    const existing = resolveExistingTeacher(trimmed);
    if (existing) {
      const nextIds = selectedIds.includes(existing.id)
        ? selectedIds
        : [...selectedIds, existing.id];
      if (!selectedIds.includes(existing.id)) {
        try {
          if (persist) {
            await onSave(nextIds, null, [], { keepOpen: true });
          }
          setSelectedIds(nextIds);
          setAddName("");
        } catch {
          setAddError("保存失败，请重试");
          return null;
        }
      } else {
        setAddName("");
      }
      return nextIds;
    }

    setAddingTeacher(true);
    try {
      const teacher = await onAddTeacher(trimmed);
      if (!teacher) {
        setAddError("添加失败，请重试");
        return null;
      }
      const nextIds = selectedIds.includes(teacher.id)
        ? selectedIds
        : [...selectedIds, teacher.id];
      try {
        if (persist) {
          await onSave(nextIds, null, [], { keepOpen: true });
        }
        setSelectedIds(nextIds);
        setAddName("");
        return nextIds;
      } catch {
        setAddError("已添加老师，但关联课程失败，请重试保存");
        return null;
      }
    } finally {
      setAddingTeacher(false);
    }
  };

  const collectTeacherUpdates = (): EnLessonTeacherUpdateInput[] | null => {
    for (const teacher of sortedTeachers) {
      const draft = drafts[teacher.id];
      if (!draft?.name.trim()) {
        setSaveError("老师名称不能为空");
        return null;
      }
    }

    const teacherNameRefs = sortedTeachers.map((teacher) => ({
      id: teacher.id,
      name: drafts[teacher.id]?.name.trim() || teacher.name,
    }));
    const reservedNames = new Set<string>();
    const updates: EnLessonTeacherUpdateInput[] = [];

    for (const teacher of sortedTeachers) {
      const draft = drafts[teacher.id];
      if (!draft) continue;
      const touched = touchedFieldsRef.current[teacher.id] ?? {};
      const name = (touched.name ? draft.name : teacher.name).trim();
      if (name === teacher.name.trim()) continue;

      const plannedName = planLessonTeacherNameForUpdate(
        teacher.id,
        name,
        teacherNameRefs,
        reservedNames
      ).name;
      reservedNames.add(plannedName);
      updates.push({ id: teacher.id, name: plannedName });
    }

    return updates;
  };

  const handleDeleteTeacher = async (teacher: EnLessonTeacher) => {
    if (deletingTeacherId != null || addingTeacher || saving) return;

    const name = (drafts[teacher.id]?.name.trim() || teacher.name).trim();
    if (!name) return;
    if (!confirm(`确定删除「${name}」？已关联的新课将变为未指定。`)) return;

    setDeletingTeacherId(teacher.id);
    setSaveError("");
    setAddError("");
    try {
      const ok = await onDeleteTeacher(teacher.id, name);
      if (!ok) {
        setSaveError("删除失败，请重试");
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => id !== teacher.id));
      delete touchedFieldsRef.current[teacher.id];
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[teacher.id];
        return next;
      });
    } finally {
      setDeletingTeacherId(null);
    }
  };

  const handleSave = async () => {
    if (addingTeacher || saving || deletingTeacherId != null) return;
    setSaveError("");
    let idsToSave = selectedIds;
    if (addName.trim()) {
      const nextIds = await handleAddTeacher({ persist: false });
      if (!nextIds) return;
      idsToSave = nextIds;
    }
    const teacherUpdates = collectTeacherUpdates();
    if (teacherUpdates == null) return;
    try {
      await onSave(idsToSave, null, teacherUpdates);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    }
  };

  if (!open || !mounted || !lesson) return null;

  return createPortal(
    <div
      className="jp-lesson-teacher-overlay"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="jp-lesson-teacher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-lesson-teacher-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-teacher-header">
          <div>
            <h2 id="en-lesson-teacher-modal-title">设置上课老师</h2>
            <p className="jp-lesson-teacher-modal-lesson">
              课程 #{lesson.id} · {lesson.content}
            </p>
          </div>
          <button
            type="button"
            className="jp-lesson-teacher-close"
            aria-label="关闭"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <fieldset
          className="jp-lesson-teacher-fieldset"
          disabled={saving || addingTeacher || deletingTeacherId != null}
        >
          <legend>上课老师（可多选，可直接改名称）</legend>
          <input
            type="text"
            className="jp-lesson-teacher-search"
            value={searchQuery}
            placeholder="模糊搜索老师名称、上课频次等"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="jp-lesson-teacher-options">
            {filteredTeachers.length ? (
              <div className="jp-lesson-teacher-edit-head" aria-hidden="true">
                <span className="jp-lesson-teacher-edit-head__check" />
                <span className="jp-lesson-teacher-edit-head__name">称呼</span>
                <span className="jp-lesson-teacher-edit-head__action">操作</span>
              </div>
            ) : null}
            {filteredTeachers.map((teacher) => {
              const draft = drafts[teacher.id] ?? teacherToDraft(teacher);
              return (
                <div
                  key={teacher.id}
                  className="jp-lesson-teacher-option jp-lesson-teacher-option--editable"
                >
                  <label className="jp-lesson-teacher-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(teacher.id)}
                      aria-label={`选择 ${draft.name || teacher.name}`}
                      onChange={() => toggleTeacher(teacher.id)}
                    />
                  </label>
                  <div className="jp-lesson-teacher-edit-fields">
                    <input
                      type="text"
                      className="jp-lesson-teacher-add-input"
                      value={draft.name}
                      placeholder="老师称呼"
                      onChange={(e) => updateDraft(teacher.id, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="jp-lesson-teacher-delete-btn"
                      disabled={saving || addingTeacher || deletingTeacherId === teacher.id}
                      onClick={() => void handleDeleteTeacher(teacher)}
                    >
                      {deletingTeacherId === teacher.id ? "删除中…" : "删除"}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="jp-lesson-teacher-option jp-lesson-teacher-option--add">
              <label className="jp-lesson-teacher-check jp-lesson-teacher-check--pending">
                <input
                  type="checkbox"
                  checked={Boolean(pendingAddName)}
                  disabled={addingTeacher || saving || !pendingAddName}
                  aria-label={
                    pendingAddName
                      ? `将添加并选择 ${pendingAddName}`
                      : "填写称呼后自动勾选"
                  }
                  onChange={(e) => {
                    if (!e.target.checked) {
                      if (pendingExistingTeacher) {
                        setSelectedIds((prev) =>
                          prev.filter((id) => id !== pendingExistingTeacher.id)
                        );
                      }
                      setAddName("");
                      setAddError("");
                    }
                  }}
                />
              </label>
              <div className="jp-lesson-teacher-add-fields">
                <span className="jp-lesson-teacher-add-label">添加老师</span>
                <input
                  type="text"
                  className="jp-lesson-teacher-add-input"
                  value={addName}
                  placeholder="老师称呼"
                  disabled={addingTeacher || saving}
                  onChange={(e) => {
                    setAddName(e.target.value);
                    if (addError) setAddError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddTeacher();
                    }
                  }}
                />
                <button
                  type="button"
                  className="jp-lesson-teacher-add-save-btn"
                  disabled={addingTeacher || saving || !pendingAddName}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleAddTeacher()}
                >
                  {addingTeacher ? "保存中…" : "保存"}
                </button>
                <p className="jp-lesson-teacher-add-optional-hint">
                  填写称呼后点右侧保存，会添加并关联本课；也可点底部保存一并提交。
                </p>
              </div>
            </div>
          </div>
          {addError ? <p className="jp-lesson-teacher-add-error">{addError}</p> : null}
          {saveError ? <p className="jp-lesson-teacher-add-error">{saveError}</p> : null}
          {!sortedTeachers.length ? (
            <p className="jp-lesson-teacher-hint">暂无老师；可在下方直接添加。</p>
          ) : !filteredTeachers.length ? (
            <p className="jp-lesson-teacher-hint">没有匹配的老师，请换个关键词试试。</p>
          ) : null}
        </fieldset>

        {saveProgress.visible ? (
          <JpVocabSaveProgressBar
            label={jpVocabSaveProgressLabel("save")}
            percent={saveProgress.percent}
            fullWidth
          />
        ) : null}

        <div className="jp-lesson-teacher-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saveBusy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saveBusy}
            // 避免点保存时先 blur 输入框触发添加，导致按钮变 disabled 吞掉 click
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void handleSave()}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx>{`
        .jp-lesson-teacher-overlay {
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

        .jp-lesson-teacher-modal {
          width: min(560px, 100%);
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-teacher-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .jp-lesson-teacher-header h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 600;
        }

        .jp-lesson-teacher-modal-lesson {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .jp-lesson-teacher-close {
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

        .jp-lesson-teacher-fieldset {
          margin: 0 0 0.75rem;
          padding: 0;
          border: none;
        }

        .jp-lesson-teacher-fieldset legend {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-bottom: 0.5rem;
        }

        .jp-lesson-teacher-search {
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 0.55rem;
          padding: 0.5rem 0.65rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--panel);
          color: inherit;
          font-size: 0.875rem;
        }

        .jp-lesson-teacher-options {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          max-height: min(55vh, 380px);
          overflow-y: auto;
          padding: 0.65rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg) 35%, var(--panel));
        }

        .jp-lesson-teacher-edit-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 0 0.15rem;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .jp-lesson-teacher-edit-head__check {
          flex-shrink: 0;
          width: 1rem;
        }

        .jp-lesson-teacher-edit-head__name {
          flex: 1 1 8rem;
          min-width: 0;
        }

        .jp-lesson-teacher-edit-head__action {
          flex: 0 0 3.5rem;
          text-align: center;
        }

        .jp-lesson-teacher-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
        }

        .jp-lesson-teacher-option--editable {
          align-items: flex-start;
        }

        .jp-lesson-teacher-check {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2.75rem;
          min-height: 2.75rem;
          margin-top: 0;
          cursor: pointer;
        }

        .jp-lesson-teacher-check input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          margin: 0;
          cursor: pointer;
        }

        .jp-lesson-teacher-check--pending input[type="checkbox"]:disabled {
          cursor: default;
          opacity: 1;
        }

        .jp-lesson-teacher-edit-fields,
        .jp-lesson-teacher-add-fields {
          flex: 1 1 12rem;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }

        .jp-lesson-teacher-option--add {
          flex-wrap: wrap;
          align-items: flex-start;
        }

        .jp-lesson-teacher-add-label {
          color: var(--muted);
          flex-shrink: 0;
        }

        .jp-lesson-teacher-add-input {
          flex: 1 1 8rem;
          min-width: 0;
          padding: 0.35rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--panel);
          color: inherit;
          font-size: 0.8125rem;
        }

        .jp-lesson-teacher-delete-btn {
          flex: 0 0 3.5rem;
          height: 2rem;
          border: 1px solid color-mix(in srgb, var(--rise) 45%, var(--border));
          border-radius: 6px;
          background: color-mix(in srgb, var(--rise) 10%, var(--panel));
          color: var(--rise);
          font-size: 0.75rem;
          cursor: pointer;
        }

        .jp-lesson-teacher-delete-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--rise) 18%, var(--panel));
        }

        .jp-lesson-teacher-delete-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-teacher-add-save-btn {
          flex: 0 0 3.5rem;
          height: 2rem;
          border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
          border-radius: 6px;
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
          font-size: 0.75rem;
          cursor: pointer;
        }

        .jp-lesson-teacher-add-save-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 22%, var(--panel));
        }

        .jp-lesson-teacher-add-save-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-teacher-add-optional-hint {
          flex: 1 1 100%;
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .jp-lesson-teacher-add-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .jp-lesson-teacher-add-error {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--rise);
        }

        .jp-lesson-teacher-hint {
          margin: 0.45rem 0 0;
          font-size: 0.8125rem;
          color: var(--muted);
        }

        .jp-lesson-teacher-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 0.65rem;
        }

        :global(.jp-lesson-action-btn--primary) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 14%, var(--panel));
          color: var(--accent);
        }
      `}</style>
    </div>,
    document.body
  );
}
