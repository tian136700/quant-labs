"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JpEditIconButton } from "@/components/JpEditIconButton";
import { TeacherReviewAuth } from "@/components/TeacherReviewAuth";
import { JpLessonAnnotateModal } from "@/components/JpLessonAnnotateModal";
import { JpVocabRefEditModal } from "@/components/JpVocabRefEditModal";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { formatBeijingDateTime } from "@/lib/format-datetime";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import {
  JP_LESSON_CACHE_KEY,
  parseJpLessonApi,
  type JpLessonApiPayload,
} from "@/lib/jp-api-cache";
import {
  getJpLessonProgressStatus,
  jpLessonProgressToFields,
  type JpLessonProgressStatus,
} from "@/lib/jp-lesson-shared";
import { fetchWithClientCache, readClientCache, writeClientCache } from "@/lib/client-swr-cache";
import { SITE_URL } from "@/lib/site";
import type { JpLessonNote, JpLessonRecord, JpVocabRef } from "@/lib/types";

function readLessonCache(): JpLessonApiPayload | null {
  return readClientCache<JpLessonApiPayload>(JP_LESSON_CACHE_KEY);
}

function persistLessonCache(
  lessons: JpLessonRecord[],
  refs: Record<string, JpVocabRef>,
  notes: JpLessonNote[]
) {
  writeClientCache(JP_LESSON_CACHE_KEY, { lessons, refs, notes });
}

function refUrl(refKey: string, download = false): string {
  const base = `/api/jp-vocab/ref/${encodeURIComponent(refKey)}`;
  return download ? `${base}?download=1` : base;
}

const LESSON_STATUS_SECTIONS: {
  status: JpLessonProgressStatus;
  title: string;
  emptyHint: string;
}[] = [
  { status: "learning", title: "学习中", emptyHint: "暂无学习中的新课" },
  { status: "pending", title: "未完成", emptyHint: "暂无未完成的新课" },
  { status: "completed", title: "已完成", emptyHint: "暂无已完成的新课" },
];

function sortLessonsWithinStatus(lessons: JpLessonRecord[]): JpLessonRecord[] {
  return [...lessons].sort((a, b) => {
    const dateCmp = b.uploaded_at.localeCompare(a.uploaded_at);
    if (dateCmp !== 0) return dateCmp;
    return b.id - a.id;
  });
}

function groupLessonsByStatus(
  lessons: JpLessonRecord[]
): Record<JpLessonProgressStatus, JpLessonRecord[]> {
  const groups: Record<JpLessonProgressStatus, JpLessonRecord[]> = {
    learning: [],
    pending: [],
    completed: [],
  };
  for (const lesson of lessons) {
    groups[getJpLessonProgressStatus(lesson)].push(lesson);
  }
  for (const status of Object.keys(groups) as JpLessonProgressStatus[]) {
    groups[status] = sortLessonsWithinStatus(groups[status]);
  }
  return groups;
}

function refFilename(refKey: string, ref?: JpVocabRef): string {
  const ext = ref?.media_type === "pdf" ? "pdf" : "png";
  return `${refKey}.${ext}`;
}

function lessonShareCopyText(
  lesson: JpLessonRecord,
  origin: string
): string {
  const link = lesson.ref_key
    ? `${origin}${refUrl(lesson.ref_key)}?id=${lesson.id}`
    : `${origin}/jp-lesson?id=${lesson.id}`;
  return `ID：${lesson.id}\n学习内容：${lesson.content}\n链接：${link}`;
}

export function JpLessonPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, logout, setUser } = useEtrAuth();
  const canOperate = canAccessJpVocab;
  const [showAuth, setShowAuth] = useState(false);
  const [lessons, setLessons] = useState<JpLessonRecord[]>(() => readLessonCache()?.lessons ?? []);
  const [notes, setNotes] = useState<JpLessonNote[]>(() => readLessonCache()?.notes ?? []);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>(() => readLessonCache()?.refs ?? {});
  const [loading, setLoading] = useState(() => readLessonCache() == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingLesson, setEditingLesson] = useState<JpLessonRecord | null>(null);
  const [annotatingLesson, setAnnotatingLesson] = useState<{
    lesson: JpLessonRecord;
    ref: JpVocabRef;
    viewUrl: string;
  } | null>(null);

  const applyLessonPayload = useCallback((payload: JpLessonApiPayload) => {
    setLessons(payload.lessons);
    setNotes(payload.notes);
    setRefs(payload.refs);
  }, []);

  const loadLessons = useCallback(async () => {
    const hasCache = readLessonCache() != null;
    if (hasCache) {
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
        { onCached: applyLessonPayload }
      );
      applyLessonPayload(payload);
    } catch (err) {
      if (!hasCache) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyLessonPayload]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const lessonsByStatus = useMemo(() => groupLessonsByStatus(lessons), [lessons]);

  const noteCountByLesson = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of notes) {
      map.set(note.lesson_id, (map.get(note.lesson_id) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  const copyLessonShare = async (lesson: JpLessonRecord) => {
    try {
      await navigator.clipboard.writeText(
        lessonShareCopyText(lesson, window.location.origin)
      );
      setCopiedId(lesson.id);
      window.setTimeout(() => setCopiedId(null), 1000);
    } catch {
      setStatus("复制失败，请手动选择复制");
    }
  };

  const downloadRef = async (refKey: string, ref?: JpVocabRef) => {
    if (downloadingKey === refKey) return;
    setDownloadingKey(refKey);
    setStatus("");
    try {
      const res = await fetch(refUrl(refKey, true), { credentials: "include" });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = refFilename(refKey, ref);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("教案已按原图下载");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "下载失败");
    } finally {
      setDownloadingKey(null);
    }
  };

  const setLessonProgress = async (
    lessonId: number,
    progressStatus: JpLessonProgressStatus
  ) => {
    if (!canOperate) {
      setShowAuth(true);
      return;
    }
    if (savingId === lessonId) return;

    const snapshot = lessons.find((l) => l.id === lessonId);
    const optimistic = jpLessonProgressToFields(progressStatus);
    setSavingId(lessonId);
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              completed: optimistic.completed,
              learning: optimistic.learning,
            }
          : l
      )
    );

    try {
      const res = await fetch("/api/jp-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        credentials: "include",
        body: JSON.stringify({ lesson_id: lessonId, progress_status: progressStatus }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        lesson?: JpLessonRecord;
        error?: string;
      };
      if (!data.ok || !data.lesson) {
        throw new Error(data.error || "保存失败");
      }
      setLessons((prev) => {
        const next = prev.map((l) => (l.id === data.lesson!.id ? data.lesson! : l));
        persistLessonCache(next, refs, notes);
        return next;
      });
    } catch (err) {
      if (snapshot) {
        setLessons((prev) =>
          prev.map((l) => (l.id === lessonId ? snapshot : l))
        );
      }
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const handleRefUpdated = (ref: JpVocabRef, lesson: JpLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, notes);
    setStatus("教案已更新，仅影响本条新课。");
    window.setTimeout(() => setStatus(""), 2500);
  };

  const handleAnnotateSaved = (ref: JpVocabRef, lesson: JpLessonRecord) => {
    const nextRefs = { ...refs, [ref.ref_key]: ref };
    const nextLessons = lessons.map((l) => (l.id === lesson.id ? lesson : l));
    setRefs(nextRefs);
    setLessons(nextLessons);
    persistLessonCache(nextLessons, nextRefs, notes);
    setAnnotatingLesson((prev) => {
      if (!prev || prev.lesson.id !== lesson.id) return prev;
      const viewUrl = `${refUrl(ref.ref_key)}?v=${encodeURIComponent(ref.updated_at)}`;
      return { lesson, ref, viewUrl };
    });
  };

  const editingRef = editingLesson?.ref_key ? refs[editingLesson.ref_key] : undefined;

  const renderLessonTable = (lessonList: JpLessonRecord[]) => (
    <div className="jp-lesson-table-wrap">
      <table className="compare-table etr-table jp-lesson-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>学习类型</th>
            <th>学习内容</th>
            <th className="jp-lesson-uploaded-col">上传日期</th>
            <th className="jp-lesson-status-at-col">最近操作</th>
            <th className="jp-lesson-operator-col">操作人</th>
            <th className="jp-lesson-complete-col">学习状态</th>
            <th className="jp-lesson-notes-col">课堂笔记</th>
            <th className="jp-lesson-actions-col">教案操作</th>
          </tr>
        </thead>
        <tbody>
          {lessonList.map((lesson) => {
            const ref = lesson.ref_key ? refs[lesson.ref_key] : undefined;
            const hasRef = Boolean(lesson.ref_key && ref);
            const viewUrl = lesson.ref_key
              ? `${refUrl(lesson.ref_key)}${
                  ref?.updated_at ? `?v=${encodeURIComponent(ref.updated_at)}` : ""
                }`
              : "";
            const noteCount = noteCountByLesson.get(lesson.id) ?? 0;
            const progressStatus = getJpLessonProgressStatus(lesson);

            return (
              <tr key={lesson.id}>
                <td data-label="ID" className="jp-lesson-id-col">
                  {lesson.id}
                </td>
                <td data-label="学习类型">
                  <span
                    className={`jp-lesson-kind${
                      lesson.kind === "grammar" ? " jp-lesson-kind--grammar" : ""
                    }`}
                  >
                    {lesson.kind === "grammar" ? "语法" : "单词"}
                  </span>
                </td>
                <td data-label="学习内容" className="jp-lesson-content-col">
                  {lesson.content}
                </td>
                <td data-label="上传日期" className="jp-lesson-uploaded-col">
                  {formatBeijingDateTime(lesson.uploaded_at)}
                </td>
                <td data-label="最近操作" className="jp-lesson-status-at-col">
                  {lesson.status_updated_at
                    ? formatBeijingDateTime(lesson.status_updated_at)
                    : "—"}
                </td>
                <td data-label="操作人" className="jp-lesson-operator-col">
                  {lesson.status_updated_by ?? "—"}
                </td>
                <td data-label="学习状态" className="jp-lesson-complete-col">
                  <div
                    className={`jp-lesson-complete-wrap${
                      progressStatus === "completed" ? " is-done" : ""
                    }${progressStatus === "learning" ? " is-learning" : ""}${
                      !canOperate ? " is-readonly" : ""
                    }${savingId === lesson.id ? " is-saving" : ""}`}
                  >
                    <select
                      className="jp-lesson-complete-select"
                      value={progressStatus}
                      disabled={!canOperate || savingId === lesson.id}
                      aria-label={`${lesson.content} 学习状态`}
                      onChange={(e) =>
                        void setLessonProgress(
                          lesson.id,
                          e.target.value as JpLessonProgressStatus
                        )
                      }
                    >
                      <option value="pending">未完成</option>
                      <option value="learning">学习中</option>
                      <option value="completed">已完成</option>
                    </select>
                  </div>
                </td>
                <td data-label="课堂笔记" className="jp-lesson-notes-col">
                  <a
                    href={`/jp-lesson/notes?id=${lesson.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-lesson-notes-btn"
                    title="在新标签页打开课堂笔记"
                  >
                    笔记
                    {noteCount > 0 ? (
                      <span className="jp-lesson-notes-count">{noteCount}</span>
                    ) : null}
                  </a>
                </td>
                <td data-label="教案操作" className="jp-lesson-actions-col">
                  {hasRef ? (
                    <div className="jp-lesson-actions">
                      <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jp-lesson-action-btn"
                      >
                        查看
                      </a>
                      {ref?.media_type === "image" ? (
                        <button
                          type="button"
                          className="jp-lesson-action-btn"
                          onClick={() =>
                            setAnnotatingLesson({ lesson, ref: ref!, viewUrl })
                          }
                        >
                          随手画
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="jp-lesson-action-btn"
                        disabled={downloadingKey === lesson.ref_key}
                        onClick={() => void downloadRef(lesson.ref_key!, ref)}
                      >
                        {downloadingKey === lesson.ref_key ? "下载中…" : "下载"}
                      </button>
                      <button
                        type="button"
                        className="jp-lesson-action-btn"
                        onClick={() => void copyLessonShare(lesson)}
                      >
                        {copiedId === lesson.id ? "已复制" : "复制"}
                      </button>
                      {canOperate ? (
                        <JpEditIconButton
                          title="编辑教案（弹窗）"
                          onClick={() => setEditingLesson(lesson)}
                        />
                      ) : null}
                    </div>
                  ) : canOperate ? (
                    <button
                      type="button"
                      className="jp-lesson-action-btn"
                      onClick={() => setEditingLesson(lesson)}
                    >
                      上传教案
                    </button>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="page-wrap jp-lesson-page" style={{ maxWidth: "min(1480px, 96vw)", paddingTop: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "0.35rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>日语新课</h1>
        {canOperate && user ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              {user.username} · {user.expires_hint}
            </span>
            <button type="button" className="btn-rsi-filter btn-rsi-filter--compact" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary"
            onClick={() => setShowAuth(true)}
            disabled={checking}
          >
            {checking ? "验证中…" : "登录后操作"}
          </button>
        )}
      </div>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；李老师 / 管理员登录后可设置学习状态（未完成 / 学习中 / 已完成）。仅「已完成」会同步进入
        <a href="/jp-vocab" style={{ color: "var(--accent)" }}>
          日语单词抽问
        </a>
        并带上教案链接。
      </p>

      {showAuth && !canOperate ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <TeacherReviewAuth
            loginOnly
            variant="inline"
            title="登录 · 日语新课"
            subtitle="使用 LiLaoshi 或管理员账号登录。"
            onClose={() => setShowAuth(false)}
            onAuthenticated={(next) => {
              setUser(next);
              setShowAuth(false);
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p className="empty" role="alert" style={{ color: "var(--rise)" }}>
          {error}
        </p>
      ) : null}

      {status ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>{status}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>加载中…</p>
      ) : !lessons.length ? (
        <section className="section etr-panel" aria-label="学习清单">
          <p style={{ color: "var(--muted)", margin: 0 }}>暂无新课，请通过 API 上传。</p>
        </section>
      ) : (
        <div className="jp-lesson-cards">
          {refreshing ? (
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.875rem",
                margin: "0 0 0.25rem",
              }}
            >
              同步中…
            </p>
          ) : null}
          {LESSON_STATUS_SECTIONS.map(({ status, title, emptyHint }) => {
            const sectionLessons = lessonsByStatus[status];
            return (
              <section
                key={status}
                className={`section etr-panel jp-lesson-status-card jp-lesson-status-card--${status}`}
                aria-label={`${title}新课`}
              >
                <div className="jp-lesson-status-card-head">
                  <h2 className="jp-lesson-status-card-title">{title}</h2>
                  <span className="jp-lesson-status-card-count">
                    {sectionLessons.length} 条
                  </span>
                </div>
                {sectionLessons.length ? (
                  renderLessonTable(sectionLessons)
                ) : (
                  <p className="jp-lesson-status-card-empty">{emptyHint}</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <JpVocabRefEditModal
        open={editingLesson != null}
        lessonId={editingLesson?.id ?? null}
        refKey={editingLesson?.ref_key ?? null}
        refMeta={editingRef}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingLesson(null)}
        onUpdated={handleRefUpdated}
        onNeedAuth={() => setShowAuth(true)}
      />

      <JpLessonAnnotateModal
        open={annotatingLesson != null}
        imageUrl={annotatingLesson?.viewUrl ?? ""}
        refKey={annotatingLesson?.lesson.ref_key ?? ""}
        lessonId={annotatingLesson?.lesson.id ?? 0}
        lessonContent={annotatingLesson?.lesson.content ?? ""}
        locale={locale}
        canSave={canOperate}
        onClose={() => setAnnotatingLesson(null)}
        onSaved={handleAnnotateSaved}
        onNeedAuth={() => setShowAuth(true)}
      />

      <details style={{ marginTop: "1.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>API 上传说明</summary>
        <p style={{ marginTop: "0.5rem" }}>
          固定链接：<code>{SITE_URL}/jp-lesson</code>
        </p>
        <p>
          上传接口：<code>POST /api/jp-lesson/upload</code>，Header{" "}
          <code>Authorization: Bearer &lt;JP_REVIEW_UPLOAD_TOKEN&gt;</code>
        </p>
        <pre
          style={{
            overflow: "auto",
            padding: "0.75rem",
            background: "var(--panel)",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            fontSize: "0.8125rem",
          }}
        >
{`curl -X POST "${SITE_URL}/api/jp-lesson/upload" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -F "kind=grammar" \\
  -F "content=～ばかり, ～ようになる, ～に来る" \\
  -F "media_type=image" \\
  -F "file=@lesson02.png"`}
        </pre>
        <p>
          <code>content</code> 中多个单词/语法用英文或中文逗号分隔。
          上传带 <code>file</code> 时，系统会自动生成教案标识（如 <code>lesson-4</code>）并绑定到该条新课，无需传 <code>ref_key</code>。
          上传后默认「未完成」；在列表中改为「已完成」后，会同步写入
          日语单词抽问并带上教案链接。
        </p>
      </details>

      <style jsx>{`
        :global(.page-wrap:has(.jp-lesson-page)) {
          max-width: min(1480px, 96vw);
        }
        .jp-lesson-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .jp-lesson-status-card {
          margin: 0;
        }
        .jp-lesson-status-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .jp-lesson-status-card-title {
          font-size: 1.375rem;
          font-weight: 600;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .jp-lesson-status-card-count {
          font-size: 0.8125rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .jp-lesson-status-card-empty {
          margin: 0;
          color: var(--muted);
          font-size: 0.875rem;
        }
        .jp-lesson-status-card--learning {
          border-left: 3px solid color-mix(in srgb, var(--accent) 70%, var(--border));
        }
        .jp-lesson-status-card--learning .jp-lesson-status-card-title {
          color: var(--accent);
        }
        .jp-lesson-status-card--pending {
          border-left: 3px solid var(--border);
        }
        .jp-lesson-status-card--completed {
          border-left: 3px solid color-mix(in srgb, var(--fall) 70%, var(--border));
        }
        .jp-lesson-status-card--completed .jp-lesson-status-card-title {
          color: var(--fall);
        }
        :global(.jp-lesson-table-wrap) {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        :global(.jp-lesson-table) {
          width: 100%;
          min-width: 640px;
        }
        :global(.jp-lesson-table th),
        :global(.jp-lesson-table td) {
          vertical-align: middle;
          padding: 0.6rem 0.75rem;
          white-space: normal;
        }
        :global(.jp-lesson-id-col) {
          width: 3.25rem;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
          text-align: center;
        }
        :global(.jp-lesson-uploaded-col),
        :global(.jp-lesson-status-at-col) {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 0.8125rem;
        }
        :global(.jp-lesson-operator-col) {
          white-space: nowrap;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        :global(.jp-lesson-actions-col) {
          text-align: center;
        }
        :global(.jp-lesson-notes-col) {
          text-align: center;
        }
        :global(.jp-lesson-notes-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
          text-decoration: none;
        }
        :global(.jp-lesson-notes-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
          text-decoration: none;
        }
        :global(.jp-lesson-notes-count) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.15rem;
          height: 1.15rem;
          padding: 0 0.25rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 18%, var(--panel));
          color: var(--accent);
          font-size: 0.6875rem;
          font-variant-numeric: tabular-nums;
        }
        :global(.jp-lesson-kind) {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          color: var(--muted);
        }
        :global(.jp-lesson-kind--grammar) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
          background: color-mix(in srgb, var(--accent) 10%, transparent);
        }
        :global(.jp-lesson-complete-col) {
          text-align: center;
        }
        :global(.jp-lesson-complete-wrap) {
          position: relative;
          display: inline-flex;
          align-items: center;
          margin: 0 auto;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          transition:
            border-color 0.15s ease,
            background 0.15s ease,
            box-shadow 0.15s ease;
        }
        :global(.jp-lesson-complete-wrap.is-done) {
          color: var(--fall);
          border-color: color-mix(in srgb, var(--fall) 50%, var(--border));
          background: color-mix(in srgb, var(--fall) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap.is-learning) {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
          background: color-mix(in srgb, var(--accent) 12%, var(--panel));
        }
        :global(.jp-lesson-complete-wrap:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        :global(.jp-lesson-complete-wrap.is-done:not(.is-readonly):not(.is-saving):hover) {
          border-color: color-mix(in srgb, var(--fall) 65%, var(--border));
          background: color-mix(in srgb, var(--fall) 16%, var(--panel));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fall) 22%, transparent);
        }
        :global(.jp-lesson-complete-wrap::after) {
          content: "";
          position: absolute;
          right: 0.55rem;
          top: 50%;
          width: 0.45rem;
          height: 0.45rem;
          border-right: 1.5px solid currentColor;
          border-bottom: 1.5px solid currentColor;
          transform: translateY(-65%) rotate(45deg);
          pointer-events: none;
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-readonly) {
          opacity: 0.72;
        }
        :global(.jp-lesson-complete-wrap.is-saving) {
          opacity: 0.55;
        }
        :global(.jp-lesson-complete-select) {
          display: block;
          min-height: 2rem;
          width: 6.5rem;
          min-width: 6.5rem;
          max-width: 100%;
          padding: 0.25rem 1.35rem 0.25rem 0.45rem;
          font-size: 0.8125rem;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
          text-align: center;
          text-align-last: center;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
        }
        :global(.jp-lesson-complete-select:focus-visible) {
          outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
          outline-offset: 1px;
        }
        :global(.jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-complete-wrap.is-readonly .jp-lesson-complete-select:disabled),
        :global(.jp-lesson-complete-wrap.is-saving .jp-lesson-complete-select:disabled) {
          cursor: not-allowed;
        }
        :global(.jp-lesson-actions) {
          display: inline-flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          justify-content: center;
        }
        :global(.jp-lesson-action-btn) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.8125rem;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--accent);
          text-decoration: none;
          cursor: pointer;
          font: inherit;
          line-height: 1.3;
        }
        :global(.jp-lesson-action-btn:hover) {
          background: color-mix(in srgb, var(--accent) 10%, var(--panel));
        }
        @media (max-width: 768px) {
          :global(.jp-lesson-table) {
            min-width: 0;
          }
          :global(.jp-lesson-table thead) {
            display: none;
          }
          :global(.jp-lesson-table tbody tr) {
            display: block;
            margin-bottom: 0.85rem;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--panel) 88%, var(--bg));
          }
          :global(.jp-lesson-table tbody td) {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.45rem 0;
            border: none;
            text-align: right;
          }
          :global(.jp-lesson-table tbody td::before) {
            content: attr(data-label);
            flex: 0 0 auto;
            max-width: 42%;
            font-size: 0.8125rem;
            color: var(--muted);
            text-align: left;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-actions-col) {
            justify-content: center;
            text-align: center;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-actions-col::before) {
            display: none;
          }
          :global(.jp-lesson-actions) {
            justify-content: center;
            width: 100%;
          }
          :global(.jp-lesson-action-btn) {
            min-height: var(--touch-min, 44px);
            flex: 1 1 auto;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-complete-col) {
            justify-content: center;
            text-align: center;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-complete-col::before) {
            display: none;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-notes-col) {
            justify-content: center;
            text-align: center;
          }
          :global(.jp-lesson-table tbody td.jp-lesson-notes-col::before) {
            display: none;
          }
          :global(.jp-lesson-notes-btn) {
            min-height: var(--touch-min, 44px);
            width: 100%;
            max-width: 8rem;
          }
          :global(.jp-lesson-complete-select) {
            min-height: var(--touch-min, 44px);
            width: 5.75rem;
            min-width: 5.75rem;
          }
        }
      `}</style>
    </main>
  );
}
