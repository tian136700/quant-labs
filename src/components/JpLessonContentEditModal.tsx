"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JpVocabSaveProgressBar } from "@/components/JpVocabSaveProgressBar";
import { JpLessonContentEditAiPlanSection } from "@/components/jp-lesson-page/JpLessonContentEditAiPlanSection";
import type { JpLessonCompleteContentItemsResult } from "@/components/jp-lesson-page/completeJpLessonContentItems";
import type { JpLessonContentSaveResult } from "@/components/jp-lesson-page/saveJpLessonContentMeanings";
import { useSaveProgressBar } from "@/hooks/useSaveProgressBar";
import {
  buildJpLessonContentEditRows,
  buildJpLessonContentMeaningsFromRows,
  createEmptyJpLessonContentEditRow,
  isJpLessonContentEditRowsDirty,
  resolveJpLessonContentCompleteIndexes,
  type JpLessonContentEditRow,
} from "@/lib/jp-lesson-content-edit";
import { jpVocabSaveProgressLabel } from "@/lib/jp-vocab-save-progress";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import type { JpLessonRecord, JpVocabRef } from "@/lib/types";

type Props = {
  open: boolean;
  lesson: JpLessonRecord | null;
  saving?: boolean;
  /** 管理员：可展开 AI 教案提示词与粘贴挂图 */
  showAiPlanTools?: boolean;
  onClose: () => void;
  onSave: (
    content: string,
    meanings: string | null,
    options?: { keepOpen?: boolean }
  ) => void | Promise<void> | Promise<JpLessonContentSaveResult>;
  /** 删光最后一项学习内容时：删除整条未完成课 */
  onDeleteLesson?: () =>
    | void
    | Promise<void>
    | Promise<JpLessonContentSaveResult>
    | JpLessonContentSaveResult;
  onCompleteItems?: (
    itemIndexes: number[]
  ) =>
    | void
    | Promise<void>
    | Promise<JpLessonCompleteContentItemsResult>
    | JpLessonCompleteContentItemsResult;
  onAiPlanAttached?: (payload: {
    lessons: JpLessonRecord[];
    refs: Record<string, JpVocabRef>;
  }) => void;
};

export function JpLessonContentEditModal({
  open,
  lesson,
  saving = false,
  showAiPlanTools = false,
  onClose,
  onSave,
  onDeleteLesson,
  onCompleteItems,
  onAiPlanAttached,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<JpLessonContentEditRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const saveBusy = saving;
  const saveProgress = useSaveProgressBar(saveBusy);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open || !lesson) return;
    setRows(buildJpLessonContentEditRows(lesson.content, lesson.meanings));
    setSelectedIds([]);
    setLocalError(null);
    setAiPlanOpen(false);
    // 仅 id / 学习内容变化时重载；挂教案只改 ref_key，勿冲掉编辑中的行或收起提示词
  }, [open, lesson?.id, lesson?.content, lesson?.meanings]);

  const aiPlanWords = useMemo(
    () =>
      rows
        .map((row) => (row.content || "").trim())
        .filter(Boolean),
    [rows]
  );
  const aiPlanMeanings = useMemo(
    () =>
      rows
        .filter((row) => (row.content || "").trim())
        .map((row) => (row.meaning || "").trim() || null),
    [rows]
  );

  useEffect(() => {
    if (!localError) return;
    errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [localError]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0;

  if (!mounted || !open || !lesson) return null;

  const updateRow = (
    id: string,
    patch: Partial<Pick<JpLessonContentEditRow, "content" | "meaning">>
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(rows.map((row) => row.id));
  };

  const removeRowsByIds = async (ids: string[]) => {
    if (!ids.length || saveBusy) return;
    const idSet = new Set(ids);
    const prevRows = rows;
    const nextRows = prevRows.filter((row) => !idSet.has(row.id));
    const parsed = buildJpLessonContentMeaningsFromRows(nextRows);

    // 删光全部学习内容 → 整条未完成课一起删掉
    if (!parsed.ok) {
      if (!onDeleteLesson) {
        setLocalError("当前账号不能删除整课，请保留至少一项或换有权限的账号。");
        return;
      }
      setRows([createEmptyJpLessonContentEditRow()]);
      setSelectedIds([]);
      setLocalError(null);
      const result = await onDeleteLesson();
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === false
      ) {
        setRows(prevRows);
        setLocalError(result.error || "删除整课失败，已恢复原内容");
        return;
      }
      onClose();
      return;
    }

    setRows(nextRows);
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    setLocalError(null);
    const result = await onSave(parsed.value.content, parsed.value.meanings, {
      keepOpen: true,
    });
    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === false
    ) {
      setRows(prevRows);
      setLocalError(result.error || "删除后保存失败，已恢复原内容");
    }
  };

  const willDeleteEntireLesson = (ids: string[]) => {
    const idSet = new Set(ids);
    const remaining = rows.filter(
      (row) => !idSet.has(row.id) && (row.content || "").trim()
    );
    return remaining.length === 0;
  };

  const removeRow = (id: string) => {
    if (saveBusy) return;
    const target = rows.find((row) => row.id === id);
    const label = (target?.content || "").trim() || "这一项";
    const wipeLesson = willDeleteEntireLesson([id]);
    const message = wipeLesson
      ? `「${label}」是最后一项。删除后整条未完成课也会删掉，确定吗？`
      : `确定删除「${label}」及其释义吗？删除后会立即保存。`;
    if (!window.confirm(message)) return;
    void removeRowsByIds([id]);
  };

  const removeSelected = () => {
    if (!selectedIds.length || saveBusy) return;
    const wipeLesson = willDeleteEntireLesson(selectedIds);
    const message = wipeLesson
      ? `删除已选 ${selectedIds.length} 项后将没有剩余学习内容，整条未完成课也会删掉，确定吗？`
      : `确定删除已选的 ${selectedIds.length} 项及其释义吗？删除后会立即保存。`;
    if (!window.confirm(message)) return;
    void removeRowsByIds(selectedIds);
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyJpLessonContentEditRow()]);
  };

  const requestCompleteIndexes = async (rowIds: string[]) => {
    if (!lesson || !onCompleteItems) {
      setLocalError("当前账号不能标完成，请用有操作权限的账号重试。");
      return;
    }
    if (saveBusy) {
      setLocalError("正在处理中，请稍候再标完成。");
      return;
    }
    if (lesson.completed) {
      setLocalError("已完成的课请在列表里管理；此处不能再拆项标完成。");
      return;
    }
    if (isJpLessonContentEditRowsDirty(lesson, rows)) {
      setLocalError("有未保存的修改，请先点「保存」，再标完成。");
      return;
    }
    const indexes = resolveJpLessonContentCompleteIndexes(
      lesson,
      rows,
      rowIds
    );
    if (indexes == null) {
      setLocalError("选中项与已保存内容不一致，请关闭弹窗后重开再试。");
      return;
    }
    if (!indexes.length) {
      setLocalError("请勾选有学习内容的项后再标完成。");
      return;
    }
    const labels = indexes
      .map((i) => (rows[i]?.content || "").trim() || `#${i + 1}`)
      .slice(0, 5);
    const more =
      indexes.length > labels.length
        ? `等 ${indexes.length} 项`
        : `${indexes.length} 项`;
    if (
      !window.confirm(
        `确定将「${labels.join("、")}」${indexes.length > 1 ? `（${more}）` : ""}标为已完成吗？\n` +
          `每项会在「已完成」新建一条课（无教案），并同步到日语抽问；原课将去掉这些词。`
      )
    ) {
      return;
    }
    setLocalError(null);
    const result = await onCompleteItems(indexes);
    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === false
    ) {
      setLocalError(result.error || "标完成失败");
    }
  };

  const completeSelected = () => {
    void requestCompleteIndexes(selectedIds);
  };

  const completeRow = (id: string) => {
    void requestCompleteIndexes([id]);
  };

  const handleSave = () => {
    const parsed = buildJpLessonContentMeaningsFromRows(rows);
    if (!parsed.ok) {
      setLocalError("至少填写一项学习内容（可删空行后再保存）。");
      return;
    }
    setLocalError(null);
    void onSave(parsed.value.content, parsed.value.meanings);
  };

  return createPortal(
    <div
      className="jp-lesson-content-edit-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saveBusy) onClose();
      }}
    >
      <div
        className="jp-lesson-content-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jp-lesson-content-edit-title"
      >
        <div className="jp-lesson-content-edit-header">
          <h2 id="jp-lesson-content-edit-title">编辑学习内容与释义</h2>
          <p className="jp-lesson-content-edit-sub">
            课程 #{lesson.id}
            {lesson.course_label ? ` · ${lesson.course_label}` : ""}
            {" · "}
            每行一词与释义对应；勾选后点上方「删除所选」或「标所选完成」。
          </p>
          <div className="jp-lesson-content-edit-toolbar">
            <button
              type="button"
              className="jp-lesson-action-btn"
              disabled={saveBusy}
              onClick={addRow}
            >
              添加一项
            </button>
            <button
              type="button"
              className="jp-lesson-action-btn jp-lesson-content-edit-batch-delete"
              disabled={saveBusy || !someSelected}
              onClick={removeSelected}
              title="删除勾选的多项及其释义"
            >
              删除所选
              {someSelected ? `（${selectedIds.length}）` : ""}
            </button>
            {onCompleteItems && !lesson.completed ? (
              <button
                type="button"
                className="jp-lesson-action-btn jp-lesson-content-edit-batch-complete"
                disabled={saveBusy || !someSelected}
                onClick={completeSelected}
                title="将勾选项拆成已完成课并同步日语抽问"
              >
                标所选完成
                {someSelected ? `（${selectedIds.length}）` : ""}
              </button>
            ) : null}
            {showAiPlanTools && onAiPlanAttached ? (
              <button
                type="button"
                className="jp-lesson-action-btn"
                disabled={saveBusy}
                aria-expanded={aiPlanOpen}
                onClick={() => setAiPlanOpen((v) => !v)}
                title="复制 AI 教案提示词，并粘贴图片挂到本课"
              >
                {aiPlanOpen ? "收起教案提示词" : "做教案提示词"}
              </button>
            ) : null}
          </div>
          {localError ? (
            <p
              ref={errorRef}
              className="jp-lesson-content-edit-error"
              role="alert"
            >
              {localError}
            </p>
          ) : null}
          {saveProgress.visible ? (
            <div className="jp-lesson-content-edit-progress">
              <JpVocabSaveProgressBar
                label={jpVocabSaveProgressLabel("save")}
                percent={saveProgress.percent}
                fullWidth
              />
            </div>
          ) : null}
        </div>

        {showAiPlanTools && onAiPlanAttached ? (
          <JpLessonContentEditAiPlanSection
            open={aiPlanOpen}
            lesson={lesson}
            words={aiPlanWords}
            meanings={aiPlanMeanings}
            disabled={saveBusy}
            onAttached={onAiPlanAttached}
          />
        ) : null}

        <div className="jp-lesson-content-edit-body">
          <div className="jp-lesson-content-edit-list-head">
            <label className="jp-lesson-content-edit-check">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={saveBusy || !rows.length}
                aria-label="全选"
                onChange={toggleSelectAll}
              />
            </label>
            <span className="jp-lesson-content-edit-idx">#</span>
            <span>学习内容</span>
            <span>释义</span>
            <span className="jp-lesson-content-edit-del-head">操作</span>
          </div>

          <ul className="jp-lesson-content-edit-list">
            {rows.map((row, index) => (
              <li key={row.id} className="jp-lesson-content-edit-row">
                <label className="jp-lesson-content-edit-check">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(row.id)}
                    disabled={saveBusy}
                    aria-label={`勾选第 ${index + 1} 项`}
                    onChange={() => toggleSelected(row.id)}
                  />
                </label>
                <span
                  className="jp-lesson-content-edit-idx"
                  aria-label={`第 ${index + 1} 项`}
                >
                  {index + 1}
                </span>
                <label className="jp-lesson-content-edit-cell jp-lesson-content-edit-cell--content">
                  <span className="jp-lesson-content-edit-cell-label">
                    学习内容
                  </span>
                  <input
                    type="text"
                    className="jp-lesson-content-edit-input"
                    value={row.content}
                    disabled={saveBusy}
                    spellCheck={false}
                    placeholder="单词 / 语法"
                    aria-label={`第 ${index + 1} 项学习内容`}
                    onChange={(e) =>
                      updateRow(row.id, { content: e.target.value })
                    }
                  />
                </label>
                <label className="jp-lesson-content-edit-cell jp-lesson-content-edit-cell--meaning">
                  <span className="jp-lesson-content-edit-cell-label">释义</span>
                  <input
                    type="text"
                    className="jp-lesson-content-edit-input"
                    value={row.meaning}
                    disabled={saveBusy}
                    spellCheck={false}
                    placeholder="中文释义"
                    aria-label={`第 ${index + 1} 项释义`}
                    onChange={(e) =>
                      updateRow(row.id, { meaning: e.target.value })
                    }
                  />
                </label>
                <div className="jp-lesson-content-edit-row-actions">
                  {onCompleteItems && !lesson.completed ? (
                    <button
                      type="button"
                      className="jp-lesson-content-edit-complete"
                      disabled={saveBusy || !(row.content || "").trim()}
                      title="标完成：拆成已完成课并同步日语抽问"
                      aria-label={`标完成第 ${index + 1} 项`}
                      onClick={() => completeRow(row.id)}
                    >
                      标完成
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="jp-lesson-content-edit-delete"
                    disabled={saveBusy}
                    title="删除这一项及其释义"
                    aria-label={`删除第 ${index + 1} 项`}
                    onClick={() => removeRow(row.id)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="jp-lesson-content-edit-hint">
            共 {rows.filter((r) => r.content.trim()).length} 项有效内容
            {someSelected ? ` · 已勾选 ${selectedIds.length} 项` : ""}
            。删除会立即保存；删光最后一项会去掉整条未完成课。改文字后点「保存」。
          </p>
        </div>

        <div className="jp-lesson-content-edit-actions">
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
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>

      <style jsx global>{`
        .jp-lesson-content-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.55);
        }
        .jp-lesson-content-edit-modal {
          display: flex;
          flex-direction: column;
          width: min(980px, 100%);
          max-height: min(calc(100dvh - 2rem), 900px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }
        .jp-lesson-content-edit-header {
          flex-shrink: 0;
          padding: 1rem 1.1rem 0.65rem;
          border-bottom: 1px solid var(--border);
        }
        .jp-lesson-content-edit-header h2 {
          margin: 0;
          font-size: 1.1rem;
        }
        .jp-lesson-content-edit-sub {
          margin: 0.35rem 0 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.45;
        }
        .jp-lesson-content-edit-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.65rem;
          margin-top: 0.75rem;
        }
        .jp-lesson-content-edit-batch-delete {
          color: #e85d6f;
          border-color: color-mix(in srgb, #e85d6f 45%, var(--border));
        }
        .jp-lesson-content-edit-batch-delete:hover:not(:disabled) {
          background: color-mix(in srgb, #e85d6f 14%, transparent);
        }
        .jp-lesson-content-edit-batch-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-lesson-content-edit-batch-complete {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        }
        .jp-lesson-content-edit-batch-complete:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 14%, transparent);
        }
        .jp-lesson-content-edit-batch-complete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-lesson-content-edit-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0.85rem 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .jp-lesson-content-edit-list-head {
          padding: 0 0.15rem;
          color: var(--muted);
          font-size: 0.78rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-del-head {
          text-align: center;
        }
        .jp-lesson-content-edit-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          cursor: pointer;
        }
        .jp-lesson-content-edit-check input {
          width: 1.05rem;
          height: 1.05rem;
          accent-color: var(--accent);
        }
        .jp-lesson-content-edit-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .jp-lesson-content-edit-list-head,
        .jp-lesson-content-edit-row {
          display: grid;
          grid-template-columns: 1.75rem 2rem minmax(0, 1fr) minmax(0, 1fr) minmax(5.5rem, 7.5rem);
          gap: 0.45rem;
          align-items: center;
        }
        .jp-lesson-content-edit-row {
          padding: 0.4rem 0.35rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg) 88%, var(--panel));
        }
        .jp-lesson-content-edit-idx {
          text-align: center;
          color: var(--muted);
          font-size: 0.85rem;
          font-variant-numeric: tabular-nums;
        }
        .jp-lesson-content-edit-cell {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }
        .jp-lesson-content-edit-cell-label {
          display: none;
          color: var(--muted);
          font-size: 0.72rem;
          font-weight: 600;
        }
        .jp-lesson-content-edit-input {
          width: 100%;
          min-width: 0;
          padding: 0.5rem 0.6rem;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font: inherit;
          font-size: 0.92rem;
          line-height: 1.4;
        }
        .jp-lesson-content-edit-input:focus {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        .jp-lesson-content-edit-row-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.3rem;
        }
        .jp-lesson-content-edit-complete {
          min-height: 2.25rem;
          padding: 0.35rem 0.4rem;
          border-radius: 7px;
          border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
          background: transparent;
          color: var(--accent);
          font: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .jp-lesson-content-edit-complete:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 14%, transparent);
        }
        .jp-lesson-content-edit-complete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-lesson-content-edit-delete {
          min-height: 2.25rem;
          padding: 0.35rem 0.4rem;
          border-radius: 7px;
          border: 1px solid color-mix(in srgb, #e85d6f 45%, var(--border));
          background: transparent;
          color: #e85d6f;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .jp-lesson-content-edit-delete:hover:not(:disabled) {
          background: color-mix(in srgb, #e85d6f 14%, transparent);
        }
        .jp-lesson-content-edit-delete:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .jp-lesson-content-edit-hint {
          margin: 0;
          color: var(--muted);
          font-size: 0.8rem;
          line-height: 1.45;
          font-weight: 400;
        }
        .jp-lesson-content-edit-error {
          margin: 0.65rem 0 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid color-mix(in srgb, #e85d6f 45%, var(--border));
          background: color-mix(in srgb, #e85d6f 12%, transparent);
          color: #e85d6f;
          font-size: 0.85rem;
          font-weight: 600;
          line-height: 1.45;
        }
        .jp-lesson-content-edit-progress {
          margin-top: 0.65rem;
        }
        .jp-lesson-content-edit-actions {
          flex-shrink: 0;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1.1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--border);
          background: color-mix(in srgb, var(--panel) 92%, var(--bg));
        }
        @media (max-width: 767px) {
          .jp-lesson-content-edit-overlay {
            align-items: flex-end;
            padding: 0;
          }
          .jp-lesson-content-edit-modal {
            width: 100%;
            max-height: min(94dvh, 900px);
            border-radius: 14px 14px 0 0;
          }
          .jp-lesson-content-edit-list-head {
            display: none;
          }
          .jp-lesson-content-edit-row {
            grid-template-columns: 1.5rem 1.6rem minmax(0, 1fr) auto;
            grid-template-areas:
              "check idx content actions"
              "check idx meaning actions";
            align-items: stretch;
            gap: 0.35rem 0.4rem;
            padding: 0.55rem 0.45rem;
          }
          .jp-lesson-content-edit-check {
            grid-area: check;
            align-self: start;
            padding-top: 0.55rem;
          }
          .jp-lesson-content-edit-idx {
            grid-area: idx;
            padding-top: 0.55rem;
          }
          .jp-lesson-content-edit-cell--content {
            grid-area: content;
          }
          .jp-lesson-content-edit-cell--meaning {
            grid-area: meaning;
          }
          .jp-lesson-content-edit-row-actions {
            grid-area: actions;
            flex-direction: column;
            align-items: stretch;
            align-self: center;
            min-width: 3.6rem;
          }
          .jp-lesson-content-edit-complete,
          .jp-lesson-content-edit-delete {
            width: 100%;
            min-width: 3.2rem;
          }
          .jp-lesson-content-edit-cell-label {
            display: block;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
