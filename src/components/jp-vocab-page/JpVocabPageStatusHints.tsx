"use client";

type Props = {
  status: string;
  saveQueuePending: number;
};

export function JpVocabPageStatusHints({ status, saveQueuePending }: Props) {
  return (
    <>
      {status ? (
        <p
          style={{
            color: "var(--muted)",
            fontSize: "0.875rem",
            marginBottom: "0.75rem",
          }}
        >
          {status}
        </p>
      ) : null}

      {saveQueuePending > 0 ? (
        <p
          className="jp-vocab-save-queue-hint"
          role="status"
          style={{
            color: "var(--muted)",
            fontSize: "0.8125rem",
            marginBottom: "0.75rem",
          }}
        >
          后台同步队列 {saveQueuePending} 项 · 逐项写入数据库，避免免费服务器拥堵
        </p>
      ) : null}
    </>
  );
}
