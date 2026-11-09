/** 数据契约的最小类型集（阶段 1 冻结草案）。
 *
 *  单位与口径规则（唯一，不接受例外）：
 *  - 金额一律基础单位「元」，数量一律「股」；亿/万只允许出现在展示层
 *  - 字段名以 _pct 结尾 → 百分数，取值 0–100（如 chg_pct）
 *  - 字段名以 _rate 结尾 → 小数，取值 0–1（如 seal_rate）
 *  - 不可用一律用 null，禁止用 0 冒充「没有数据」
 *  - 时间统一 ISO 字符串：as_of（数据对应交易日/时刻）、updated_at（管线产出时刻）
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
  coverage: { total: number; pct: number };
}

export interface IndexQuote {
  code: string;
  name: string;
  close: number;
  chg_pct: number;
  /** 成交额，单位：元 */
  amount: number;
}

export interface Breadth {
  up: number;
  flat: number;
  down: number;
}

export interface LimitStats {
  /** 收盘封涨停家数 */
  sealed_up: number | null;
  /** 触板但收盘未封（炸板）家数 */
  broken_up: number | null;
  /** 收盘封跌停家数 */
  sealed_down: number | null;
  /** 盘中触及涨停 = sealed_up + broken_up；由后端给出，前端不为它再推导一次 */
  touched_up: number | null;
  /** 当日无涨跌幅限制的只数（新股上市窗口等），统计涨跌停率时应排除 */
  no_limit: number;
  /** 封板率 = sealed_up / touched_up，小数 0–1；无样本时为 null */
  seal_rate: number | null;
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
  /** 来源类型：交易所公告 / 媒体资讯 / 规则推断 */
  reason_source: 'exchange' | 'news' | 'inferred';
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
  /** 完成度，百分数 0–100 */
  progress_pct: number;
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
  coverage: { total: number; pct: number };
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
