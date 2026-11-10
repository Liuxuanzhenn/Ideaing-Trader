/** 数据契约的最小类型集（阶段 1 冻结草案）。
 *
 *  单位与口径规则（唯一，不接受例外）：
 *  - 金额一律基础单位「元」，数量一律「股」；亿/万只允许出现在展示层
 *  - 字段名以 _pct 结尾 → 百分数，取值 0–100（如 chg_pct、progress_pct）
 *  - 字段名以 _rate 结尾 → 小数，取值 0–1（如 seal_rate、fee_rate）
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
  coverage: { total: number; pct: number | null };
}

/* ---------- 复盘 ---------- */

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
  /** 盘中触及涨停 = sealed_up + broken_up；由后端给出，前端不再推导 */
  touched_up: number | null;
  /** 当日无涨跌幅限制的只数（新股窗口等），统计涨跌停率时应排除 */
  no_limit: number;
  /** 越界数据行数，不能计入涨跌停统计 */
  out_of_band: number;
  /** 封板率 = sealed_up / touched_up，小数 0–1；无样本时为 null */
  seal_rate: number | null;
}

export interface LadderRow {
  code: string;
  name: string;
  ladder: number;
  is_one_word: boolean;
  /** 行业分类尚未验证，不可用时为 null */
  industry: string | null;
  /** 封板时间需要分钟线，可为 null */
  seal_time: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  published: string;
  status: 'full' | 'title' | 'failed';
  /** 来源类型：交易所公告 / 媒体资讯 / 规则推断 */
  reason_source: 'exchange' | 'news' | 'inferred';
  /** 关联股票代码 */
  codes: string[];
}

export interface MarketExtra {
  /** 两市成交额，单位：元；后端尚未提供时为 null */
  amount: number | null;
  /** 63 日新高/新低家数；后端尚未提供时为 null */
  new_high_63: number | null;
  new_low_63: number | null;
  /** 昨日涨停股今日表现；后端尚未提供时为 null */
  prev_limit: { median_pct: number | null; up_ratio: number | null; samples: number | null } | null;
}

export interface PromotionStep {
  /** 昨日连板数 */
  level: number;
  /** 昨日该连板家数 */
  base: number;
  /** 今日晋级家数 */
  promoted: number;
  /** 0–1；无样本 null */
  rate: number | null;
}

/** 上一交易日同口径快照，用于算「较前值」 */
export interface PrevSnapshot {
  as_of: string;
  sealed_up: number;
  broken_up: number | null;
  sealed_down: number | null;
  seal_rate: number | null;
  amount: number;
}

/** 近 N 个交易日序列，供首屏小图使用；缺样本的日期用 null */
export interface ReviewSeries {
  dates: string[];
  indices: { code: string; values: number[] }[];
  sealed_up: number[];
  sealed_down: number[];
  broken_up: (number | null)[];
  seal_rate: (number | null)[];
  max_ladder: number[];
  ladder_count: number[];
  amount: number[];
  red_ratio: number[];
  new_high_63: number[];
  new_low_63: number[];
  promotion_rate: (number | null)[];
}

export interface SectorRow {
  name: string;
  chg_pct: number;
  /** 5 日涨跌幅，可算；不足 5 日样本时为 null */
  chg_5d_pct: number | null;
  up: number;
  total: number;
  limit_up: number;
  /** 成交额，单位：元 */
  amount: number;
  /** 领涨股，按涨幅取前几只 */
  leaders: { code: string; name: string; chg_pct: number }[];
}

export interface StockFlow {
  code: string;
  name: string;
  chg_pct: number;
  /** 主力净流入，单位：元；正为流入。需分单方向数据，当前来源未接入 */
  net_in: number;
}

export interface Review {
  meta: DataMeta;
  is_trading_day: boolean;
  indices: IndexQuote[];
  breadth: Breadth;
  limit: LimitStats;
  market: MarketExtra;
  promotion: PromotionStep[];
  prev: PrevSnapshot | null;
  series: ReviewSeries;
  sectors: SectorRow[];
  flows: { inflow: StockFlow[]; outflow: StockFlow[] };
  ladder: LadderRow[];
  news: NewsItem[];
  /** 被排除的原始行，按原因计数 */
  excluded: Record<string, number>;
}

/* ---------- 任务 ---------- */

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
  /** 回测任务成功后可通过 getBacktestResult 取报告 */
  result_ready?: boolean;
}

export interface TaskList {
  meta: DataMeta;
  items: TaskItem[];
}

export interface ServiceStatus {
  connection: 'online' | 'offline';
  as_of: string;
  updated_at: string;
  coverage: { total: number; pct: number | null };
  level: DataStatusLevel;
}

/* ---------- 个股 ---------- */

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量，单位：股 */
  volume: number;
}

export interface StockStats {
  /** 历史不足 20 个交易日时为 null */
  chg_20d_pct: number | null;
  low_open: {
    hits: number;
    samples: number;
    /** 0–1；无样本时为 null */
    rate: number | null;
    window: number;
    version: string;
  };
  limit_250: number;
  max_ladder: number;
}

export interface Stock {
  meta: DataMeta;
  code: string;
  /** 库里尚无股票名称，可能为 null，页面回落到代码 */
  name: string | null;
  board: string;
  /** 行业分类尚未验证，不可用时为 null */
  industry: string | null;
  concepts: string[];
  trade_status: 'normal' | 'suspended' | 'st';
  /** 无成交时为 null，不用 0 冒充 */
  price: number | null;
  chg_pct: number | null;
  /** 换手率，百分数 0–100 */
  turnover_pct: number | null;
  /** 成交额，单位：元 */
  amount: number | null;
  /** 流通市值，单位：元；缺股本数据时为 null */
  mcap: number | null;
  stats: StockStats;
  /** 当日与大盘/板块的关系；没有指数或板块数据时为 null，不猜 */
  context: {
    market: { name: string; chg_pct: number } | null;
    sector: { name: string; chg_pct: number } | null;
    relation: 'resonance' | 'contrarian' | 'flat' | null;
  };
  candles: Candle[];
  /** raw = 不复权（当前库只存原始价）；adj = 前复权 */
  price_adjustment: 'raw' | 'adj';
}

/* ---------- 筛选 ---------- */

export type ScreenField = 'chg_pct' | 'ladder' | 'turnover_pct' | 'amount' | 'mcap' | 'limit_20';
export type ScreenOp = 'gte' | 'lte' | 'eq';

export interface ScreenCondition {
  field: ScreenField;
  op: ScreenOp;
  value: number;
}

export interface ScreenOptions {
  meta: DataMeta;
  fields: { id: ScreenField; label: string; unit: string }[];
  ops: { id: ScreenOp; label: string }[];
  max_conditions: number;
  /** 后端无法计算的字段，只能说明不能静默忽略 */
  unavailable?: string[];
}

export interface ScreenRow {
  code: string;
  /** 库里尚无名称，可能为 null */
  name: string | null;
  industry: string | null;
  price: number;
  chg_pct: number;
  turnover_pct: number | null;
  ladder: number;
  limit_20: number;
  /** 成交额，单位：元 */
  amount: number;
  /** 流通市值，单位：元 */
  mcap: number | null;
}

export interface ScreenResult {
  meta: DataMeta;
  rows: ScreenRow[];
  ran_at: string;
  elapsed_ms: number;
  /** 过滤前被排除的行，例如 {"st": 170} */
  excluded?: Record<string, number>;
}

/* ---------- 回测 ---------- */

export type PoolKind = 'watchlist' | 'basket' | 'screen' | 'all';

export interface BtStrategy {
  id: string;
  label: string;
  version: string;
}

export interface BtPoolOption {
  id: PoolKind;
  label: string;
  /** 当前池内标的数；筛选结果/全A 由后端返回 */
  count: number | null;
}

export interface BacktestOptions {
  meta: DataMeta;
  strategies: BtStrategy[];
  pools: BtPoolOption[];
  assumptions: string[];
  /** 表单初值由后端给，前端不硬编码业务数字 */
  defaults: BacktestForm;
}

export interface BacktestForm {
  strategy_id: string;
  pool: PoolKind;
  from: string;
  to: string;
  /** 初始资金，单位：元 */
  capital: number;
  max_pos: number;
  /** 佣金、印花税、滑点均为小数 0–1 */
  fee_rate: number;
  stamp_rate: number;
  slip_rate: number;
}

export interface BacktestMetrics {
  total_pct: number;
  annual_pct: number;
  bench_pct: number;
  excess_pct: number;
  max_dd_pct: number;
  trades: number;
  /** 0–1；无样本时 null */
  win_rate: number | null;
  /** 费用合计，单位：元 */
  fees: number;
}

export interface YearStat {
  year: string;
  ret_pct: number;
  bench_pct: number;
  max_dd_pct: number;
  trades: number;
  win_rate: number | null;
}

export interface Trade {
  open: string;
  close: string;
  code: string;
  name: string;
  qty: number;
  price: number;
  pnl: number;
  fee: number;
}

export interface BacktestResult {
  meta: DataMeta;
  task_id: string;
  metrics: BacktestMetrics;
  /** 净值序列，起点 100 */
  equity: number[];
  benchmark: number[];
  /** 回撤序列，负值百分比 */
  drawdown: number[];
  /** 与 equity 等长的横轴标签 */
  labels: string[];
  yearly: YearStat[];
  trades: Trade[];
  run_meta: {
    snapshot: string;
    strategy: string;
    params_hash: string;
    seed: number;
    range: string;
    benchmark: string;
    pool: string;
    timing: string;
  };
  assumptions: string[];
}

/* ---------- 资讯 ---------- */

export interface NewsList {
  meta: DataMeta;
  items: NewsItem[];
}

/* ---------- Agent ---------- */

export interface AgentToolCall {
  id: string;
  tool: string;
  args: Record<string, string | number>;
  duration_ms: number;
  summary: string;
  /** 工具创建的异步任务，需要在任务中心留痕 */
  task_id?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: string;
  tool_calls?: AgentToolCall[];
  /** true 表示这条消息会触发需要留痕的写操作 */
  requires_trace?: boolean;
}

export interface AgentSession {
  meta: DataMeta;
  messages: AgentMessage[];
}

export interface TaskLogs {
  task_id: string;
  lines: string[];
}

/* ---------- 会话内组合（观察池 / 选股篮） ---------- */

export interface Portfolio {
  watchlist: string[];
  basket: string[];
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
