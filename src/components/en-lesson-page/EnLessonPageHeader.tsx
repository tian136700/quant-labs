"use client";

type Props = {
  canOperate: boolean;
  onAddClick: () => void;
};

/** 英语新课页标题行 + 简介（控编排页行数） */
export function EnLessonPageHeader({ canOperate, onAddClick }: Props) {
  return (
    <>
      <div
        className="en-lesson-page-title-row"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.65rem 0.85rem",
          marginBottom: "0.35rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>英语新课</h1>
        {canOperate ? (
          <button
            type="button"
            className="jp-lesson-action-btn jp-lesson-action-btn--primary"
            onClick={onAddClick}
          >
            新增
          </button>
        ) : null}
      </div>

      <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
        新课学习清单与教案管理。访客可浏览；登录用户可设置状态（未完成 / 上课中 / 上课完）。仅「上课完」会同步进入
        <a href="/en-vocab" style={{ color: "var(--accent)" }}>
          英语单词抽问
        </a>
        并带上教案链接。
      </p>
    </>
  );
}
