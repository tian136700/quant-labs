export interface BarRow {
  bar_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  rsi?: number | null;
}

export interface BarsApiResponse {
  ok: boolean;
  error?: string;
  symbol?: string;
  name?: string;
  rsi_period?: number;
  start?: string;
  end?: string;
  years?: number;
  cache_hit?: boolean;
  rows?: BarRow[];
}

export interface StrategyResult {
  key: string;
  name: string;
  rule: string;
  buy_days: number;
  shares: number;
  total_cost: number;
  avg_cost: number | null;
  per_pct: number | null;
  delta_pct: number | null;
  total_pnl: number | null;
}

export interface ComparePayload {
  symbol: string;
  start: string;
  end: string;
  years: number;
  current_date: string;
  current_price: number;
  rsi_period: number;
  strategies: StrategyResult[];
  chart_points: ChartPoint[];
}

/** 图表可选 RSI 阈值（默认 30） */
export const CHART_RSI_THRESHOLDS = [15, 20, 25, 30] as const;
export type ChartRsiThreshold = (typeof CHART_RSI_THRESHOLDS)[number];

export interface ChartPoint {
  date: string;
  dca_value: number;
  rsi_15_value: number;
  rsi_20_value: number;
  rsi_25_value: number;
  rsi_30_value: number;
}

export interface CloudflareEnv {
  DB: D1Database;
  RSI_PERIOD?: string;
  PRICE_DECIMAL_PLACES?: string;
  /** 英语老师评价：管理员用户名（可公开，默认 Admin） */
  ETR_ADMIN_USERNAME?: string;
  /** 英语老师评价：管理员初始密码（仅环境变量/Secret，勿提交 Git） */
  ETR_ADMIN_PASSWORD?: string;
}

export interface EnglishTeacherReviewRecord {
  id: number;
  teacher_name: string;
  class_date: string;
  score: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export type EnglishTeacherReviewSortField =
  | "teacher_name"
  | "class_date"
  | "score"
  | "updated_at";

export interface UserFeedbackRecord {
  id: number;
  email: string;
  content: string;
  ip: string;
  country_code: string | null;
  url_path: string | null;
  locale: string | null;
  created_at: string;
}

export interface VisitLogRecord {
  id: number;
  ip: string;
  country_code: string | null;
  url_path: string;
  event_type: string;
  event_detail: string | null;
  locale: string | null;
  created_at: string;
  /** 该 IP 自首次访问以来的累计记录数（查询时计算） */
  ip_visit_count?: number;
}
