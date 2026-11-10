import type { Review } from './types';

/**
 * Response of GET /api/review. Kept separate from the page view model on purpose:
 * the backend only serves what it can compute, and the mapper below fills the gaps
 * with explicit "not available yet" markers instead of zeroes.
 */
interface LiveMeta {
  as_of: string;
  updated_at: string;
  snapshot_id: string;
  level: string;
  failed_sources: string[];
  coverage: { instruments: number; expected: number; pct: number | null } | null;
}

interface LiveLimits {
  sealed_up: number;
  broken_up: number;
  sealed_down: number;
  no_limit: number;
  out_of_band: number;
  touched_up: number;
  seal_rate: number | null;
}

interface LiveIndex {
  code: string;
  name: string;
  close: number;
  chg_pct: number;
  amount: number;
}

interface LiveLadderRow {
  symbol: string;
  streak: number;
  is_one_word: boolean;
  name: string | null;
}

interface LiveMarket {
  amount: number | null;
  promotion: { level: number; base: number; promoted: number }[];
  prev_limit: { samples: number; median_pct: number | null; up_ratio: number | null } | null;
}

interface LiveSeries {
  dates: string[];
  sealed_up: number[];
  sealed_down: number[];
  broken_up: number[];
  seal_rate: (number | null)[];
  red_ratio: (number | null)[];
  max_ladder: number[];
  ladder_count: number[];
  amount: number[];
  indices: { code: string; name: string; closes: (number | null)[] }[];
}

export interface LiveReview {
  meta: LiveMeta;
  is_trading_day: boolean;
  breadth: { up: number; down: number; flat: number };
  limits: LiveLimits;
  ladder: LiveLadderRow[];
  indices: LiveIndex[];
  excluded: Record<string, number>;
  series?: LiveSeries;
  market?: LiveMarket;
}

/**
 * 唯一的请求出口。后端错误体有两种形状（`{message}` 和 FastAPI 的 `{detail:{message}}`），
 * 统一在这里取消息，页面只关心一句话原因。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      detail?: { code?: string; message?: string };
    };
    const detail = body.detail ?? body;
    throw new Error(detail.message ?? detail.code ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

const rateText = (rate: number | null | undefined, label: string) =>
  rate == null ? `${label} 未提供` : `${label} ${rate}`;

const getJson = <T,>(path: string) => request<T>(path, { headers: { accept: 'application/json' } });

const postJson = <T,>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export async function fetchLiveReview(date: string): Promise<LiveReview> {
  return getJson<LiveReview>(`/api/review?date=${encodeURIComponent(date)}`);
}

export interface LiveStatus {
  snapshot_id: string;
  updated_at: string;
  warning_count: number;
}

function snapshotDate(snapshot: string): string {
  const match = snapshot.match(/\.\.(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

export async function fetchLiveStatus(): Promise<import('./types').ServiceStatus> {
  const status = await getJson<LiveStatus>('/api/data-status');
  return {
    connection: 'online',
    as_of: snapshotDate(status.snapshot_id),
    updated_at: status.updated_at,
    coverage: { total: 0, pct: null },
    level: 'ok',
  };
}


interface LiveStock {
  meta: LiveMeta;
  code: string;
  name: string | null;
  board: string;
  trade_status: 'normal' | 'suspended' | 'st';
  price: number | null;
  chg_pct: number | null;
  turnover_pct: number | null;
  amount: number | null;
  mcap: number | null;
  stats: {
    chg_20d_pct: number | null;
    low_open: { hits: number; samples: number; window: number; version: string; rate: number | null };
    limit_250: number;
    max_ladder: number;
  };
  candles: { trade_date: string; open: number; high: number; low: number; close: number; volume: number }[];
  price_adjustment: 'raw' | 'adj';
  industry: string | null;
  concepts: string[];
}

export async function fetchLiveStock(code: string): Promise<import('./types').Stock> {
  const stock = await getJson<LiveStock>(`/api/stocks/${encodeURIComponent(code)}`);
  return {
    meta: {
      as_of: stock.meta.as_of,
      updated_at: stock.meta.updated_at,
      snapshot: stock.meta.snapshot_id,
      status: {
        level: stock.meta.level as import('./types').DataStatusLevel,
        failed_sources: stock.meta.failed_sources,
      },
      coverage: {
        total: stock.meta.coverage?.instruments ?? null,
        pct: stock.meta.coverage?.pct ?? null,
      },
    },
    code: stock.code,
    name: stock.name,
    board: stock.board,
    industry: stock.industry,
    concepts: stock.concepts,
    trade_status: stock.trade_status,
    price: stock.price,
    chg_pct: stock.chg_pct,
    turnover_pct: stock.turnover_pct,
    amount: stock.amount,
    mcap: stock.mcap,
    stats: {
      chg_20d_pct: stock.stats.chg_20d_pct,
      low_open: {
        hits: stock.stats.low_open.hits,
        samples: stock.stats.low_open.samples,
        rate: stock.stats.low_open.rate,
        window: stock.stats.low_open.window,
        version: stock.stats.low_open.version,
      },
      limit_250: stock.stats.limit_250,
      max_ladder: stock.stats.max_ladder,
    },
    // The backend does not serve index or sector context yet; null keeps the page honest.
    context: { market: null, sector: null, relation: null },
    candles: stock.candles.map((candle) => ({
      date: candle.trade_date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })),
    price_adjustment: stock.price_adjustment,
  };
}

interface LiveScreenOptions {
  meta: LiveMeta;
  unavailable: string[];
}

interface LiveScreenResult {
  meta: LiveMeta;
  rows: {
    code: string;
    name: string | null;
    price: number;
    chg_pct: number;
    turnover_pct: number | null;
    amount: number;
    ladder: number;
    limit_20: number;
    industry: string | null;
    mcap: number | null;
  }[];
  excluded: Record<string, number>;
}

function liveMeta(meta: LiveMeta): import('./types').DataMeta {
  return {
    as_of: meta.as_of,
    updated_at: meta.updated_at,
    snapshot: meta.snapshot_id,
    status: {
      level: meta.level as import('./types').DataStatusLevel,
      failed_sources: meta.failed_sources,
    },
    coverage: {
      total: meta.coverage?.instruments ?? null,
      pct: meta.coverage?.pct ?? null,
    },
  };
}

export async function fetchLiveScreenOptions(): Promise<import('./types').ScreenOptions> {
  const payload = await getJson<LiveScreenOptions>('/api/screen/options');
  return {
    meta: liveMeta(payload.meta),
    // Only the fields the backend can actually filter on; unavailable ones are listed
    // in the banner instead of appearing as options that silently do nothing.
    fields: [
      { id: 'chg_pct', label: '涨跌幅', unit: '%' },
      { id: 'ladder', label: '连板数', unit: '板' },
      { id: 'turnover_pct', label: '换手率', unit: '%' },
      { id: 'amount', label: '成交额', unit: '元' },
      { id: 'limit_20', label: '近 20 日涨停', unit: '次' },
    ],
    ops: [
      { id: 'gte', label: '≥' },
      { id: 'lte', label: '≤' },
      { id: 'eq', label: '=' },
    ],
    max_conditions: 6,
    unavailable: payload.unavailable,
  };
}

export async function runLiveScreen(
  conditions: import('./types').ScreenCondition[],
): Promise<import('./types').ScreenResult> {
  const payload = await postJson<LiveScreenResult>('/api/screen', { conditions });
  return {
    meta: liveMeta(payload.meta),
    ran_at: payload.meta.updated_at,
    elapsed_ms: 0,
    excluded: payload.excluded,
    rows: payload.rows.map((row) => ({
      code: row.code,
      name: row.name,
      industry: row.industry,
      price: row.price,
      chg_pct: row.chg_pct,
      turnover_pct: row.turnover_pct,
      ladder: row.ladder,
      limit_20: row.limit_20,
      amount: row.amount,
      mcap: row.mcap,
    })),
  } as unknown as import('./types').ScreenResult;
}

interface LiveBacktestReport {
  meta: LiveMeta;
  params: {
    strategy: string;
    strategy_label: string;
    start: string;
    end: string;
    capital: number;
    max_positions: number;
    holding_days: number;
  };
  starting_capital: number;
  ending_equity: number;
  equity: [string, number][];
  benchmark: number[];
  benchmark_return: number | null;
  trades: {
    symbol: string;
    entry_date: string;
    exit_date: string;
    quantity: number;
    entry_price: number;
    exit_price: number;
    fees: number;
    pnl: number;
  }[];
  skips: Record<string, number>;
  total_return: number | null;
  annual_return: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  fees: number;
  fee_schedule: Record<string, number>;
  note: string;
}

export interface LiveBacktestOptions {
  strategies: { id: string; label: string }[];
  latest_session: string | null;
}

export async function fetchLiveBacktestOptions(): Promise<import('./types').BacktestOptions> {
  const payload = await getJson<LiveBacktestOptions>('/api/backtests/options');
  const latest = payload.latest_session ?? '';
  return {
    meta: liveMeta({
      ...(payload as unknown as { meta?: LiveMeta }).meta,
    } as LiveMeta),
    strategies: payload.strategies.map((item) => ({
      id: item.id as import('./types').BtStrategy['id'],
      label: item.label,
      version: 'v1',
      description: '首板次日开盘买入，持有固定交易日数',
    })),
    pools: [{ id: 'all', label: '全市场', count: null }],
    assumptions: [
      '信号在收盘确认，成交在次日开盘；开盘涨停买不到、停牌不可成交',
      '佣金万三（最低 5 元）、印花税千一（仅卖出）、滑点万二',
      '结果不落库：刷新页面后需要重新运行',
    ],
    defaults: {
      strategy_id: 'first_board',
      pool: 'all',
      from: latest,
      to: latest,
      capital: 1000000,
      max_pos: 10,
      fee_rate: 0.0003,
      stamp_rate: 0.0001,
      slip_rate: 0.0002,
    },
  } as unknown as import('./types').BacktestOptions;
}

/**
 * Runs synchronously and returns the finished report; v1 has no task queue.
 * Reports are kept in memory so the result page can be navigated by id, and the
 * assumptions block says plainly that they do not survive a reload.
 */
const backtestRuns = new Map<string, LiveBacktestReport>();
let backtestSeq = 0;

export function getBacktestRun(): { id: string; report: LiveBacktestReport } | null {
  const last = [...backtestRuns.entries()].pop();
  return last ? { id: last[0], report: last[1] } : null;
}

export async function submitLiveBacktest(form: import('./types').BacktestForm): Promise<import('./types').TaskItem> {
  const report = await postJson<LiveBacktestReport>('/api/backtests', {
    strategy: form.strategy_id,
    start: form.from,
    end: form.to,
    capital: form.capital,
    max_positions: form.max_pos,
    holding_days: 5,
  });
  backtestSeq += 1;
  const id = `bt-${Date.now()}-${backtestSeq}`;
  backtestRuns.set(id, report);
  return {
    id,
    type: 'backtest',
    status: 'success',
    progress_pct: 100,
    submitted: report.meta.updated_at,
    finished: report.meta.updated_at,
    server: 'autodl',
    params: `${report.params.strategy_label} · ${report.params.start}..${report.params.end}`,
    cancelable: false,
    result_ready: true,
  };
}

function toBacktestResult(report: LiveBacktestReport): import('./types').BacktestResult {
  const base = report.equity.length ? report.equity[0][1] : report.starting_capital;
  const equity = report.equity.map(([, value]) => (base > 0 ? (value / base) * 100 : 0));
  let peak = -Infinity;
  const drawdown = equity.map((value) => {
    peak = Math.max(peak, value);
    return peak > 0 ? -((peak - value) / peak) * 100 : 0;
  });
  const pctOf = (value: number | null) => (value === null ? null : value * 100);
  return {
    meta: liveMeta(report.meta),
    task_id: report.params.strategy,
    metrics: {
      total_pct: pctOf(report.total_return),
      annual_pct: pctOf(report.annual_return),
      // No benchmark series yet; 0 would read as "the index returned nothing".
      bench_pct: report.benchmark_return === null ? null : report.benchmark_return * 100,
      excess_pct:
        report.total_return === null || report.benchmark_return === null
          ? null
          : (report.total_return - report.benchmark_return) * 100,
      max_dd_pct: pctOf(report.max_drawdown),
      trades: report.trades.length,
      win_rate: report.win_rate,
      fees: report.fees,
    },
    equity,
    benchmark: report.benchmark,
    drawdown,
    labels: report.equity.map(([day]) => day),
    yearly: [],
    trades: report.trades.map((trade) => ({
      open: trade.entry_date,
      close: trade.exit_date,
      code: trade.symbol,
      name: trade.symbol,
      qty: trade.quantity,
      price: trade.entry_price,
      pnl: trade.pnl,
      fee: trade.fees,
    })),
    run_meta: {
      snapshot: report.meta.snapshot_id,
      strategy: report.params.strategy_label,
      params_hash: `${report.params.max_positions}仓/${report.params.holding_days}日`,
      seed: 0,
      range: `${report.params.start}..${report.params.end}`,
      benchmark: report.benchmark_return === null ? '无指数数据' : '沪深300',
      pool: '全市场',
      timing: '信号收盘确认，次日开盘成交',
    },
    assumptions: [
      '信号在收盘确认，成交在次日开盘；开盘涨停买不到、停牌不可成交',
      `佣金 ${rateText(report.fee_schedule.commission_rate, '佣金')} · 印花税 ${rateText(report.fee_schedule.stamp_duty_rate, '印花税')} · 滑点 ${rateText(report.fee_schedule.slippage_rate, '滑点')}`,
      report.note || '结果未落库，刷新页面后需重新运行',
      ...Object.entries(report.skips).map(([reason, count]) => `跳过 ${reason}：${count} 次`),
    ],
  } as unknown as import('./types').BacktestResult;
}

export async function fetchLiveBacktestResult(taskId: string): Promise<import('./types').BacktestResult> {
  const report = backtestRuns.get(taskId);
  if (!report) {
    throw new Error('该回测结果只存在于当前会话内存中，请重新运行');
  }
  return toBacktestResult(report);
}

export async function fetchLivePortfolio(): Promise<import('./types').Portfolio> {
  return getJson<import('./types').Portfolio>('/api/portfolio');
}

async function changePortfolio(
  path: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<import('./types').Portfolio> {
  return request<import('./types').Portfolio>(path, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const addLiveWatchlist = (code: string) => changePortfolio('/api/portfolio/watchlist', 'POST', { code });
export const removeLiveWatchlist = (code: string) =>
  changePortfolio(`/api/portfolio/watchlist/${encodeURIComponent(code)}`, 'DELETE');
export const addLiveBasket = (code: string) => changePortfolio('/api/portfolio/basket', 'POST', { code });

/** Blocks the backend cannot serve yet; the page must say so instead of showing zeros. */
export function liveGaps(review: LiveReview): string[] {
  const gaps: string[] = [];
  if (review.indices.length === 0) gaps.push('指数行情');
  gaps.push('板块表现', '资金流', '资讯');
  return gaps;
}

/** Adapts the live payload to the view model the page already renders. */
export function toPageReview(review: LiveReview): Review {
  const excluded = review.excluded ?? {};
  const live = review.series && review.series.dates.length > 0 ? review.series : null;
  return {
    meta: {
      as_of: review.meta.as_of,
      updated_at: review.meta.updated_at,
      snapshot: review.meta.snapshot_id,
      status: {
        level: review.meta.level as Review['meta']['status']['level'],
        failed_sources: review.meta.failed_sources,
      },
      coverage: {
        total: review.meta.coverage?.instruments ?? null,
        pct: review.meta.coverage?.pct ?? null,
      },
    },
    is_trading_day: review.is_trading_day,
    indices: review.indices.map((index) => ({
      code: index.code,
      name: index.name,
      close: index.close,
      chg_pct: index.chg_pct,
      amount: index.amount,
    })),
    breadth: review.breadth,
    limit: {
      sealed_up: review.limits.sealed_up,
      broken_up: review.limits.broken_up,
      sealed_down: review.limits.sealed_down,
      touched_up: review.limits.touched_up,
      no_limit: review.limits.no_limit,
      out_of_band: review.limits.out_of_band,
      seal_rate: review.limits.seal_rate,
    },
    market: {
      amount: review.market?.amount ?? null,
      new_high_63: null,
      new_low_63: null,
      prev_limit: review.market?.prev_limit
        ? {
            median_pct: review.market.prev_limit.median_pct,
            up_ratio: review.market.prev_limit.up_ratio,
            samples: review.market.prev_limit.samples,
          }
        : null,
    },
    promotion: (review.market?.promotion ?? []).map((step) => ({
      level: step.level,
      base: step.base,
      promoted: step.promoted,
      rate: step.base ? step.promoted / step.base : null,
    })),
    prev: null,
    series: {
      dates: live?.dates ?? [],
      // A day with no index bar (e.g. 创业板指 before 2010-06) is dropped rather than
      // carried forward: the spark is a shape hint, and carrying a stale close would
      // draw a flat segment that never happened.
      indices: (live?.indices ?? []).map((index) => ({
        code: index.code,
        values: index.closes.filter((close): close is number => close !== null),
      })),
      sealed_up: live?.sealed_up ?? [],
      sealed_down: live?.sealed_down ?? [],
      broken_up: live?.broken_up ?? [],
      seal_rate: live?.seal_rate ?? [],
      max_ladder: live?.max_ladder ?? [],
      ladder_count: live?.ladder_count ?? [],
      amount: live?.amount ?? [],
      red_ratio: live?.red_ratio ?? [],
      new_high_63: [],
      new_low_63: [],
      promotion_rate: [],
    },
    sectors: [],
    flows: { inflow: [], outflow: [] },
    ladder: review.ladder.map((entry) => ({
      code: entry.symbol,
      // Names are not stored yet; showing the code beats showing an empty cell.
      name: entry.name ?? entry.symbol,
      ladder: entry.streak,
      is_one_word: entry.is_one_word,
      industry: null,
      seal_time: null,
    })),
    news: [],
    excluded,
  } as unknown as Review;
}
