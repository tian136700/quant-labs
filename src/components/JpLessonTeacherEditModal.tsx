"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JpLessonRecord, JpLessonTeacher } from "@/lib/types";
import { calcHourlyRate, formatHourlyRate, normalizeHourlyRate, normalizeTeacherLessonMinutes, resolveLessonTeacherRateFields, sortJpLessonTeachersByLessonCount } from "@/lib/jp-lesson-teacher-rate";
import { JP_LESSON_CLASS_DURATION_MINUTES } from "@/lib/jp-lesson-shared";
import { planLessonTeacherNameForUpdate } from "@/lib/lesson-teacher-name";
import { filterLessonTeachersBySearch } from "@/lib/lesson-teacher-search";

export type JpLessonTeacherAddInput = {
  name: string;
  lesson_price?: number;
  lesson_minutes?: number;
};

export type JpLessonTeacherUpdateInput = {
  id: number;
  name: string;
  hourly_rate: number | null;
  lesson_minutes: number | null;
};

type TeacherDraft = {
  name: string;
  hourlyRate: string;
  lessonMinutes: string;
};

type TeacherDraftTouched = {
  name?: boolean;
  hourlyRate?: boolean;
  lessonMinutes?: boolean;
};

function teacherToDraft(teacher: JpLessonTeacher): TeacherDraft {
  const resolved = resolveLessonTeacherRateFields(teacher);
  return {
    name: resolved.name,
    hourlyRate:
      resolved.hourly_rate != null ? String(resolved.hourly_rate) : "",
    lessonMinutes:
      resolved.lesson_minutes != null ? String(resolved.lesson_minutes) : "",
  };
}

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  teachers: JpLessonTeacher[];
  saving?: boolean;
  onClose: () => void;
  onSave: (
    teacherIds: number[],
    teacherOther: string | null,
    teacherUpdates: JpLessonTeacherUpdateInput[],
    options?: { keepOpen?: boolean }
  ) => Promise<void>;
  onAddTeacher: (input: JpLessonTeacherAddInput) => Promise<JpLessonTeacher | null>;
  onUpdateTeacher: (input: JpLessonTeacherUpdateInput) => Promise<JpLessonTeacher | null>;
  onDeleteTeacher: (id: number, name: string) => Promise<boolean>;
};

const TEACHER_LESSON_MINUTE_OPTIONS = JP_LESSON_CLASS_DURATION_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? "60 分钟（1 小时）" : `${minutes} 分钟`,
}));

export function JpLessonTeacherEditModal({
  open,
  lesson,
  teachers,
  saving = false,
  onClose,
  onSave,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, TeacherDraft>>({});
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addMinutes, setAddMinutes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [deletingTeacherId, setDeletingTeacherId] = useState<number | null>(null);
  const [addError, setAddError] = useState("");
  const [saveError, setSaveError] = useState("");
  const skipAddBlurRef = useRef(false);
  const touchedFieldsRef = useRef<Record<number, TeacherDraftTouched>>({});

  const addHourlyPreview = useMemo(() => {
    const price = Number(addPrice);
    const minutes = Number(addMinutes);
    if (!addPrice.trim() || !addMinutes.trim()) return null;
    return calcHourlyRate(price, minutes);
  }, [addPrice, addMinutes]);

  const sortedTeachers = useMemo(
    () => sortJpLessonTeachersByLessonCount(teachers),
    [teachers]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lesson) return;

    setSelectedIds([...(lesson.teacher_ids ?? [])]);
    setDrafts(Object.fromEntries(teachers.map((teacher) => [teacher.id, teacherToDraft(teacher)])));
    touchedFieldsRef.current = {};
    setAddName("");
    setAddPrice("");
    setAddMinutes("");
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
        const merged: TeacherDraft = { ...existing };
        let rowChanged = false;
        if (!touched.name && existing.name !== server.name) {
          merged.name = server.name;
          rowChanged = true;
        }
        if (!touched.hourlyRate && existing.hourlyRate !== server.hourlyRate) {
          merged.hourlyRate = server.hourlyRate;
          rowChanged = true;
        }
        if (!touched.lessonMinutes && existing.lessonMinutes !== server.lessonMinutes) {
          merged.lessonMinutes = server.lessonMinutes;
          rowChanged = true;
        }
        if (rowChanged) {
          next[teacher.id] = merged;
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
    const touched = touchedFieldsRef.current[teacherId];
    if (patch.name !== undefined) touched.name = true;
    if (patch.hourlyRate !== undefined) touched.hourlyRate = true;
    if (patch.lessonMinutes !== undefined) touched.lessonMinutes = true;
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

  const resolveExistingTeacher = (name: string): JpLessonTeacher | undefined =>
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

  const clearPendingAdd = () => {
    setAddName("");
    setAddPrice("");
    setAddMinutes("");
    setAddError("");
  };

  const filteredTeachers = useMemo(() => {
    const draftsById = new Map(
      sortedTeachers.map((teacher) => [
        teacher.id,
        { draftName: drafts[teacher.id]?.name ?? teacher.name },
      ])
    );
    return filterLessonTeachersBySearch(sortedTeachers, searchQuery, draftsById);
  }, [drafts, searchQuery, sortedTeachers]);

  const buildAddInput = (): JpLessonTeacherAddInput | null => {
    const trimmed = addName.trim();
    if (!trimmed) return null;
    const input: JpLessonTeacherAddInput = { name: trimmed };
    if (addPrice.trim() && addMinutes.trim()) {
      input.lesson_price = Number(addPrice);
      input.lesson_minutes = Number(addMinutes);
    }
    return input;
  };

  const validateAddRateFields = (): boolean => {
    const hasPrice = Boolean(addPrice.trim());
    const hasMinutes = Boolean(addMinutes.trim());
    if (hasPrice !== hasMinutes) {
      setAddError("金额与时长需同时填写，或都留空");
      return false;
    }
    if (hasPrice && hasMinutes) {
      const price = normalizeHourlyRate(addPrice);
      const minutes = normalizeTeacherLessonMinutes(addMinutes);
      if (price == null || minutes == null) {
        setAddError("请填写有效的金额与分钟数");
        return false;
      }
    }
    return true;
  };

  const handleAddTeacher = async (options?: {
    persist?: boolean;
  }): Promise<number[] | null> => {
    const persist = options?.persist !== false;
    const input = buildAddInput();
    if (!input || addingTeacher || saving) return null;

    skipAddBlurRef.current = true;
    setAddError("");

    if (!validateAddRateFields()) {
      skipAddBlurRef.current = false;
      return null;
    }

    const existing = resolveExistingTeacher(input.name);
    if (existing) {
      let teacherUpdates: JpLessonTeacherUpdateInput[] = [];
      if (addPrice.trim() && addMinutes.trim()) {
        const price = normalizeHourlyRate(addPrice);
        const minutes = normalizeTeacherLessonMinutes(addMinutes);
        if (price == null || minutes == null) {
          setAddError("请填写有效的金额与分钟数");
          skipAddBlurRef.current = false;
          return null;
        }
        teacherUpdates = [
          {
            id: existing.id,
            name: existing.name,
            hourly_rate: price,
            lesson_minutes: minutes,
          },
        ];
      }

      const nextIds = selectedIds.includes(existing.id)
        ? selectedIds
        : [...selectedIds, existing.id];
      if (!selectedIds.includes(existing.id) || teacherUpdates.length > 0) {
        try {
          if (persist) {
            await onSave(nextIds, null, teacherUpdates, { keepOpen: true });
          }
          setSelectedIds(nextIds);
          setAddName("");
          setAddPrice("");
          setAddMinutes("");
        } catch {
          setAddError("保存失败，请重试");
          skipAddBlurRef.current = false;
          return null;
        }
      } else {
        setAddName("");
        setAddPrice("");
        setAddMinutes("");
      }
      skipAddBlurRef.current = false;
      return nextIds;
    }

    setAddingTeacher(true);
    try {
      const teacher = await onAddTeacher(input);
      if (!teacher) {
        setAddError("添加失败，请重试");
        skipAddBlurRef.current = false;
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
        setAddPrice("");
        setAddMinutes("");
        return nextIds;
      } catch {
        setAddError("已添加老师，但关联课程失败，请重试保存");
        return null;
      }
    } finally {
      setAddingTeacher(false);
      skipAddBlurRef.current = false;
    }
  };

  const collectTeacherUpdates = (): JpLessonTeacherUpdateInput[] | null => {
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
    const updates: JpLessonTeacherUpdateInput[] = [];

    for (const teacher of sortedTeachers) {
      const draft = drafts[teacher.id];
      if (!draft) continue;
      const baseline = resolveLessonTeacherRateFields(teacher);
      const touched = touchedFieldsRef.current[teacher.id] ?? {};
      const name = (touched.name ? draft.name : baseline.name).trim();
      const hourly_rate = touched.hourlyRate
        ? draft.hourlyRate.trim()
          ? normalizeHourlyRate(draft.hourlyRate)
          : null
        : baseline.hourly_rate;
      const lesson_minutes = touched.lessonMinutes
        ? draft.lessonMinutes.trim()
          ? normalizeTeacherLessonMinutes(draft.lessonMinutes)
          : null
        : baseline.lesson_minutes;
      const changed =
        name !== baseline.name ||
        hourly_rate !== baseline.hourly_rate ||
        lesson_minutes !== baseline.lesson_minutes;
      if (!changed) continue;

      const plannedName = planLessonTeacherNameForUpdate(
        teacher.id,
        name,
        teacherNameRefs,
        reservedNames
      ).name;
      reservedNames.add(plannedName);
      updates.push({
        id: teacher.id,
        name: plannedName,
        hourly_rate,
        lesson_minutes,
      });
    }

    return updates;
  };

  const handleDeleteTeacher = async (teacher: JpLessonTeacher) => {
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
        aria-labelledby="jp-lesson-teacher-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jp-lesson-teacher-header">
          <div>
            <h2 id="jp-lesson-teacher-modal-title">设置上课老师</h2>
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

        <div className="jp-lesson-teacher-body">
        <fieldset
          className="jp-lesson-teacher-fieldset"
          disabled={saving || addingTeacher || deletingTeacherId != null}
        >
          <legend>上课老师（可多选，可直接改名称、课时费与时长）</legend>
          <input
            type="text"
            className="jp-lesson-teacher-search"
            value={searchQuery}
            placeholder="模糊搜索老师、上课频次、课时费或时长"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="jp-lesson-teacher-options">
            {filteredTeachers.length ? (
              <div className="jp-lesson-teacher-edit-head" aria-hidden="true">
                <span className="jp-lesson-teacher-edit-head__check" />
                <span className="jp-lesson-teacher-edit-head__name">称呼</span>
                <span className="jp-lesson-teacher-edit-head__count">频次</span>
                <span className="jp-lesson-teacher-edit-head__rate">课时费</span>
                <span className="jp-lesson-teacher-edit-head__minutes">时长</span>
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
                      onChange={(e) =>
                        updateDraft(teacher.id, { name: e.target.value })
                      }
                    />
                    <span
                      className="jp-lesson-teacher-lesson-count"
                      title="已关联新课数量"
                    >
                      {teacher.lesson_count ?? 0}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="jp-lesson-teacher-add-input jp-lesson-teacher-add-input--short"
                      value={draft.hourlyRate}
                      placeholder="课时费"
                      onChange={(e) =>
                        updateDraft(teacher.id, { hourlyRate: e.target.value })
                      }
                    />
                    <select
                      className="jp-lesson-teacher-add-input jp-lesson-teacher-add-input--short jp-lesson-teacher-add-select"
                      value={draft.lessonMinutes}
                      onChange={(e) =>
                        updateDraft(teacher.id, { lessonMinutes: e.target.value })
                      }
                    >
                      <option value="">时长</option>
                      {TEACHER_LESSON_MINUTE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="jp-lesson-teacher-delete-btn"
                      disabled={
                        saving || addingTeacher || deletingTeacherId === teacher.id
                      }
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
                      clearPendingAdd();
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
                  onBlur={() => {
                    if (skipAddBlurRef.current) return;
                    if (addName.trim()) void handleAddTeacher();
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="jp-lesson-teacher-add-input jp-lesson-teacher-add-input--short"
                  value={addPrice}
                  placeholder="金额（可选）"
                  disabled={addingTeacher || saving}
                  onChange={(e) => {
                    setAddPrice(e.target.value);
                    if (addError) setAddError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddTeacher();
                    }
                  }}
                />
                <select
                  className="jp-lesson-teacher-add-input jp-lesson-teacher-add-input--short jp-lesson-teacher-add-select"
                  value={addMinutes}
                  disabled={addingTeacher || saving}
                  onChange={(e) => {
                    setAddMinutes(e.target.value);
                    if (addError) setAddError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddTeacher();
                    }
                  }}
                >
                  <option value="">时长（可选）</option>
                  {TEACHER_LESSON_MINUTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {addHourlyPreview != null ? (
                  <span className="jp-lesson-teacher-add-preview">
                    折合时薪 ≈ {formatHourlyRate(addHourlyPreview)}
                  </span>
                ) : null}
                <p className="jp-lesson-teacher-add-optional-hint">
                  填写称呼即视为勾选；点保存会自动添加并关联本课。金额与时长可稍后再补。
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
        </div>

        <div className="jp-lesson-teacher-actions">
          <button
            type="button"
            className="jp-lesson-action-btn"
            disabled={saving || deletingTeacherId != null}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            disabled={saving || addingTeacher || deletingTeacherId != null}
            onClick={() => void handleSave()}
          >
            {saving ? "保存中…" : "保存"}
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
          display: flex;
          flex-direction: column;
          width: min(620px, 100%);
          max-height: min(94vh, 900px);
          overflow: hidden;
          padding: 1rem 1.1rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .jp-lesson-teacher-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .jp-lesson-teacher-header {
          flex-shrink: 0;
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

        .jp-lesson-teacher-edit-head__count {
          flex: 0 0 2.25rem;
          text-align: center;
        }

        .jp-lesson-teacher-edit-head__rate {
          flex: 0 1 5rem;
        }

        .jp-lesson-teacher-edit-head__minutes {
          flex: 0 1 7.5rem;
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

        .jp-lesson-teacher-edit-fields {
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

        .jp-lesson-teacher-add-fields {
          flex: 1 1 12rem;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
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

        .jp-lesson-teacher-add-input--short {
          flex: 0 1 5rem;
        }

        .jp-lesson-teacher-lesson-count {
          flex: 0 0 2.25rem;
          text-align: center;
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }

        .jp-lesson-teacher-add-select {
          flex: 0 1 7.5rem;
          min-width: 7rem;
          cursor: pointer;
        }

        .jp-lesson-teacher-add-select:disabled {
          cursor: not-allowed;
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

        .jp-lesson-teacher-add-preview {
          flex: 1 1 100%;
          font-size: 0.75rem;
          color: var(--muted);
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
