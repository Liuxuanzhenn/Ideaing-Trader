/** 数据契约的最小类型集（阶段 1 冻结草案）。
 *  字段口径见 T-003 映射：
 *  - 时间统一用 ISO 字符串：as_of（数据对应的交易日/时刻）、updated_at（管线产出时刻）
 *  - 百分比一律 0–100，不用小数比例
 *  - 金额单位：amount 为亿元
 */

export type DataStatusLevel = 'ok' | 'partial' | 'stale' | 'error' | 'empty';

export interface DataMeta {
  as_of: string;
  updated_at: string;
  snapshot: string;
  status: {
    level: DataStatusLevel;
    failed_sources: string[];
  };
  coverage: { total: number; rate: number };
}

export interface IndexQuote {
  code: string;
  name: string;
  close: number;
  chg_pct: number;
  amount: number;
}

export interface Breadth {
  up: number;
  flat: number;
  down: number;
  total: number;
}

export interface LimitStats {
  up_cnt: number;
  /** 数据部分缺失时为 null，UI 必须显示「—」而不是 0 */
  down_cnt: number | null;
  broken_cnt: number | null;
  seal_rate: number | null;
  sample: number;
}

export interface LadderRow {
  code: string;
  name: string;
  ladder: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  published: string;
  status: 'full' | 'title' | 'failed';
  kind: 'fact' | 'inferred';
}

export interface Review {
  meta: DataMeta;
  is_trading_day: boolean;
  indices: IndexQuote[];
  breadth: Breadth;
  limit: LimitStats;
  ladder: LadderRow[];
  news: NewsItem[];
}

export type TaskStatus = 'running' | 'queued' | 'success' | 'failed' | 'canceled';

export interface TaskItem {
  id: string;
  type: string;
  status: TaskStatus;
  progress: number;
  submitted: string;
  finished?: string;
  server: string;
  params: string;
  cancelable: boolean;
  artifact?: string;
  error?: string;
}

export interface TaskList {
  meta: DataMeta;
  items: TaskItem[];
}

export interface ServiceStatus {
  connection: 'online' | 'offline';
  as_of: string;
  updated_at: string;
  coverage: { total: number; rate: number };
  level: DataStatusLevel;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
