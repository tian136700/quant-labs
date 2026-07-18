"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEtrAuth } from "@/contexts/EtrAuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { JpClassNotesEditModal } from "@/components/JpClassNotesEditModal";
import { JpVocabEditModal } from "@/components/JpVocabEditModal";
import { JpVocabExampleSentencesCell } from "@/components/JpVocabExampleSentencesCell";
import { JpVocabRemarksViewModal } from "@/components/JpVocabRemarksViewModal";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import { JpVocabRefPreviewModal } from "@/components/JpVocabRefPreviewModal";
import { MobileScrollToTopButton } from "@/components/MobileScrollToTopButton";
import { readApiJson } from "@/lib/api-json";
import {
  jpVocabCoachLevelLabel,
  jpVocabCoachStatusLabel,
  markJpVocabCoachCoachedClient,
} from "@/lib/jp-vocab-coach";
import type { JpVocabCoachItem, JpVocabCoachQueueSummary } from "@/lib/jp-vocab-coach-db";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import { resolveJpVocabRefForPreview } from "@/lib/jp-vocab-ref-shared";
import { LOCALE_HEADER } from "@/lib/locale-detect";
import { hasJpVocabClassNotes } from "@/lib/jp-vocab-class-notes";
import type { JpVocabRef, JpVocabWord } from "@/lib/types";

export function JpVocabCoachPage() {
  const { locale } = useI18n();
  const { user, checking, canAccessJpVocab, canAccessJpVocabCoach, openAuthPanel } = useEtrAuth();
  const canOperate = canAccessJpVocab;

  const [items, setItems] = useState<JpVocabCoachItem[]>([]);
  const [refs, setRefs] = useState<Record<string, JpVocabRef>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [session, setSession] = useState<JpVocabTeacherQuizSession | null>(null);
  const [showFlashcard, setShowFlashcard] = useState(false);
  const [cardPreviewWordId, setCardPreviewWordId] = useState<number | null>(null);
  const [viewingRemarksWord, setViewingRemarksWord] = useState<JpVocabWord | null>(null);
  const [previewRef, setPreviewRef] = useState<{
    ref: JpVocabRef;
    cacheVersion?: string | null;
  } | null>(null);
  const [editingRemarksWord, setEditingRemarksWord] = useState<JpVocabWord | null>(null);
  const [editingWord, setEditingWord] = useState<JpVocabWord | null>(null);

  const summary = useMemo<JpVocabCoachQueueSummary>(() => {
    const pending_count = items.filter((i) => !i.coached_at).length;
    return {
      total: items.length,
      pending_count,
      done_count: items.length - pending_count,
    };
  }, [items]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/jp-vocab/coach", {
      headers: { [LOCALE_HEADER]: locale },
      credentials: "include",
      cache: "no-store",
    });
    const parsed = await readApiJson<{
      ok: boolean;
      items?: JpVocabCoachItem[];
      refs?: Record<string, JpVocabRef>;
      summary?: JpVocabCoachQueueSummary;
      error?: string;
    }>(res);
    if (!parsed.ok || !parsed.data.ok) {
      throw new Error(parsed.ok ? parsed.data.error || "加载带读列表失败" : parsed.error);
    }
    setItems(parsed.data.items ?? []);
    setRefs(parsed.data.refs ?? {});
  }, [locale]);

  useEffect(() => {
    if (checking) return;
    if (!user || !canAccessJpVocabCoach) {
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
  }, [checking, user, canAccessJpVocabCoach, refresh]);

  const wordsById = useMemo(
    () => new Map(items.map((item) => [item.word_id, item.word])),
    [items]
  );

  const pendingItems = useMemo(
    () => items.filter((item) => !item.coached_at),
    [items]
  );

  const pendingWordIds = useMemo(
    () => pendingItems.map((item) => item.word_id),
    [pendingItems]
  );

  const dailySeqByWordId = useMemo(() => {
    const map = new Map<number, number>();
    pendingItems.forEach((item, index) => {
      map.set(item.word_id, index + 1);
    });
    return map;
  }, [pendingItems]);

  const coachLevelByWordId = useMemo(() => {
    const map = new Map<number, JpVocabLevel>();
    items.forEach((item) => map.set(item.word_id, item.level));
    return map;
  }, [items]);

  const coachDisplayOrder = useMemo<JpVocabDailyDisplayOrder>(
    () => ({ date: "coach-queue", ids: pendingWordIds }),
    [pendingWordIds]
  );

  const handleWordUpdated = useCallback((word: JpVocabWord) => {
    setItems((prev) =>
      prev.map((item) => (item.word_id === word.id ? { ...item, word } : item))
    );
  }, []);

  const markCoachedLocal = useCallback((wordId: number) => {
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    setItems((prev) => {
      const target = prev.find((i) => i.word_id === wordId);
      if (!target || target.coached_at) return prev;
      return prev.map((item) =>
        item.word_id === wordId
          ? { ...item, coached_at: ts, updated_at: ts }
          : item
      );
    });
  }, []);

  const handleMarkCoached = useCallback(
    async (wordId: number) => {
      markCoachedLocal(wordId);
      try {
        await markJpVocabCoachCoachedClient(locale, [wordId]);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        await refresh().catch(() => {});
      }
    },
    [locale, markCoachedLocal, refresh]
  );

  const startCoach = useCallback(
    (startWordId?: number) => {
      if (!pendingWordIds.length) return;
      let startIndex = 0;
      if (startWordId != null) {
        const idx = pendingWordIds.indexOf(startWordId);
        if (idx >= 0) startIndex = idx;
      }
      setCardPreviewWordId(null);
      setSession({
        mode: "sequential",
        wordIds: pendingWordIds,
        currentIndex: startIndex,
      });
      setShowFlashcard(true);
    },
    [pendingWordIds]
  );

  const cardPreviewSession = useMemo((): JpVocabTeacherQuizSession | null => {
    if (cardPreviewWordId == null) return null;
    if (!wordsById.has(cardPreviewWordId)) return null;
    return {
      mode: "sequential",
      wordIds: [cardPreviewWordId],
      currentIndex: 0,
    };
  }, [cardPreviewWordId, wordsById]);

  const cardPreviewDailySeqByWordId = useMemo(() => {
    if (cardPreviewWordId == null) return dailySeqByWordId;
    const pendingSeq = dailySeqByWordId.get(cardPreviewWordId);
    if (pendingSeq != null) return dailySeqByWordId;
    const map = new Map(dailySeqByWordId);
    const idx = items.findIndex((item) => item.word_id === cardPreviewWordId);
    if (idx >= 0) map.set(cardPreviewWordId, idx + 1);
    return map;
  }, [cardPreviewWordId, dailySeqByWordId, items]);

  const openCoachCardPreview = useCallback((wordId: number) => {
    setShowFlashcard(false);
    setSession(null);
    setCardPreviewWordId(wordId);
  }, []);

  const closeCoachCardPreview = useCallback(() => {
    setCardPreviewWordId(null);
  }, []);

  if (checking) {
    return <p className="jp-vocab-coach-status">验证中…</p>;
  }

  if (!user) {
    return (
      <div className="jp-vocab-coach-gate">
        <h1>课堂带读</h1>
        <p>
          老师带着学生朗读「一般」「不熟悉」词条。抽问完成后自动合并进本页队列；备注与日语抽问同步。
        </p>
        <button type="button" className="btn-rsi-filter btn-rsi-filter--primary" onClick={() => openAuthPanel({ mode: "login" })}>
          登录
        </button>
      </div>
    );
  }

  if (!canAccessJpVocabCoach) {
    return (
      <div className="jp-vocab-coach-gate">
        <h1>课堂带读</h1>
        <p>当前账号暂无课堂带读权限。需要带读时请使用已授权账号（如欣欣）登录。</p>
        <Link href="/jp-vocab" className="btn-rsi-filter">
          返回日语抽问
        </Link>
      </div>
    );
  }

  return (
    <div className="jp-vocab-coach-page">
      <header className="jp-vocab-coach-header">
        <div>
          <h1>课堂带读</h1>
          <p>
            抽问完成时，「一般」「不熟悉」会一次性写入课堂带读队列（与未带读去重；已带读不再拉回）。带读卡片与抽问卡片同 UI，熟悉程度只展示不可勾选；可编辑词条与备注（与日语抽问共用记录）。已带读会在北京时间次日凌晨自动清空，未带读会一直保留。
          </p>
        </div>
        <Link href="/jp-vocab" className="btn-rsi-filter">
          返回日语抽问
        </Link>
      </header>

      <section className="jp-vocab-coach-toolbar card">
        <div className="jp-vocab-coach-actions">
          <button
            type="button"
            className="btn-rsi-filter btn-rsi-filter--primary"
            disabled={!pendingWordIds.length}
            onClick={() => startCoach()}
          >
            开始带读
            {pendingWordIds.length ? `（${pendingWordIds.length}）` : ""}
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
          共 <strong>{summary.total}</strong> 条 · 未带读{" "}
          <strong>{summary.pending_count}</strong> · 已带读{" "}
          <strong>{summary.done_count}</strong>
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
              <th>例句</th>
              <th>熟悉程度</th>
              <th>带读状态</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && !loading ? (
              <tr className="jp-vocab-coach-empty-row">
                <td colSpan={7} className="jp-vocab-coach-empty">
                  暂无带读列表。请在「日语抽问」抽完后进入课堂带读，或使用导出 →「导出到课堂带读」。
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const w = item.word;
                const hasNotes = hasJpVocabClassNotes(w.class_notes, w.class_notes_present);
                const done = Boolean(item.coached_at);
                return (
                  <tr
                    key={item.word_id}
                    className={done ? "jp-vocab-coach-row--done" : undefined}
                  >
                    <td data-label="序号" className="jp-vocab-coach-seq-col">
                      {index + 1}
                    </td>
                    <td data-label="单词 / 语法" className="jp-vocab-coach-word-col">
                      <span className="jp-vocab-coach-word">{w.word}</span>
                      {w.reading ? (
                        <span className="jp-vocab-coach-reading">{w.reading}</span>
                      ) : null}
                    </td>
                    <td data-label="例句" className="jp-vocab-coach-example-col">
                      <JpVocabExampleSentencesCell text={w.example_sentences} />
                    </td>
                    <td data-label="熟悉程度" className="jp-vocab-coach-level-col">
                      <span className="jp-vocab-coach-level">
                        {jpVocabCoachLevelLabel(item.level)}
                      </span>
                    </td>
                    <td data-label="带读状态" className="jp-vocab-coach-status-col">
                      <span
                        className={
                          done
                            ? "jp-vocab-coach-badge jp-vocab-coach-badge--done"
                            : "jp-vocab-coach-badge jp-vocab-coach-badge--pending"
                        }
                      >
                        {jpVocabCoachStatusLabel(item.coached_at)}
                      </span>
                    </td>
                    <td data-label="备注" className="jp-vocab-coach-notes-col">
                      {hasNotes ? "有备注" : "—"}
                    </td>
                    <td data-label="操作" className="jp-vocab-coach-action-col">
                      <div className="jp-vocab-coach-action-btns">
                        <button
                          type="button"
                          className="btn-rsi-filter btn-rsi-filter--compact jp-vocab-coach-action-btn"
                          title="以课堂带读卡片样式预览本词条（熟悉程度不可勾选）"
                          onClick={() => openCoachCardPreview(item.word_id)}
                        >
                          查看该带读卡片
                        </button>
                        {done ? null : (
                          <button
                            type="button"
                            className="btn-rsi-filter btn-rsi-filter--compact btn-rsi-filter--primary jp-vocab-coach-action-btn"
                            onClick={() => startCoach(item.word_id)}
                          >
                            带读
                          </button>
                        )}
                      </div>
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
        canOperate={canOperate}
        shareUiEnabled={false}
        onClose={() => setShowFlashcard(false)}
        onComplete={() => setShowFlashcard(false)}
        onSelectLevel={() => {
          /* 带读卡片熟悉程度只读 */
        }}
        onMarkCoached={(wordId) => void handleMarkCoached(wordId)}
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
        onEditWord={canOperate ? setEditingWord : undefined}
        onWordUpdated={handleWordUpdated}
        nestedModalOpen={
          previewRef != null ||
          editingRemarksWord != null ||
          viewingRemarksWord != null ||
          editingWord != null
        }
      />

      <JpVocabTeacherQuizFlashcardModal
        open={cardPreviewSession != null}
        mode="coach"
        previewMode
        session={cardPreviewSession}
        wordsById={wordsById}
        refs={refs}
        locale={locale}
        displayOrder={coachDisplayOrder}
        sessionLevel={{}}
        reviewLockedByWordId={{}}
        savingWordId={null}
        dailySeqByWordId={cardPreviewDailySeqByWordId}
        coachLevelByWordId={coachLevelByWordId}
        canOperate={canOperate}
        shareUiEnabled={false}
        onClose={closeCoachCardPreview}
        onComplete={closeCoachCardPreview}
        onSelectLevel={() => {
          /* 预览只读 */
        }}
        onNavigate={() => {
          /* 单条预览 */
        }}
        onOpenRef={(refKey, ref) => {
          setPreviewRef({
            ref: resolveJpVocabRefForPreview(refKey, refs, ref),
            cacheVersion: ref?.updated_at ?? null,
          });
        }}
        onViewRemarks={setViewingRemarksWord}
        onEditRemarks={setEditingRemarksWord}
        onEditWord={canOperate ? setEditingWord : undefined}
        onWordUpdated={handleWordUpdated}
        nestedModalOpen={
          previewRef != null ||
          editingRemarksWord != null ||
          viewingRemarksWord != null ||
          editingWord != null
        }
      />

      <JpVocabEditModal
        open={editingWord != null}
        word={editingWord}
        refs={refs}
        locale={locale}
        canEdit={canOperate}
        onClose={() => setEditingWord(null)}
        onSaved={handleWordUpdated}
        onRefUpdated={(ref) => {
          setRefs((prev) => ({ ...prev, [ref.ref_key]: ref }));
        }}
        onSaveFailed={(_id, _snapshot, message) => setStatus(message)}
        onNeedAuth={() => openAuthPanel({ mode: "login" })}
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
        sharePromptOnSave={showFlashcard}
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
        .jp-vocab-coach-row--done {
          opacity: 0.72;
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
        .jp-vocab-coach-example-col {
          max-width: 14rem;
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .jp-vocab-coach-example-col :global(.jp-vocab-example-sentences-block + .jp-vocab-example-sentences-block) {
          margin-top: 0.35rem;
        }
        .jp-vocab-coach-example-col :global(.jp-vocab-example-sentences-line) {
          word-break: break-all;
        }
        .jp-vocab-coach-example-col :global(.jp-vocab-example-sentences-empty) {
          color: var(--muted);
        }
        .jp-vocab-coach-level {
          display: inline-block;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          background: rgba(255, 152, 60, 0.14);
          font-size: 0.85rem;
        }
        .jp-vocab-coach-badge {
          display: inline-block;
          padding: 0.15rem 0.45rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .jp-vocab-coach-badge--pending {
          background: color-mix(in srgb, var(--accent) 16%, transparent);
          color: var(--accent);
        }
        .jp-vocab-coach-badge--done {
          background: color-mix(in srgb, var(--fall) 14%, transparent);
          color: var(--fall);
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
        .jp-vocab-coach-action-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
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
          .jp-vocab-coach-example-col {
            grid-column: 1 / -1;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.15rem;
            padding-bottom: 0.5rem;
            margin-bottom: 0.125rem;
            border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
            max-width: none;
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
          .jp-vocab-coach-status-col {
            grid-column: 1;
          }
          .jp-vocab-coach-notes-col {
            grid-column: 2;
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
          .jp-vocab-coach-action-btns {
            flex-direction: column;
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
