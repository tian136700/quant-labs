"use client";

import { enVocabPriorityLabel } from "@/lib/en-vocab-shared";
import type { Locale } from "@/i18n/messages";

type EnVocabPageHelpProps = {
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
};

export function EnVocabPageHelp({
  locale,
  expanded,
  onToggle,
}: EnVocabPageHelpProps) {
  return (
    <div className="jp-vocab-help">
      <button
        type="button"
        className="jp-vocab-help-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded ? "收起说明" : "展开说明"}
        <span className="jp-vocab-help-toggle-icon" aria-hidden="true">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded ? (
        <div className="jp-vocab-risk-hint" role="note">
          <p>
            <strong>老师端按用法勾选 → 总体熟悉程度（先读这段）</strong>
            ：抽查卡片有编号用法时，在每条「N.用法」旁各勾「非常熟悉 / 一般 / 不熟悉」（隐藏整词三档）；全部勾完后按下列规则汇总成
            <strong>总体熟悉程度</strong>
            ，再计入「非常熟悉 / 一般 / 不熟悉」次数与抽查优先级。管理员列表仍可直接勾整词三档；「查看抽问卡片」预览与老师端同 UI（只读）。
          </p>
          <p>
            两档汇总（非常熟悉 &gt; 一般 &gt; 不熟悉）：两边都是「一般」→ 总体「不熟悉」；一边「非常熟悉」、一边「不熟悉」→ 总体「一般」；其余取较弱一档。真值表：非常+非常→非常；非常+一般→一般；非常+不熟悉→一般；一般+一般→不熟悉；一般+不熟悉→不熟悉；不熟悉+不熟悉→不熟悉。N
            条用法从左到右按上表两两合并；仅 1 条则总体=该条；无编号用法时卡片底栏保留整词勾选兜底。
          </p>
          <p>
            <strong>{enVocabPriorityLabel(locale)}</strong>
            ：根据「复习次数统计」估算每个单词/语法下节课该先抽查谁，数值越高越建议优先提问。
            计算公式：一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3（保留 1 位小数）。
            ≥ 3 建议重点抽查，≥ 1 建议留意，&lt; 1 掌握较好；
            为 0 或更低表示尚未复习，或多次勾选「非常熟悉」。
            「今日抽查次数」：每勾选一次熟悉程度 +1，北京时间 0 点自动归零；15
            秒内对同一单词改选（如非常熟悉改一般）视为修正，不重复计次，只按最后一次更新统计。
            勾选后
            <strong>1 小时内</strong>
            仍可改熟悉程度（学生已查看 / 已共享到「今日英语单词」也不锁）；满 1
            小时后不可再改。
            单词表默认按抽查优先级排序，每天北京时间 0
            点重排一次；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。管理员可使用「重置
            → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
            搜索框对全库模糊匹配（单词、读音、释义、词性等；多个关键词用空格隔开须同时满足）；旁边可按「全部
            / 单词 / 语法」筛选。当前关键词与类型筛选刷新后仍保留，点「清除」才清空；点搜索框可看最近搜索记录（最多
            8 条）。有关键词时会自动拉最新词表，避免只看到本机过期缓存。
            备注编辑后约 1 秒自动保存并写入数据库；其他端约 1
            秒自动拉取变更（标签页在后台时会降频）。
          </p>
        </div>
      ) : null}
    </div>
  );
}
