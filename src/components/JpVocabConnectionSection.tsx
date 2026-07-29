"use client";

import { JpVocabSourceLabel } from "@/components/JpVocabSourceLabel";
import { hasJpVocabConnection } from "@/lib/jp-vocab-connection-ai";

type Props = {
  connection: string | null | undefined;
  connectionSource?: string | null;
  emptyText?: string;
  /** 无内容时是否仍渲染区块（编辑预览用） */
  showWhenEmpty?: boolean;
};

/** 抽问卡：用法/例句下方的「接序」模块 */
export function JpVocabConnectionSection({
  connection,
  connectionSource,
  emptyText = "暂无接序",
  showWhenEmpty = false,
}: Props) {
  const text = String(connection ?? "").trim();
  const has = hasJpVocabConnection(text);
  if (!has && !showWhenEmpty) return null;

  return (
    <section
      className="jp-vocab-teacher-quiz__connection"
      aria-label="接序"
    >
      <div className="jp-vocab-teacher-quiz__connection-head">
        <h3 className="jp-vocab-teacher-quiz__connection-title">接序</h3>
      </div>
      <div className="jp-vocab-teacher-quiz__connection-body">
        {has ? (
          <pre className="jp-vocab-teacher-quiz__connection-text">{text}</pre>
        ) : (
          <p className="jp-vocab-teacher-quiz__connection-empty">{emptyText}</p>
        )}
        {connectionSource?.trim() ? (
          <JpVocabSourceLabel source={connectionSource.trim()} />
        ) : null}
      </div>
    </section>
  );
}
