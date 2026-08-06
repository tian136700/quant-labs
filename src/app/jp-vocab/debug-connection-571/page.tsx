import { JpVocabConnectionBody } from "@/components/JpVocabConnectionBody";

const CONNECTION_571_RAW =
  "普通形（简体形）＋と思います｜接名词谓语句时：名词＋だと思います；接二类形容词时：二类形容词＋だと思います；接一类形容词时：一类形容词普通形＋と思います；接动词时：动词普通形（动词辞书形（动词原形）／动词た形／动词ない形／なかった形）＋と思います";

export default function Page() {
  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h2 style={{ margin: "0 0 12px 0" }}>Debug: jp-vocab connection 571</h2>
      <JpVocabConnectionBody text={CONNECTION_571_RAW} showLabel={true} />
    </div>
  );
}

