"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import { readApiJson } from "@/lib/api-json";
import { beijingDateString } from "@/lib/jp-vocab-daily-check";
import { jpVocabCoachLevelLabel } from "@/lib/jp-vocab-coach";
import type { JpVocabCoachBatchSummary, JpVocabCoachItem } from "@/lib/jp-vocab-coach-db";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import type { JpVocabLevel, JpVocabRef, JpVocabWord } from "@/lib/types";

export function JpVocabCoachPage() {
  const { locale } = useI18n();
  const { user, checking, openAuthPanel } = useEtrAuth();

  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== "undefined") {
      const date = new URLSearchParams(window.location.search).get("date");
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    }
    return beijingDateString();
  });
  const [batches, setBatches] = useState<JpVocabCoachBatchSummary[]>([]);
  const [items, setItems] = useState<JpVocabCoachItem[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [session, setSession] = useState<JpVocabTeacherQuizSession | null>(null);
  const [showFlashcard, setShowFlashcard] = useState(false);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/jp-vocab/coach", {
      headers: { [LOCALE_HEADER]: locale },
      credentials: "include",
      cache: "no-store",
    });
    const parsed = await readApiJson<{ ok: boolean; batches?: JpVocabCoachBatchSummary[]; error?: string }>(
      res
    );
    if (!parsed.ok || !parsed.data.ok) {
      throw new Error(parsed.ok ? parsed.data.error || "加载日期列表失败" : parsed.error);
    }
    setBatches(parsed.data.batches ?? []);
  }, [locale]);

  const loadDate = useCallback(
    async (date: string) => {
      const res = await fetch(`/api/jp-vocab/coach?date=${encodeURIComponent(date)}`, {
        headers: { [LOCALE_HEADER]: locale },
        credentials: "include",
        cache: "no-store",
      });
      const parsed = await readApiJson<{
        ok: boolean;
        items?: JpVocabCoachItem[];
        refs?: Record<string, JpVocabRef>;
        error?: string;
      }>(res);
      if (!parsed.ok || !parsed.data.ok) {
        throw new Error(parsed.ok ? parsed.data.error || "加载带读列表失败" : parsed.error);
      }
      setItems(parsed.data.items ?? []);
      setRefs(parsed.data.refs ?? {});
    },
    [locale]
  );

  const refresh = useCallback(async () => {
    await Promise.all([loadBatches(), loadDate(selectedDate)]);
  }, [loadBatches, loadDate, selectedDate]);

  useEffect(() => {
    if (checking) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await refresh();
        if (!cancelled) setStatus("");
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checking, user, refresh]);

  const wordsById = useMemo(
    () => new Map(items.map((item) => [item.word_id, item.word])),
    [items]
  );

  const wordIds = useMemo(() => items.map((item) => item.word_id), [items]);

  const dailySeqByWordId = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item, index) => {
      map.set(item.word_id, item.display_order || index + 1);
    });
    return map;
  }, [items]);

  const coachLevelByWordId = useMemo(() => {
    const map = new Map<number, JpVocabLevel>();
    items.forEach((item) => map.set(item.word_id, item.level));
    return map;
  }, [items]);

  const coachDisplayOrder = useMemo<JpVocabDailyDisplayOrder>(
    () => ({ date: selectedDate, ids: wordIds }),
    [selectedDate, wordIds]
  );

  const handleWordUpdated = useCallback((word: JpVocabWord) => {
    setItems((prev) =>
      prev.map((item) => (item.word_id === word.id ? { ...item, word } : item))
    );
  }, []);

  const startCoach = useCallback(
    (startIndex = 0) => {
      if (!wordIds.length) return;
      setSession({
        mode: "sequential",
        wordIds,
        currentIndex: Math.max(0, Math.min(startIndex, wordIds.length - 1)),
      });
      setShowFlashcard(true);
    },
    [wordIds]
  );

  if (checking) {
    return <p className="jp-vocab-coach-status">验证中…</p>;
  }

  if (!user) {
    return (
      <div className="jp-vocab-coach-gate">
        <h1>课堂带读</h1>
        <p>老师按日期查看「一般」「不熟悉」词条，带着学生逐条朗读；备注与日语抽问同步。</p>
        <button type="button" className="btn-rsi-filter btn-rsi-filter--primary" onClick={() => openAuthPanel({ mode: "login" })}>
          登录
        </button>
      </div>
    );
  }

  return (
    <div className="jp-vocab-coach-page">
      <header className="jp-vocab-coach-header">
        <div>
          <h1>课堂带读</h1>
          <p>
            从「日语抽问」导出今日未掌握词条后，在此按日期带读。熟悉程度为导出时快照，此处不可修改；备注与抽问页共用同一份数据。
          </p>
        </div>
        <Link href="/jp-vocab" className="btn-rsi-filter">
          返回日语抽问
        </Link>
      </header>

      <section className="jp-vocab-coach-toolbar card">
        <label className="jp-vocab-coach-date-field">
          <span>带读日期</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        {batches.length ? (
          <div className="jp-vocab-coach-date-chips" aria-label="已有带读日期">
            {batches.slice(0, 8).map((batch) => (
              <button
                key={batch.coach_date}
                type="button"
                className={
                  batch.coach_date === selectedDate
                    ? "btn-rsi-filter btn-rsi-filter--primary"
                    : "btn-rsi-filter"
                }
                onClick={() => setSelectedDate(batch.coach_date)}
              >
                {batch.coach_date}（{batch.item_count}）
              </button>
            ))}
          </div>
        ) : null}
        <div className="jp-vocab-coach-actions">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            disabled={!items.length}
            onClick={() => startCoach(0)}
          >
            开始带读
          </button>
          <button
            type="button"
            className="btn-rsi-filter"
            disabled={loading}
            onClick={() => void refresh().catch((err) => setStatus(String(err)))}
          >
            刷新
          </button>
        </div>
        <p className="jp-vocab-coach-summary">
          {selectedDate} 共 <strong>{items.length}</strong> 条
        </p>
      </section>

      {status ? <p className="jp-vocab-coach-status">{status}</p> : null}
      {loading ? <p className="jp-vocab-coach-status">加载中…</p> : null}

      <div className="jp-vocab-coach-table-wrap">
        <table className="jp-vocab-coach-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>单词 / 语法</th>
              <th>熟悉程度</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && !loading ? (
              <tr className="jp-vocab-coach-empty-row">
                <td colSpan={5} className="jp-vocab-coach-empty">
                  该日期暂无带读列表。请在「日语抽问」→ 导出 →「导出到课堂带读」。
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const w = item.word;
                const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
                return (
                  <tr key={item.word_id}>
                    <td data-label="序号" className="jp-vocab-coach-seq-col">
                      {index + 1}
                    </td>
                    <td data-label="单词 / 语法" className="jp-vocab-coach-word-col">
                      <span className="jp-vocab-coach-word">{w.word}</span>
                      {w.reading ? (
                        <span className="jp-vocab-coach-reading">{w.reading}</span>
                      ) : null}
                    </td>
                    <td data-label="熟悉程度" className="jp-vocab-coach-level-col">
                      <span className="jp-vocab-coach-level">{jpVocabCoachLevelLabel(item.level)}</span>
                    </td>
                    <td data-label="备注" className="jp-vocab-coach-notes-col">
                      {hasNotes ? "有备注" : "—"}
                    </td>
                    <td data-label="操作" className="jp-vocab-coach-action-col">
                      <button
                        type="button"
                        className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-coach-action-btn"
                        onClick={() => startCoach(index)}
                      >
                        带读
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <JpVocabTeacherQuizFlashcardModal
        open={showFlashcard}
        mode="coach"
        session={session}
        wordsById={wordsById}
        refs={refs}
        locale={locale}
        displayOrder={coachDisplayOrder}
        sessionLevel={{}}
        reviewLockedByWordId={{}}
        savingWordId={null}
        dailySeqByWordId={dailySeqByWordId}
        coachLevelByWordId={coachLevelByWordId}
        canOperate
        shareUiEnabled={false}
        onClose={() => setShowFlashcard(false)}
        onComplete={() => setShowFlashcard(false)}
        onSelectLevel={() => {}}
        onNavigate={(index) => {
          setSession((prev) => (prev ? { ...prev, currentIndex: index } : prev));
        }}
        onOpenRef={(refKey, ref) => {
          setPreviewRef({
            ref: resolveJpVocabRefForPreview(refKey, refs, ref),
            cacheVersion: ref?.updated_at ?? null,
          });
        }}
        onViewRemarks={setViewingRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onWordUpdated={handleWordUpdated}
        nestedModalOpen={
          previewRef != null || editingRemarksWord != null || viewingRemarksWord != null
        }
      />

      <JpVocabRemarksViewModal
        open={viewingRemarksWord != null}
        word={viewingRemarksWord}
        canDelete
        onClose={() => setViewingRemarksWord(null)}
        onWordUpdated={handleWordUpdated}
        onSaveFailed={(_id, _snapshot, message) => setStatus(message)}
        onNeedAuth={() => openAuthPanel({ mode: "login" })}
      />

      <JpClassNotesEditModal
        open={editingRemarksWord != null}
        word={editingRemarksWord}
        locale={locale}
        canEdit
        onClose={() => setEditingRemarksWord(null)}
        onSaved={handleWordUpdated}
        onSaveFailed={(_id, _snapshot, message) => setStatus(message)}
        onNeedAuth={() => openAuthPanel({ mode: "login" })}
      />

      <JpVocabRefPreviewModal
        open={previewRef != null}
        refMeta={previewRef?.ref ?? null}
        cacheVersion={previewRef?.cacheVersion}
        onClose={() => setPreviewRef(null)}
      />

      <MobileScrollToTopButton />

      <style jsx>{`
        .jp-vocab-coach-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .jp-vocab-coach-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .jp-vocab-coach-header h1 {
          margin: 0 0 0.35rem;
        }
        .jp-vocab-coach-header p {
          margin: 0;
          color: var(--muted);
          max-width: 42rem;
          line-height: 1.5;
        }
        .jp-vocab-coach-toolbar {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem;
        }
        .jp-vocab-coach-date-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          max-width: 14rem;
        }
        .jp-vocab-coach-date-field input {
          padding: 0.45rem 0.55rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
        }
        .jp-vocab-coach-date-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .jp-vocab-coach-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .jp-vocab-coach-summary {
          margin: 0;
          color: var(--muted);
        }
        .jp-vocab-coach-status {
          margin: 0;
          color: var(--muted);
        }
        .jp-vocab-coach-table-wrap {
          overflow-x: auto;
        }
        .jp-vocab-coach-table {
          width: 100%;
          border-collapse: collapse;
        }
        .jp-vocab-coach-table th,
        .jp-vocab-coach-table td {
          border-bottom: 1px solid var(--border);
          padding: 0.65rem 0.5rem;
          text-align: left;
          vertical-align: top;
        }
        .jp-vocab-coach-word {
          display: block;
          font-weight: 600;
        }
        .jp-vocab-coach-reading {
          display: block;
          color: var(--muted);
          font-size: 0.88rem;
        }
        .jp-vocab-coach-level {
          display: inline-block;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          background: rgba(255, 152, 60, 0.14);
          font-size: 0.85rem;
        }
        .jp-vocab-coach-empty {
          text-align: center;
          color: var(--muted);
          padding: 1.5rem 0.5rem;
        }
        .jp-vocab-coach-gate {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-width: 28rem;
        }
        .jp-vocab-coach-action-btn {
          min-width: 4.5rem;
        }
        @media (max-width: 768px) {
          .jp-vocab-coach-header {
            flex-direction: column;
            align-items: stretch;
          }
          .jp-vocab-coach-header :global(.btn-rsi-filter) {
            width: 100%;
            min-height: 2.75rem;
          }
          .jp-vocab-coach-date-field {
            max-width: none;
          }
          .jp-vocab-coach-date-field input {
            min-height: 2.75rem;
            font-size: 1rem;
          }
          .jp-vocab-coach-date-chips :global(.btn-rsi-filter) {
            min-height: 2.5rem;
            font-size: clamp(0.8125rem, 3vw, 0.875rem);
          }
          .jp-vocab-coach-actions {
            flex-direction: column;
          }
          .jp-vocab-coach-actions :global(.btn-rsi-filter) {
            width: 100%;
            min-height: 2.75rem;
          }
          .jp-vocab-coach-table-wrap {
            overflow-x: visible;
          }
          .jp-vocab-coach-table {
            min-width: 0;
          }
          .jp-vocab-coach-table thead {
            display: none;
          }
          .jp-vocab-coach-table tbody tr {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem 0.75rem;
            margin-bottom: 0.625rem;
            padding: 0.875rem 1rem;
            border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
            border-radius: 15px;
            background: color-mix(in srgb, var(--panel) 94%, var(--bg));
          }
          .jp-vocab-coach-table tbody td {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 0.25rem;
            padding: 0;
            border: none;
            text-align: left;
            line-height: 1.35;
            min-width: 0;
          }
          .jp-vocab-coach-table tbody td::before {
            content: attr(data-label) "：";
            flex: 0 0 auto;
            font-size: clamp(0.8125rem, 3.2vw, 0.9375rem);
            font-weight: 400;
            color: var(--muted);
            white-space: nowrap;
          }
          .jp-vocab-coach-word-col {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.2rem;
            padding-bottom: 0.5rem;
            margin-bottom: 0.125rem;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
          }
          .jp-vocab-coach-word-col::before {
            display: none;
          }
          .jp-vocab-coach-word {
            font-size: clamp(1.35rem, 6vw, 1.65rem);
            line-height: 1.2;
          }
          .jp-vocab-coach-reading {
            font-size: clamp(0.875rem, 3.5vw, 1rem);
          }
          .jp-vocab-coach-seq-col {
            grid-column: 1;
          }
          .jp-vocab-coach-level-col {
            grid-column: 2;
          }
          .jp-vocab-coach-notes-col {
            grid-column: 1;
          }
          .jp-vocab-coach-action-col {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: stretch;
            padding-top: 0.25rem;
          }
          .jp-vocab-coach-action-col::before {
            display: none;
          }
          .jp-vocab-coach-action-btn {
            width: 100%;
            min-height: 2.75rem;
            font-size: clamp(0.8125rem, 3vw, 0.875rem);
            border-radius: 10px;
          }
          .jp-vocab-coach-table tbody tr.jp-vocab-coach-empty-row {
            display: block;
            padding: 1rem;
          }
          .jp-vocab-coach-table tbody tr.jp-vocab-coach-empty-row td {
            display: block;
          }
          .jp-vocab-coach-empty {
            display: block;
            grid-column: 1 / -1;
            padding: 1rem 0.25rem;
            font-size: 0.9rem;
            line-height: 1.5;
          }
          .jp-vocab-coach-empty::before {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
