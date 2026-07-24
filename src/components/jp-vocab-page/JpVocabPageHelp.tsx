"use client";

import { jpVocabPriorityLabel } from "@/lib/jp-vocab-shared";
import type { Locale } from "@/i18n/messages";

type JpVocabPageHelpProps = {
  locale: Locale;
  quizTimeWeight: number;
  expanded: boolean;
  onToggle: () => void;
};

export function JpVocabPageHelp({
  locale,
  quizTimeWeight,
  expanded,
  onToggle,
}: JpVocabPageHelpProps) {
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
        <p className="jp-vocab-risk-hint" role="note">
          <strong>{jpVocabPriorityLabel(locale)}</strong>
          ：列表与卡片展示的是「最终抽问得分」= 基础优先级 + 距上次抽问天数 × 时间权重（管理员可调，当前{" "}
          {quizTimeWeight}）。
          基础优先级：一般 × 1 + 不熟悉 × 2 − 非常熟悉 × 0.3（保留 1 位小数）。
          久未复习会自动抬升得分，避免「非常熟悉」后几个月再也抽不到。
          ≥ 3 建议重点抽查，≥ 1 建议留意，&lt; 1 掌握较好；
          为 0 或更低表示尚未复习，或多次勾选「非常熟悉」且近期刚抽过。
          「今日抽查次数」：每勾选一次熟悉程度 +1，北京时间 0 点自动归零；同一单词今日内改选（如非常熟悉改一般）视为修正，不重复计次，只按最后一次勾选更新统计。
          单词表默认按当日固定序号（凌晨按最终得分重排）；当天内勾选或刷新页面不会改变顺序（所有老师看到相同顺序）。管理员在「今日抽查数量」中设置目标后，系统为老师生成可见池（当日序号正序 1…N）；今日新入库从未抽查词不进池。跨日自动回到默认设置。管理员可使用「重置 → 今日重置」立即重排并清空当前轮次勾选，统计次数不变。
          搜索框在本地对已加载词表即时过滤，支持单词、读音、释义、词性等字段模糊匹配，多个关键词用空格隔开（需同时满足）；旁边可按「全部 / 单词 / 语法」筛选类型。
          备注编辑后约 1 秒自动保存并写入数据库；其他端约 1 秒自动拉取变更（标签页在后台时会降频）。
        </p>
      ) : null}
    </div>
  );
}
