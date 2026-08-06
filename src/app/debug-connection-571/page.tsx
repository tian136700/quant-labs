import { JpVocabConnectionBody } from "@/components/JpVocabConnectionBody";

const CONNECTION_571_RAW = [
  "用法1: 名词＋だ＋と思います｜推测是某事物",
  "用法2: 二类形容词＋だ＋と思います｜推测性质或状态",
  "用法3: 一类形容词普通形＋と思います｜推测性质或状态",
  "用法4: 动词辞書形（动词原形）＋と思います｜推测将发生一般情况",
  "用法5: 动词た形＋と思います｜推测已经发生的事",
  "用法6: 动词ない形／动词なかった形＋と思います｜推测否定内容",
].join("\n");

const CONNECTION_571_EXPLANATION: string[] = [
  "推测将发生一般情况",
  "推测已经发生的事",
  "推测性质或状态",
  "推测性质或状态（去「だ」）",
  "推测是某事物",
];

export default function Page() {
  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2 style={{ margin: "0 0 12px 0" }}>Debug: connection 571</h2>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <JpVocabConnectionBody text={CONNECTION_571_RAW} showLabel={true} />
        </div>

        <aside
          style={{
            width: 280,
            flexShrink: 0,
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            background: "color-mix(in srgb, var(--panel) 85%, var(--bg))",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0", fontSize: "0.95rem" }}>说明</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
            {CONNECTION_571_EXPLANATION.map((t) => (
              <li key={t} style={{ marginBottom: 6, lineHeight: 1.6 }}>
                {t}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

