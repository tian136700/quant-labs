"use client";

import { useMemo, useState } from "react";
import { JpVocabTeacherQuizFlashcardModal } from "@/components/JpVocabTeacherQuizFlashcardModal";
import type { JpVocabTeacherQuizSession } from "@/lib/jp-vocab-teacher-quiz";
import type { JpVocabDailyDisplayOrder } from "@/lib/jp-vocab-daily-order";
import type { JpVocabLevel, JpVocabWord } from "@/lib/types";

const WORD_ID = 571;

const MOCK_WORD_571: JpVocabWord = {
  id: WORD_ID,
  word: "～と思います",
  reading: "～とおもいます",
  meaning: "我想……；我认为……；（对情况）推测……",
  pos: "语法",
  kind: "grammar",
  ref_key: null,
  cnt_very: 0,
  cnt_normal: 2,
  cnt_weak: 1,
  today_check_count: 0,
  today_check_date: null,
  class_notes: "用于表达自己的判断、想法，注意名词和二类形容词前要接「だ」。",
  usage: [
    "1. [口语9|考试8] 表示说话人的意见或想法，相当于「我认为……」「我想……」。",
    "2. [口语8|考试8] 推测将发生的一般情况。",
    "3. [口语8|考试8] 推测已经发生的事情。",
    "4. [口语7|考试8] 推测性质或状态（名词/形容词谓语）。",
    "5. [口语7|考试7] 推测否定内容。",
  ].join("\n"),
  usage_source: "Agent现写",
  connection: [
    "用法1: 名词＋だ＋と思います｜推测是某事物",
    "用法2: 二类形容词＋だ＋と思います｜推测性质或状态",
    "用法3: 一类形容词普通形＋と思います｜推测性质或状态",
    "用法4: 动词辞書形（动词原形）＋と思います｜推测将发生一般情况",
    "用法5: 动词た形＋と思います｜推测已经发生的事",
    "用法6: 动词ない形／动词なかった形＋と思います｜推测否定内容",
  ].join("\n"),
  connection_source: "Agent现写",
  example_sentences: [
    "私(わたし)は、この案(あん)がいいと思(おも)います。",
    "译文：我觉得这个方案不错。",
    "明日(あした)は雨(あめ)が降(ふ)ると思(おも)います。",
    "译文：我觉得明天会下雨。",
    "彼(かれ)はもう家(いえ)に帰(かえ)ったと思(おも)います。",
    "译文：我觉得他已经回家了。",
    "この部屋(へや)は静(しず)かだと思(おも)います。",
    "译文：我觉得这个房间很安静。",
    "今日(きょう)は忙(いそが)しくないと思(おも)います。",
    "译文：我觉得今天不忙。",
  ].join("\n"),
  example_sentences_source: "Agent现写",
  related_compounds: null,
  related_compounds_source: null,
  meaning_source: "Agent现写",
  pos_source: "Agent现写",
  reading_source: "Agent现写",
  last_review_level: null,
  last_review_at: null,
  srs_interval_days: 1,
  srs_due_date: null,
  last_usage_levels: null,
  created_at: "2026-08-06 00:00:00",
  updated_at: "2026-08-06 00:00:00",
};

export default function Page() {
  const [open, setOpen] = useState(true);
  const [sessionLevel, setSessionLevel] = useState<
    Record<number, JpVocabLevel | undefined>
  >({});

  const wordsById = useMemo(
    () => new Map<number, JpVocabWord>([[WORD_ID, MOCK_WORD_571]]),
    []
  );
  const session: JpVocabTeacherQuizSession = {
    mode: "random",
    wordIds: [WORD_ID],
    currentIndex: 0,
  };
  const displayOrder: JpVocabDailyDisplayOrder = {
    date: "2026-08-06",
    ids: [WORD_ID],
    round_checked_ids: [],
  };
  const dailySeqByWordId = useMemo(
    () => new Map<number, number>([[WORD_ID, 1]]),
    []
  );

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>本地预览：老师端抽查卡（ID 571）</h2>
      <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
        这个页面为本地免登录调试页，直接复用老师端抽查卡片组件。
      </p>
      {!open ? (
        <button
          type="button"
          className="btn-rsi-filter btn-rsi-filter--primary"
          style={{ marginTop: 12 }}
          onClick={() => setOpen(true)}
        >
          重新打开卡片
        </button>
      ) : null}

      <JpVocabTeacherQuizFlashcardModal
        open={open}
        session={session}
        wordsById={wordsById}
        refs={{}}
        locale="zh"
        displayOrder={displayOrder}
        sessionLevel={sessionLevel}
        reviewLockedByWordId={{}}
        savingWordId={null}
        dailySeqByWordId={dailySeqByWordId}
        canOperate={false}
        onClose={() => setOpen(false)}
        onComplete={() => setOpen(false)}
        onSelectLevel={(wordId, level) =>
          setSessionLevel((prev) => ({ ...prev, [wordId]: level }))
        }
        onNavigate={() => undefined}
        onOpenRef={() => undefined}
        onViewRemarks={() => undefined}
      />
    </div>
  );
}

