import { ApiError } from './types';
import type { ApiClient } from './client';
import type {
  AgentMessage,
  AgentSession,
  BacktestForm,
  BacktestOptions,
  BacktestResult,
  Candle,
  DataMeta,
  DataStatusLevel,
  NewsItem,
  NewsList,
  Portfolio,
  Review,
  ScreenCondition,
  ScreenOptions,
  ScreenResult,
  ScreenRow,
  ServiceStatus,
  Stock,
  ReviewSeries,
  TaskItem,
  TaskList,
  TaskLogs,
  Trade,
} from './types';
import type { DemoState } from '../lib/demo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ============================================================
   示例数据：全部由 mock 生成，界面常驻「示例数据」横幅。
   每个数字都对应契约字段，接后端时整体替换，不改页面。
   ============================================================ */

function meta(level: DataStatusLevel, ageMs = 20 * HOUR, failed: string[] = []): DataMeta {
  const at = new Date(Date.now() - ageMs).toISOString();
  return {
    as_of: at,
    updated_at: at,
    snapshot: 'snapshot-mock-0001',
    status: { level, failed_sources: failed },
    coverage: { total: 5412, pct: 99.2 },
  };
}

function metaFor(state: DemoState, failed: string[] = ['limit_reason']): DataMeta {
  if (state === 'stale') return meta('stale', 2 * DAY + 6 * HOUR);
  if (state === 'partial') return meta('partial', 20 * HOUR, failed);
  if (state === 'empty') return meta('empty', 20 * HOUR);
  return meta('ok');
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const never = <T,>(): Promise<T> => new Promise<T>(() => {});
const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------- 复盘 ---------- */

const INDICES = [
  { code: '000001', name: '上证指数', close: 3321.45, chg_pct: 0.82, amount: 4821e8 },
  { code: '399001', name: '深证成指', close: 10874.32, chg_pct: 1.16, amount: 5634e8 },
  { code: '399006', name: '创业板指', close: 2183.77, chg_pct: 1.74, amount: 2874e8 },
  { code: '000300', name: '沪深 300', close: 3946.08, chg_pct: 0.68, amount: 3102e8 },
];

const LADDER = [
  { code: '002261', name: '拓维信息', ladder: 6, industry: '软件', seal_time: null },
  { code: '000977', name: '浪潮信息', ladder: 4, industry: '计算机', seal_time: null },
  { code: '603083', name: '剑桥科技', ladder: 3, industry: '通信', seal_time: null },
  { code: '002230', name: '科大讯飞', ladder: 2, industry: '软件', seal_time: null },
  { code: '300502', name: '新易盛', ladder: 2, industry: '通信', seal_time: null },
  { code: '300474', name: '景嘉微', ladder: 2, industry: '半导体', seal_time: null },
  { code: '600410', name: '华胜天成', ladder: 1, industry: '计算机', seal_time: null },
  { code: '002123', name: '梦网科技', ladder: 1, industry: '通信', seal_time: null },
  { code: '300229', name: '拓尔思', ladder: 1, industry: '软件', seal_time: null },
  { code: '601595', name: '上海电影', ladder: 1, industry: '传媒', seal_time: null },
];

const SECTORS = [
  { name: '通信', chg_pct: 4.82, chg_5d_pct: 7.61, up: 38, total: 46, limit_up: 7, amount: 1284e8, leaders: [
      { code: '603083', name: '剑桥科技', chg_pct: 10.01 },
      { code: '300502', name: '新易盛', chg_pct: 9.99 },
      { code: '002123', name: '梦网科技', chg_pct: 9.98 },
    ] },
  { name: '计算机', chg_pct: 3.95, chg_5d_pct: 5.24, up: 96, total: 128, limit_up: 13, amount: 2160e8, leaders: [
      { code: '000977', name: '浪潮信息', chg_pct: 6.85 },
      { code: '002261', name: '拓维信息', chg_pct: 9.96 },
      { code: '600410', name: '华胜天成', chg_pct: 10.05 },
    ] },
  { name: '传媒', chg_pct: 3.11, chg_5d_pct: 2.88, up: 42, total: 61, limit_up: 6, amount: 726e8, leaders: [
      { code: '601595', name: '上海电影', chg_pct: 10.02 },
      { code: '603533', name: '掌阅科技', chg_pct: 10.0 },
    ] },
  { name: '电子', chg_pct: 2.46, chg_5d_pct: 3.1, up: 84, total: 132, limit_up: 4, amount: 1520e8, leaders: [
      { code: '300474', name: '景嘉微', chg_pct: 10.0 },
      { code: '688981', name: '中芯国际', chg_pct: 4.12 },
    ] },
  { name: '非银金融', chg_pct: 1.38, chg_5d_pct: 1.02, up: 28, total: 47, limit_up: 1, amount: 860e8, leaders: [{ code: '300059', name: '东方财富', chg_pct: 2.3 }] },
  { name: '银行', chg_pct: 0.42, chg_5d_pct: -0.35, up: 18, total: 42, limit_up: 0, amount: 412e8, leaders: [{ code: '600036', name: '招商银行', chg_pct: 0.62 }] },
  { name: '医药生物', chg_pct: -0.35, chg_5d_pct: -1.24, up: 96, total: 214, limit_up: 1, amount: 980e8, leaders: [{ code: '603259', name: '药明康德', chg_pct: 1.12 }] },
  { name: '食品饮料', chg_pct: -0.68, chg_5d_pct: -2.06, up: 34, total: 78, limit_up: 0, amount: 520e8, leaders: [{ code: '600519', name: '贵州茅台', chg_pct: -0.42 }] },
  { name: '电力设备', chg_pct: -1.42, chg_5d_pct: -3.18, up: 41, total: 128, limit_up: 0, amount: 1080e8, leaders: [{ code: '300750', name: '宁德时代', chg_pct: 3.15 }] },
  { name: '房地产', chg_pct: -2.18, chg_5d_pct: -4.62, up: 12, total: 58, limit_up: 0, amount: 386e8, leaders: [{ code: '000002', name: '万科A', chg_pct: -1.02 }] },
];

const FLOWS = {
  inflow: [
    { code: '603083', name: '剑桥科技', chg_pct: 10.01, net_in: 8.62e8 },
    { code: '002261', name: '拓维信息', chg_pct: 9.96, net_in: 7.14e8 },
    { code: '000977', name: '浪潮信息', chg_pct: 6.85, net_in: 6.28e8 },
    { code: '300502', name: '新易盛', chg_pct: 9.99, net_in: 4.86e8 },
    { code: '002230', name: '科大讯飞', chg_pct: 9.98, net_in: 3.42e8 },
    { code: '300474', name: '景嘉微', chg_pct: 10.0, net_in: 2.86e8 },
  ],
  outflow: [
    { code: '300750', name: '宁德时代', chg_pct: -1.24, net_in: -5.18e8 },
    { code: '601012', name: '隆基绿能', chg_pct: -2.36, net_in: -4.42e8 },
    { code: '000002', name: '万科A', chg_pct: -1.02, net_in: -3.06e8 },
    { code: '600519', name: '贵州茅台', chg_pct: -0.42, net_in: -2.74e8 },
    { code: '603259', name: '药明康德', chg_pct: 1.12, net_in: -1.96e8 },
    { code: '600036', name: '招商银行', chg_pct: 0.62, net_in: -1.42e8 },
  ],
};

const NEWS: NewsItem[] = [
  { id: 'N-1', title: '算力基础设施项目招标结果公示', source: '示例交易所公告', published: '18:40', status: 'full', reason_source: 'exchange', codes: ['000977', '603083'] },
  { id: 'N-2', title: '多地发布数据要素行动方案', source: '示例政策库', published: '16:10', status: 'full', reason_source: 'exchange', codes: ['300229'] },
  { id: 'N-3', title: '市场传闻某光模块厂商获海外大单', source: '示例财经快讯', published: '14:55', status: 'title', reason_source: 'news', codes: ['300502'] },
  { id: 'N-4', title: '白酒板块周度动销数据跟踪', source: '示例行业数据', published: '11:20', status: 'full', reason_source: 'inferred', codes: ['600519'] },
  { id: 'N-5', title: '交易所对某公司下发关注函', source: '示例公告库', published: '昨 20:15', status: 'full', reason_source: 'exchange', codes: ['002261'] },
  { id: 'N-6', title: '某产业链调研纪要流出', source: '示例研究纪要', published: '昨 09:10', status: 'failed', reason_source: 'inferred', codes: ['002230'] },
];

function buildSeries(empty: boolean): ReviewSeries {
  const days = 20;
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < days) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.unshift(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    d.setDate(d.getDate() - 1);
  }
  if (empty) {
    return {
      dates, indices: [], sealed_up: [], sealed_down: [], broken_up: [], seal_rate: [],
      max_ladder: [], ladder_count: [], amount: [], red_ratio: [], new_high_63: [],
      new_low_63: [], promotion_rate: [],
    };
  }
  const random = rng(20261106);
  const walk = (base: number, spread: number, min: number, max: number) => {
    const out: number[] = [];
    let v = base;
    for (let i = 0; i < days; i += 1) {
      v = Math.min(max, Math.max(min, v + (random() - 0.5) * spread));
      out.push(v);
    }
    out[out.length - 1] = base;
    return out;
  };
  const idx = (code: string, close: number) =>
    ({ code, values: walk(close, close * 0.012, close * 0.9, close * 1.08).map((v) => +v.toFixed(2)) });

  return {
    dates,
    indices: [
      idx('000001', 3321.45),
      idx('399001', 10874.32),
      idx('399006', 2183.77),
      idx('000300', 3946.08),
    ],
    sealed_up: walk(68, 14, 18, 120).map((v) => Math.round(v)).slice(0, days - 1).concat(68),
    sealed_down: walk(7, 6, 0, 40).map((v) => Math.round(v)).slice(0, days - 1).concat(7),
    broken_up: walk(21, 9, 4, 60).map((v) => Math.round(v)).slice(0, days - 1).concat(21),
    seal_rate: walk(0.764, 0.09, 0.35, 0.92).map((v) => +v.toFixed(3)).slice(0, days - 1).concat(0.764),
    max_ladder: walk(6, 1.6, 2, 9).map((v) => Math.round(v)).slice(0, days - 1).concat(6),
    ladder_count: walk(6, 3, 0, 18).map((v) => Math.round(v)).slice(0, days - 1).concat(6),
    amount: walk(1.48e12, 1.6e11, 9e11, 2e12).map((v) => Math.round(v)).slice(0, days - 1).concat(1.48e12),
    red_ratio: walk(0.58, 0.12, 0.12, 0.9).map((v) => +v.toFixed(3)).slice(0, days - 1).concat(0.58),
    new_high_63: walk(108, 30, 10, 220).map((v) => Math.round(v)).slice(0, days - 1).concat(108),
    new_low_63: walk(119, 34, 10, 260).map((v) => Math.round(v)).slice(0, days - 1).concat(119),
    promotion_rate: walk(0.24, 0.12, 0.02, 0.6).map((v) => +v.toFixed(3)).slice(0, days - 1).concat(0.17),
  };
}

function reviewPayload(state: DemoState): Review {
  const empty = state === 'empty';
  const partial = state === 'partial';
  return {
    meta: metaFor(state),
    is_trading_day: !empty,
    indices: empty ? [] : INDICES,
    breadth: empty ? { up: 0, flat: 0, down: 0 } : { up: 3120, flat: 460, down: 1832 },
    limit: empty
      ? { sealed_up: 0, broken_up: 0, sealed_down: 0, touched_up: 0, no_limit: 0, out_of_band: 0, seal_rate: null }
      : {
          sealed_up: 68,
          broken_up: partial ? null : 21,
          sealed_down: partial ? null : 7,
          touched_up: partial ? null : 89,
          no_limit: 3,
          out_of_band: 0,
          seal_rate: partial ? null : 0.764,
        },
    market: empty
      ? { amount: 0, new_high_63: 0, new_low_63: 0, prev_limit: { median_pct: 0, up_ratio: 0, samples: 0 } }
      : {
          amount: 1.48e12 + 120e8,
          new_high_63: 108,
          new_low_63: 119,
          prev_limit: { median_pct: 5.2, up_ratio: 0.66, samples: 46 },
        },
    promotion: empty
      ? []
      : [
          { level: 1, base: 18, promoted: 3, rate: 3 / 18 },
          { level: 2, base: 6, promoted: 1, rate: 1 / 6 },
          { level: 3, base: 3, promoted: 1, rate: 1 / 3 },
          { level: 4, base: 2, promoted: 1, rate: 1 / 2 },
          { level: 5, base: 1, promoted: 1, rate: 1 },
        ],
    prev: empty
      ? null
      : {
          as_of: new Date(Date.now() - 2 * DAY).toISOString(),
          sealed_up: 46,
          broken_up: 30,
          sealed_down: 21,
          seal_rate: 0.605,
          amount: 1.42e12,
        },
    series: buildSeries(empty),
    sectors: empty ? [] : SECTORS,
    flows: empty ? { inflow: [], outflow: [] } : FLOWS,
    ladder: empty ? [] : LADDER.map((row) => ({ ...row, is_one_word: false })),
    news: empty ? [] : NEWS.slice(0, 3),
    excluded: {},
  };
}

/* ---------- 个股 ---------- */

const STOCK_BASE: Record<string, { name: string; board: string; industry: string | null; concepts: string[]; price: number; chg_pct: number }> = {
  '002261': { name: '拓维信息', board: '深主板', industry: '软件', concepts: ['AI 应用', '华为链'], price: 26.18, chg_pct: 9.96 },
  '000977': { name: '浪潮信息', board: '深主板', industry: '计算机', concepts: ['算力', '服务器'], price: 48.72, chg_pct: 6.85 },
  '603083': { name: '剑桥科技', board: '沪主板', industry: '通信', concepts: ['光模块', '算力'], price: 41.2, chg_pct: 10.01 },
  '002230': { name: '科大讯飞', board: '深主板', industry: '软件', concepts: ['AI 应用', '算力'], price: 52.36, chg_pct: 9.98 },
  '300750': { name: '宁德时代', board: '创业板', industry: '电池', concepts: ['新能源', '储能'], price: 268.4, chg_pct: 3.15 },
};

function candlesFor(seed: number, price: number): Candle[] {
  const random = rng(seed);
  const out: Candle[] = [];
  let close = price * 0.88;
  for (let i = 119; i >= 0; i -= 1) {
    const drift = (price / close - 1) / (i + 1);
    const open = close * (1 + (random() - 0.5) * 0.012);
    close *= 1 + drift + (random() - 0.5) * 0.03;
    const high = Math.max(open, close) * (1 + random() * 0.01);
    const low = Math.min(open, close) * (1 - random() * 0.01);
    const day = new Date(Date.now() - i * DAY);
    // K 线 time 必须 yyyy-mm-dd（契约同为 ISO），lightweight-charts 不接受 MM-DD
    out.push({
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(2e6 + random() * 6e6),
    });
  }
  const scale = price / out[out.length - 1].close;
  return out.map((candle) => ({
    ...candle,
    open: +(candle.open * scale).toFixed(2),
    high: +(candle.high * scale).toFixed(2),
    low: +(candle.low * scale).toFixed(2),
    close: +(candle.close * scale).toFixed(2),
  }));
}

function stockPayload(state: DemoState, code: string): Stock {
  const base = STOCK_BASE[code];
  if (!base) throw new ApiError('NOT_FOUND', `未找到股票 ${code}`, 404);
  const partial = state === 'partial';
  const random = rng(Number(code) + 31);
  const samples = 6 + Math.floor(random() * 9);
  const hits = Math.max(1, Math.round(samples * (0.45 + random() * 0.35)));
  return {
    meta: metaFor(state),
    code,
    name: base.name,
    board: base.board,
    industry: partial ? null : base.industry,
    concepts: base.concepts,
    trade_status: 'normal',
    price: base.price,
    chg_pct: base.chg_pct,
    turnover_pct: partial ? null : +(1.2 + random() * 18).toFixed(2),
    amount: Math.round((6 + random() * 90) * 1e8),
    mcap: partial ? null : Math.round((110 + random() * 900) * 1e8),
    stats: {
      chg_20d_pct: +((random() - 0.35) * 22).toFixed(2),
      low_open: {
        hits,
        samples,
        rate: partial ? null : +(hits / samples).toFixed(3),
        window: 20,
        version: 'v0.2',
      },
      limit_250: Math.floor(random() * 9),
      max_ladder: Math.floor(random() * 5),
    },
    context: {
      market: { name: '上证指数', chg_pct: 0.32 },
      sector: partial ? null : { name: base.industry ?? '未分类', chg_pct: +(base.chg_pct * 0.42).toFixed(2) },
      relation: base.chg_pct > 0 ? 'resonance' : 'contrarian',
    },
    candles: state === 'empty' ? [] : candlesFor(Number(code) + 7, base.price),
    price_adjustment: 'adj',
  };
}

/* ---------- 筛选 ---------- */

const SCREEN_FIELDS: ScreenOptions['fields'] = [
  { id: 'chg_pct', label: '涨跌幅', unit: '%' },
  { id: 'ladder', label: '连板数', unit: '板' },
  { id: 'turnover_pct', label: '换手率', unit: '%' },
  { id: 'amount', label: '成交额', unit: '元' },
  { id: 'mcap', label: '流通市值', unit: '元' },
  { id: 'limit_20', label: '近 20 日涨停次数', unit: '次' },
];

const SCREEN_ROWS: ScreenRow[] = [
  { code: '002261', name: '拓维信息', industry: '软件', price: 26.18, chg_pct: 9.96, turnover_pct: 22.4, ladder: 6, limit_20: 8, amount: 58e8, mcap: 328e8 },
  { code: '000977', name: '浪潮信息', industry: '计算机', price: 48.72, chg_pct: 6.85, turnover_pct: 9.8, ladder: 4, limit_20: 6, amount: 88e8, mcap: 716e8 },
  { code: '603083', name: '剑桥科技', industry: '通信', price: 41.2, chg_pct: 10.01, turnover_pct: 18.2, ladder: 3, limit_20: 5, amount: 31e8, mcap: 110e8 },
  { code: '002230', name: '科大讯飞', industry: '软件', price: 52.36, chg_pct: 9.98, turnover_pct: 8.4, ladder: 2, limit_20: 4, amount: 72e8, mcap: 1210e8 },
  { code: '300502', name: '新易盛', industry: '通信', price: 88.2, chg_pct: 9.99, turnover_pct: 7.6, ladder: 2, limit_20: 3, amount: 47e8, mcap: 620e8 },
  { code: '300474', name: '景嘉微', industry: '半导体', price: 76.3, chg_pct: 10.0, turnover_pct: 11.2, ladder: 2, limit_20: 2, amount: 32e8, mcap: 310e8 },
  { code: '600410', name: '华胜天成', industry: '计算机', price: 9.86, chg_pct: 10.05, turnover_pct: 14.5, ladder: 1, limit_20: 1, amount: 18e8, mcap: 108e8 },
  { code: '002123', name: '梦网科技', industry: '通信', price: 12.44, chg_pct: 9.98, turnover_pct: 19.8, ladder: 1, limit_20: 2, amount: 16e8, mcap: 96e8 },
  { code: '300229', name: '拓尔思', industry: '软件', price: 18.32, chg_pct: 9.97, turnover_pct: 13.2, ladder: 1, limit_20: 1, amount: 21e8, mcap: 134e8 },
  { code: '601595', name: '上海电影', industry: '传媒', price: 21.6, chg_pct: 10.02, turnover_pct: 6.4, ladder: 1, limit_20: 1, amount: 9.2e8, mcap: 96e8 },
  { code: '603533', name: '掌阅科技', industry: '传媒', price: 23.18, chg_pct: 10.0, turnover_pct: 8.9, ladder: 1, limit_20: 2, amount: 11e8, mcap: 102e8 },
  { code: '300624', name: '万兴科技', industry: '软件', price: 62.4, chg_pct: 9.99, turnover_pct: 12.7, ladder: 1, limit_20: 3, amount: 24e8, mcap: 132e8 },
];

function matches(row: ScreenRow, conditions: ScreenCondition[]): boolean {
  return conditions.every((cond) => {
    const value = row[cond.field];
    if (value === null || value === undefined) return false;
    if (cond.op === 'gte') return value >= cond.value;
    if (cond.op === 'lte') return value <= cond.value;
    return Math.abs(value - cond.value) < 1e-9;
  });
}

/* ---------- 回测 ---------- */

const BT_ASSUMPTIONS = [
  '信号在 T 日收盘后生成，最早 T+1 开盘尝试成交；成交价采用 T+1 开盘价加滑点。',
  '停牌、一字涨停或跌停导致无法成交时跳过该笔，不生成虚假成交。',
  '涨跌停价按证券当日所属板块、风险警示状态和上市阶段计算，不按当前状态回填历史。',
  '价格与收益使用前复权数据；基准为沪深 300 全收益指数（示例数据）。',
  '费用：佣金 0.03%（最低 5 元）、印花税 0.1%（卖出）、滑点 0.1%。',
];

const TRADES: Trade[] = [
  { open: '2026-09-02', close: '2026-09-08', code: '603083', name: '剑桥科技', qty: 1200, price: 36.8, pnl: 5232, fee: 44.2 },
  { open: '2026-08-19', close: '2026-08-26', code: '000977', name: '浪潮信息', qty: 1000, price: 43.26, pnl: -1860, fee: 38.7 },
  { open: '2026-07-30', close: '2026-08-06', code: '002261', name: '拓维信息', qty: 2500, price: 22.4, pnl: 9450, fee: 51.4 },
  { open: '2026-07-09', close: '2026-07-15', code: '300502', name: '新易盛', qty: 900, price: 79.6, pnl: 7740, fee: 32.1 },
  { open: '2026-06-18', close: '2026-06-24', code: '300474', name: '景嘉微', qty: 1100, price: 70.1, pnl: -2420, fee: 36.6 },
];

function buildResult(seed: number, taskId: string): BacktestResult {
  const random = rng(seed);
  const months = 34;
  const equity = [100];
  const benchmark = [100];
  let eq = 100;
  let bm = 100;
  for (let i = 1; i <= months; i += 1) {
    eq *= 1 + 0.0122 + (random() - 0.5) * 0.085;
    bm *= 1 + 0.0062 + (random() - 0.5) * 0.052;
    equity.push(+eq.toFixed(2));
    benchmark.push(+bm.toFixed(2));
  }
  let peak = -Infinity;
  const drawdown = equity.map((value) => {
    peak = Math.max(peak, value);
    return +((value / peak - 1) * 100).toFixed(2);
  });
  const labels = Array.from({ length: months + 1 }, (_, i) => {
    const month = (i % 12) + 1;
    return i % 6 === 0 ? `${2024 + Math.floor(i / 12)}-${String(month).padStart(2, '0')}` : '';
  });
  const segments = [12, 12, 10];
  const years = ['2024', '2025', '2026 YTD'];
  let cursor = 0;
  const yearly = segments.map((n, index) => {
    const a = equity[cursor];
    const b = equity[cursor + n];
    const baseA = benchmark[cursor];
    const baseB = benchmark[cursor + n];
    const stat = {
      year: years[index],
      ret_pct: +((b / a - 1) * 100).toFixed(2),
      bench_pct: +((baseB / baseA - 1) * 100).toFixed(2),
      max_dd_pct: Math.min(...drawdown.slice(cursor, cursor + n + 1)),
      trades: [30, 32, 24][index],
      win_rate: [0.533, 0.562, 0.541][index],
    };
    cursor += n;
    return stat;
  });

  return {
    meta: meta('ok'),
    task_id: taskId,
    metrics: {
      total_pct: +(equity[months] - 100).toFixed(2),
      annual_pct: +((Math.pow(equity[months] / 100, 12 / months) - 1) * 100).toFixed(2),
      bench_pct: +(benchmark[months] - 100).toFixed(2),
      excess_pct: +(equity[months] - benchmark[months]).toFixed(2),
      max_dd_pct: Math.min(...drawdown),
      trades: 86,
      win_rate: 0.547,
      fees: 19400,
    },
    equity,
    benchmark,
    drawdown,
    labels,
    yearly,
    trades: TRADES,
    run_meta: {
      snapshot: 'snapshot-mock-0001',
      strategy: '首板回封 v0.1.3',
      params_hash: 'a7f3c9e1',
      seed,
      range: '2024-01-02 → 2026-11-06',
      benchmark: '沪深 300',
      pool: '示例池',
      timing: 'T 日收盘信号 / T+1 开盘成交',
    },
    assumptions: BT_ASSUMPTIONS,
  };
}

/* ---------- 会话内记忆（观察池 / 选股篮 / 任务 / Agent） ---------- */

const memory = {
  watchlist: ['300750', '002230'],
  basket: ['002261'],
  seq: 1047,
  tasks: [
    { id: 'T-1046', type: '数据质量检查', status: 'running', progress_pct: 62, submitted: '15:33', server: 'worker-2', params: '交易日完整性 / 价格异常 / 复权因子', cancelable: false },
    { id: 'T-1045', type: '批量筛选', status: 'queued', progress_pct: 0, submitted: '15:36', server: 'queue', params: '条件：连板 ≥ 2', cancelable: true },
    { id: 'T-1044', type: '数据更新', status: 'success', progress_pct: 100, submitted: '15:30', finished: '15:32', server: 'worker-1', params: '全A 日线 + 复权因子', cancelable: false, artifact: '数据集 snapshot-mock-0001（5,412 只）' },
    { id: 'T-1043', type: '复盘计算', status: 'success', progress_pct: 100, submitted: '15:32', finished: '15:32', server: 'worker-1', params: '交易日 2026-11-06', cancelable: false, artifact: '复盘数据 2026-11-06' },
    { id: 'T-1042', type: '筛选', status: 'success', progress_pct: 100, submitted: '15:34', finished: '15:34', server: 'worker-1', params: '连板 ≥ 2 · 全A', cancelable: false, artifact: '筛选结果 6 只' },
    { id: 'T-1041', type: '回测', status: 'success', progress_pct: 100, submitted: '14:58', finished: '15:07', server: 'backtest-1', params: '首板回封 v0.1.3 · 观察池 3 只', cancelable: false, artifact: 'BT-mock-0141', result_ready: true },
    { id: 'T-1040', type: '回测', status: 'failed', progress_pct: 47, submitted: '14:40', finished: '14:44', server: 'backtest-2', params: '首板回封 v0.1.3 · 全A', cancelable: false, error: '数据快照缺少 2025-03-14 至 2025-03-18 的停牌记录，成交模拟被中止（退出码 3）。' },
  ] as TaskItem[],
  agent: [] as AgentMessage[],
  agentSeq: 1,
};

const stepAt = new Map<string, number>();

/** 进度由 mock 按时间推进；真实实现里这段逻辑在后端，前端只轮询。 */
function advanceTasks(): void {
  const now = Date.now();
  if (!memory.tasks.some((task) => task.status === 'running')) {
    const queued = memory.tasks.find((task) => task.status === 'queued');
    if (queued) {
      queued.status = 'running';
      queued.progress_pct = 3;
      stepAt.set(queued.id, now + 600);
    }
  }
  for (const task of memory.tasks) {
    if (task.status !== 'running') continue;
    const next = stepAt.get(task.id) ?? now;
    if (now < next) continue;
    task.progress_pct = Math.min(100, task.progress_pct + 12);
    stepAt.set(task.id, now + 700);
    if (task.progress_pct >= 100) {
      task.status = 'success';
      task.progress_pct = 100;
      task.finished = clock();
      task.artifact = task.artifact ?? `${task.id} · 净值 / 回撤 / 分年 / 交易明细`;
      task.result_ready = task.type === '回测';
    }
  }
}

const portfolio = (): Portfolio => ({ watchlist: [...memory.watchlist], basket: [...memory.basket] });

/* ============================================================
   客户端
   ============================================================ */

export function createMockClient(state: DemoState): ApiClient {
  async function guard<T>(make: () => T, ms = 360): Promise<T> {
    if (state === 'loading') return never<T>();
    await delay(ms);
    if (state === 'error') throw new ApiError('UPSTREAM_UNAVAILABLE', '远端计算服务无响应（示例错误，非真实故障）', 503);
    return make();
  }

  return {
    getServiceStatus: () =>
      guard<ServiceStatus>(() => ({
        connection: state === 'stale' || state === 'error' ? 'offline' : 'online',
        as_of: metaFor(state).as_of,
        updated_at: metaFor(state).updated_at,
        coverage: { total: 5412, pct: 99.2 },
        level: metaFor(state).status.level,
      })),

    getReview: (date) => {
      void date;
      return guard<Review>(() => reviewPayload(state));
    },

    getStock: (code) => guard<Stock>(() => stockPayload(state, code)),

    getScreenOptions: () =>
      guard<ScreenOptions>(() => ({
        meta: metaFor(state),
        fields: SCREEN_FIELDS,
        ops: [
          { id: 'gte', label: '大于等于' },
          { id: 'lte', label: '小于等于' },
          { id: 'eq', label: '等于' },
        ],
        max_conditions: 4,
      })),

    runScreen: (conditions) =>
      guard<ScreenResult>(() => {
        const rows = state === 'empty' ? [] : SCREEN_ROWS.filter((row) => matches(row, conditions));
        return {
          meta: metaFor(state),
          rows: state === 'partial'
            ? rows.map((row) => ({ ...row, industry: null, mcap: null, turnover_pct: null }))
            : rows,
          ran_at: clock(),
          elapsed_ms: 412,
        };
      }, 520),

    getBacktestOptions: () =>
      guard<BacktestOptions>(() => ({
        meta: metaFor(state),
        strategies: [
          { id: 'first_seal', label: '首板回封', version: 'v0.1.3' },
          { id: 'ladder_pullback', label: '连板回踩', version: 'v0.1.1' },
        ],
        pools: [
          { id: 'watchlist', label: '观察池', count: state === 'empty' ? 0 : memory.watchlist.length },
          { id: 'basket', label: '选股篮', count: state === 'empty' ? 0 : memory.basket.length },
          { id: 'screen', label: '筛选结果', count: state === 'empty' ? 0 : null },
          { id: 'all', label: '全 A', count: state === 'empty' ? 0 : 5412 },
        ],
        assumptions: BT_ASSUMPTIONS,
        defaults: {
          strategy_id: 'first_seal',
          pool: 'watchlist',
          from: '2024-01-02',
          to: '2026-11-06',
          capital: 100000,
          max_pos: 5,
          fee_rate: 0.0003,
          stamp_rate: 0.001,
          slip_rate: 0.001,
        },
      })),

    submitBacktest: (form: BacktestForm) =>
      guard<TaskItem>(() => {
        if (!form.from || !form.to || form.from >= form.to) {
          throw new ApiError('INVALID_RANGE', '回测区间无效：开始日期必须早于结束日期', 422);
        }
        if (form.capital < 10000) throw new ApiError('INVALID_CAPITAL', '初始资金至少 10,000 元', 422);
        if (form.max_pos < 1 || form.max_pos > 20) throw new ApiError('INVALID_MAX_POS', '最大持仓数需在 1–20 之间', 422);
        const id = `T-${memory.seq++}`;
        const strategy = form.strategy_id === 'first_seal' ? '首板回封 v0.1.3' : '连板回踩 v0.1.1';
        const task: TaskItem = {
          id,
          type: '回测',
          status: 'queued',
          progress_pct: 0,
          submitted: clock(),
          server: 'backtest-mock',
          params: `${strategy} · ${form.pool} · ${form.from} → ${form.to}`,
          cancelable: true,
        };
        memory.tasks.push(task);
        return task;
      }, 420),

    getBacktestResult: (taskId) =>
      guard<BacktestResult>(() => {
        const task = memory.tasks.find((item) => item.id === taskId);
        if (!task) throw new ApiError('NOT_FOUND', `未找到任务 ${taskId}`, 404);
        if (task.status !== 'success' || !task.result_ready) {
          throw new ApiError('NOT_READY', '任务尚未产出可打开的回测报告', 409);
        }
        return buildResult(2026 + Number(taskId.replace(/\D/g, '')), taskId);
      }),

    getTasks: () =>
      guard<TaskList>(() => {
        advanceTasks();
        const items = state === 'empty' ? [] : memory.tasks.map((task) => ({ ...task }));
        return { meta: metaFor(state), items };
      }, 240),

    getNews: () =>
      guard<NewsList>(() => ({
        meta: metaFor(state),
        items: state === 'empty' ? [] : state === 'partial' ? NEWS.filter((item) => item.status !== 'failed') : NEWS,
      })),

    getAgentSession: () =>
      guard<AgentSession>(() => ({ meta: metaFor(state), messages: state === 'empty' ? [] : [...memory.agent] })),

    sendAgentMessage: (text) =>
      guard<AgentMessage>(() => {
        const now = clock();
        memory.agent.push({ id: `M-${memory.agentSeq++}`, role: 'user', text, at: now });
        const wantsBacktest = /回测|backtest/i.test(text);
        const reply: AgentMessage = wantsBacktest
          ? {
              id: `M-${memory.agentSeq++}`,
              role: 'agent',
              at: clock(),
              text: '已按观察池提交日频回测，返回任务号。写操作已在任务中心留痕，可在任务列表查看进度与产物。',
              requires_trace: true,
              tool_calls: [
                { id: 'C-1', tool: 'read_market_review', args: { trade_date: '2026-11-06' }, duration_ms: 128, summary: '返回指数、宽度、涨跌停与连板梯队' },
                { id: 'C-2', tool: 'submit_backtest', args: { strategy: '首板回封 v0.1.3', pool: '观察池' }, duration_ms: 96, summary: '已创建任务 T-1048', task_id: 'T-1048' },
              ],
            }
          : {
              id: `M-${memory.agentSeq++}`,
              role: 'agent',
              at: clock(),
              text: '已读取当日复盘数据。涨停 68 家、炸板 21 家、封板率 76.4%（示例数据，仅演示工具链路）。',
              tool_calls: [
                { id: 'C-1', tool: 'read_market_review', args: { trade_date: '2026-11-06' }, duration_ms: 132, summary: '返回指数、宽度、涨跌停与连板梯队' },
              ],
            };
        memory.agent.push(reply);
        return reply;
      }, 700),

    getStocks: (codes) =>
      guard<Stock[]>(() => codes.filter((code) => STOCK_BASE[code]).map((code) => stockPayload(state, code)), 260),

    getTaskLogs: (taskId) =>
      guard<TaskLogs>(() => {
        const task = memory.tasks.find((item) => item.id === taskId);
        if (!task) throw new ApiError('NOT_FOUND', `未找到任务 ${taskId}`, 404);
        const lines = [
          `${task.submitted} 任务受理（${task.type}）`,
          `${task.submitted} 参数：${task.params}`,
          task.status === 'queued' ? `${task.submitted} 已入队，等待前序任务完成` : `${task.submitted} 开始执行`,
          task.status === 'failed' ? `${task.finished ?? ''} 失败：${task.error ?? '未知错误'}` : `进度 ${task.progress_pct}%`,
          task.finished ? `${task.finished} 状态 ${task.status}` : '仍在运行，日志持续追加',
        ];
        return { task_id: taskId, lines };
      }, 200),

    getPortfolio: () => guard<Portfolio>(() => portfolio(), 120),

    addWatchlist: (code) =>
      guard<Portfolio>(() => {
        if (!memory.watchlist.includes(code)) memory.watchlist.push(code);
        return portfolio();
      }, 120),

    removeWatchlist: (code) =>
      guard<Portfolio>(() => {
        memory.watchlist = memory.watchlist.filter((item) => item !== code);
        return portfolio();
      }, 120),

    addBasket: (code) =>
      guard<Portfolio>(() => {
        if (!memory.basket.includes(code)) memory.basket.push(code);
        return portfolio();
      }, 120),
  };
}
