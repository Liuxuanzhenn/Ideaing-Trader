'use strict';

/* ============================================================
   Quant Workbench Demo v1 — 可点击静态原型
   所有数据均为构造的示例数据，仅用于 PRD 评审，非真实行情。
   ============================================================ */

/* ---------- 工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* 图表色板：中性灰 + 涨跌两色，避免多色 */
const PAL = { text: '#f2f2f2', muted: '#8a8a8a', dim: '#4a4a4a', up: '#e05a6d', down: '#2fa37a', line: '#ffffff14' };
const fmt = (v, d = 2) => Number(v).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 2) => `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}%`;
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
const money = (v) => `${fmt(v, 1)} 亿`;
const seedRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ---------- 示例数据（非真实行情） ---------- */
const INDICES = [
  { name: '上证指数', code: '000001', value: 3321.45, chg: 0.82 },
  { name: '深证成指', code: '399001', value: 10874.32, chg: 1.16 },
  { name: '创业板指', code: '399006', value: 2183.77, chg: 1.74 },
  { name: '沪深 300', code: '000300', value: 3946.08, chg: 0.68 },
];

const BREADTH = { up: 3120, down: 1832, flat: 460, total: 5412 };
const LIMIT_STATS = { up: 68, down: 7, broken: 21, sealRate: 76.4, sample: 89, brokenMissing: false };

const UNIVERSE = [
  { code: '600519', name: '贵州茅台', board: '沪主板', industry: '白酒', concepts: ['消费', '白马'], price: 1685.20, chg: 1.24, turnover: 0.32, amount: 58.4, mcap: 21170 },
  { code: '300750', name: '宁德时代', board: '创业板', industry: '电池', concepts: ['新能源', '储能'], price: 268.40, chg: 3.15, turnover: 1.86, amount: 96.2, mcap: 11820 },
  { code: '002230', name: '科大讯飞', board: '深主板', industry: '软件', concepts: ['AI 应用', '算力'], price: 52.36, chg: 9.98, turnover: 8.40, amount: 72.0, mcap: 1210, ladder: 2, limit20: 4, reason: 'AI 应用 + 算力租赁', seal: '09:41' },
  { code: '603083', name: '剑桥科技', board: '沪主板', industry: '通信', concepts: ['光模块', '算力'], price: 41.20, chg: 10.01, turnover: 18.2, amount: 31.0, mcap: 110, ladder: 3, limit20: 5, reason: '800G 光模块订单（规则推断）', seal: '10:07' },
  { code: '300308', name: '中际旭创', board: '创业板', industry: '光模块', concepts: ['算力', 'CPO'], price: 128.60, chg: -2.40, turnover: 3.2, amount: 65.0, mcap: 1420 },
  { code: '000977', name: '浪潮信息', board: '深主板', industry: '计算机', concepts: ['算力', '服务器'], price: 48.72, chg: 6.85, turnover: 9.8, amount: 88.0, mcap: 716, ladder: 4, limit20: 6, reason: '算力基建招标（规则推断）', seal: '13:22' },
  { code: '002261', name: '拓维信息', board: '深主板', industry: '软件', concepts: ['AI 应用', '华为链'], price: 26.18, chg: 9.96, turnover: 22.4, amount: 58.0, mcap: 328, ladder: 6, limit20: 8, reason: '华为算力合作（规则推断）', seal: '09:33' },
  { code: '300502', name: '新易盛', board: '创业板', industry: '光模块', concepts: ['CPO', '算力'], price: 88.20, chg: 9.99, turnover: 7.6, amount: 47.0, mcap: 620, ladder: 2, limit20: 3, reason: 'CPO 订单预期（规则推断）', seal: '14:05' },
  { code: '300474', name: '景嘉微', board: '创业板', industry: '半导体', concepts: ['GPU', '信创'], price: 76.30, chg: 10.00, turnover: 11.2, amount: 32.0, mcap: 310, ladder: 2, limit20: 2, reason: '国产 GPU 替代（规则推断）', seal: '10:52' },
  { code: '600410', name: '华胜天成', board: '沪主板', industry: '计算机', concepts: ['算力', '信创'], price: 9.86, chg: 10.05, turnover: 14.5, amount: 18.0, mcap: 108, ladder: 1, limit20: 1, reason: '算力中心建设（规则推断）', seal: '11:18' },
  { code: '002123', name: '梦网科技', board: '深主板', industry: '通信', concepts: ['AI 应用', '短信'], price: 12.44, chg: 9.98, turnover: 19.8, amount: 16.0, mcap: 96, ladder: 1, limit20: 2, reason: 'AI 消息服务（规则推断）', seal: '13:47' },
  { code: '300229', name: '拓尔思', board: '创业板', industry: '软件', concepts: ['AI 应用', '数据要素'], price: 18.32, chg: 9.97, turnover: 13.2, amount: 21.0, mcap: 134, ladder: 1, limit20: 1, reason: '数据要素政策（规则推断）', seal: '14:21' },
  { code: '601595', name: '上海电影', board: '沪主板', industry: '传媒', concepts: ['IP', '消费'], price: 21.60, chg: 10.02, turnover: 6.4, amount: 9.2, mcap: 96, ladder: 1, limit20: 1, reason: 'IP 衍生品（规则推断）', seal: '09:58' },
  { code: '603533', name: '掌阅科技', board: '沪主板', industry: '传媒', concepts: ['IP', '短剧'], price: 23.18, chg: 10.00, turnover: 8.9, amount: 11.0, mcap: 102, ladder: 1, limit20: 2, reason: '短剧出海（规则推断）', seal: '10:31' },
  { code: '300624', name: '万兴科技', board: '创业板', industry: '软件', concepts: ['AI 应用', '创意工具'], price: 62.40, chg: 9.99, turnover: 12.7, amount: 24.0, mcap: 132, ladder: 1, limit20: 3, reason: 'AI 创意工具（规则推断）', seal: '14:48' },
  { code: '300059', name: '东方财富', board: '创业板', industry: '非银金融', concepts: ['券商', '互联网金融'], price: 18.66, chg: 2.30, turnover: 4.1, amount: 96.0, mcap: 2480 },
  { code: '600036', name: '招商银行', board: '沪主板', industry: '银行', concepts: ['金融', '高股息'], price: 38.50, chg: 0.95, turnover: 0.42, amount: 22.0, mcap: 9740 },
  { code: '002594', name: '比亚迪', board: '深主板', industry: '汽车', concepts: ['新能源车', '出海'], price: 245.60, chg: 0.42, turnover: 1.1, amount: 62.0, mcap: 8940 },
  { code: '688981', name: '中芯国际', board: '科创板', industry: '半导体', concepts: ['晶圆代工', '国产替代'], price: 92.40, chg: 5.80, turnover: 3.8, amount: 76.0, mcap: 4680 },
  { code: '601012', name: '隆基绿能', board: '沪主板', industry: '光伏', concepts: ['新能源'], price: 18.92, chg: -3.20, turnover: 2.9, amount: 34.0, mcap: 1430 },
  { code: '002415', name: '海康威视', board: '深主板', industry: '电子', concepts: ['安防', 'AI'], price: 30.15, chg: -0.72, turnover: 0.9, amount: 18.0, mcap: 2760 },
  { code: '002049', name: '紫光国微', board: '深主板', industry: '半导体', concepts: ['芯片', '信创'], price: 68.30, chg: 1.10, turnover: 2.2, amount: 19.0, mcap: 580 },
  { code: '601127', name: '赛力斯', board: '沪主板', industry: '汽车', concepts: ['华为链', '新能源车'], price: 92.15, chg: -1.85, turnover: 3.6, amount: 54.0, mcap: 1390 },
  { code: '603259', name: '药明康德', board: '沪主板', industry: '医药', concepts: ['CXO'], price: 58.40, chg: -1.10, turnover: 1.8, amount: 24.0, mcap: 1520 },
];

const SECTORS = [
  { name: '通信', chg: 4.82, flow: 28.6, leader: '603083', up: 38, total: 46 },
  { name: '计算机', chg: 3.95, flow: 21.4, leader: '000977', up: 96, total: 128 },
  { name: '传媒', chg: 3.11, flow: 9.7, leader: '601595', up: 42, total: 61 },
  { name: '电子', chg: 2.46, flow: 15.2, leader: '300474', up: 84, total: 132 },
  { name: '非银金融', chg: 1.38, flow: 12.8, leader: '300059', up: 28, total: 47 },
  { name: '银行', chg: 0.42, flow: -3.1, leader: '600036', up: 18, total: 42 },
  { name: '医药生物', chg: -0.35, flow: -6.4, leader: '603259', up: 96, total: 214 },
  { name: '光伏设备', chg: -2.18, flow: -11.9, leader: '601012', up: 12, total: 58 },
];

const THEMES = [
  { name: '算力 / CPO', count: 9, codes: ['603083', '000977', '002261', '300502'], inferred: true },
  { name: 'AI 应用', count: 7, codes: ['002230', '300229', '300624', '002123'], inferred: true },
  { name: '国产芯片', count: 5, codes: ['300474', '688981', '002049'], inferred: true },
  { name: 'IP / 短剧', count: 4, codes: ['601595', '603533'], inferred: true },
  { name: '华为链', count: 3, codes: ['002261', '601127'], inferred: true },
];

/* 近 20 个交易日涨停 / 炸板家数（示例，交易所标记口径） */
const LIMIT_SERIES = (() => {
  const rng = seedRng(20261106);
  const out = [];
  for (let i = 19; i >= 0; i--) {
    const d = new Date(2026, 10, 6 - i);
    const up = Math.round(42 + Math.sin(i / 2.4) * 9 + (rng() - 0.5) * 14);
    const broken = Math.round(up * (0.22 + rng() * 0.2));
    out.push({ date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, up, broken });
  }
  const last = out[out.length - 1];
  last.up = 68; last.broken = 21;
  return out;
})();

/* 市场资讯 / 事件（原型静态示例，未接入真实资讯源） */
const NEWS = [
  { id: 'N-106', title: '算力基础设施项目招标结果公示，服务器与光模块厂商在列', source: '示例交易所公告', published: '2026-11-06 18:40', fetched: '11-06 19:02', codes: ['000977', '603083'], sectors: ['计算机', '通信'], kind: 'fact', event: '订单', sentiment: '偏多', status: 'full' },
  { id: 'N-105', title: '多地发布数据要素行动方案，涉及公共数据授权运营', source: '示例政策库', published: '2026-11-06 16:10', fetched: '11-06 16:24', codes: ['300229'], sectors: ['计算机'], kind: 'fact', event: '政策', sentiment: '中性偏多', status: 'full' },
  { id: 'N-104', title: '市场传闻某光模块厂商获海外大单，尚未见公司公告', source: '示例财经快讯', published: '2026-11-06 14:55', fetched: '11-06 15:03', codes: ['300502'], sectors: ['通信'], kind: 'inferred', event: '传闻', sentiment: '待核实', status: 'title' },
  { id: 'N-103', title: '白酒板块周度动销数据跟踪：环比小幅回升', source: '示例行业数据', published: '2026-11-06 11:20', fetched: '11-06 11:31', codes: ['600519'], sectors: ['白酒'], kind: 'inferred', event: '数据', sentiment: '中性', status: 'full' },
  { id: 'N-102', title: '交易所对某公司下发关注函，涉及信息披露事项', source: '示例公告库', published: '2026-11-05 20:15', fetched: '11-05 20:22', codes: ['002261'], sectors: ['软件'], kind: 'fact', event: '风险', sentiment: '偏空', status: 'full' },
  { id: 'N-101', title: '新能源车 10 月销量数据发布，同比增速回落', source: '示例行业数据', published: '2026-11-05 18:05', fetched: '11-05 18:17', codes: ['300750', '002594'], sectors: ['电池', '汽车'], kind: 'fact', event: '数据', sentiment: '中性偏空', status: 'full' },
  { id: 'N-100', title: '创业板指样本调整，调入与调出名单公布', source: '示例指数公告', published: '2026-11-04 17:30', fetched: '11-04 17:45', codes: ['300502'], sectors: ['创业板'], kind: 'fact', event: '指数', sentiment: '中性', status: 'full' },
  { id: 'N-099', title: '某产业链调研纪要流出，涉及明年排产预期', source: '示例研究纪要', published: '2026-11-04 09:10', fetched: '—', codes: ['002230'], sectors: ['软件'], kind: 'inferred', event: '调研', sentiment: '待核实', status: 'failed' },
];
const newsFor = (code) => NEWS.filter((n) => !code || n.codes.includes(code));
const NEWS_STATUS = { full: '已抓取全文', title: '仅标题', failed: '源不可用' };
const NEWS_KIND = { fact: '事实', inferred: '规则推断' };

const SECTOR_FLOW = [
  { name: '通信', flow: 28.6, d5: 62.4, d10: 88.1, d20: 104.3 },
  { name: '计算机', flow: 21.4, d5: 51.8, d10: 74.6, d20: 96.2 },
  { name: '电子', flow: 15.2, d5: 33.7, d10: 41.2, d20: 58.9 },
  { name: '非银金融', flow: 12.8, d5: 18.4, d10: 9.6, d20: -4.2 },
  { name: '传媒', flow: 9.7, d5: 22.1, d10: 30.8, d20: 27.4 },
  { name: '银行', flow: -3.1, d5: -8.2, d10: -12.6, d20: -19.4 },
  { name: '医药生物', flow: -6.4, d5: -14.8, d10: -22.3, d20: -31.7 },
  { name: '光伏设备', flow: -11.9, d5: -26.4, d10: -38.9, d20: -52.6 },
];

const BT_ASSUMPTIONS = [
  '信号在 T 日收盘后生成，最早 T+1 开盘尝试成交；成交价采用 T+1 开盘价加滑点。',
  '停牌、一字涨停或跌停导致无法成交时跳过该笔，不生成虚假成交。',
  '涨跌停价按证券当日所属板块、风险警示状态和上市阶段计算，不按当前状态回填历史。',
  '价格与收益使用前复权数据；基准为沪深 300 全收益指数（示例数据）。',
  '费用：佣金 0.03%（最低 5 元）、印花税 0.1%（卖出）、滑点 0.1%。',
  '相同数据快照、策略版本、参数与随机种子应复现相同结果（浮点容差 1e-6）。',
];

/* ---------- 派生数据 ---------- */
const stockByCode = (code) => UNIVERSE.find((s) => s.code === code);

function candlesFor(stock, days = 60) {
  const rng = seedRng(Number(stock.code) + 7);
  const out = [];
  let close = stock.price / (1 + stock.chg / 100);
  for (let i = days - 1; i >= 0; i--) {
    const drift = (stock.chg / 100) * 0.12;
    const open = close * (1 + (rng() - 0.5) * 0.012);
    close = close * (1 + drift + (rng() - 0.5) * 0.035);
    const high = Math.max(open, close) * (1 + rng() * 0.012);
    const low = Math.min(open, close) * (1 - rng() * 0.012);
    out.push({ open, close, high, low, vol: 0.4 + rng() * 0.6 });
  }
  // 令最后一根收盘贴近展示价
  const scale = stock.price / out[out.length - 1].close;
  for (const c of out) { c.open *= scale; c.close *= scale; c.high *= scale; c.low *= scale; }
  return out;
}

function buildBacktest(seedVal) {
  const rng = seedRng(seedVal);
  const months = 34;
  const equity = [100], benchmark = [100];
  let eq = 100, bm = 100;
  for (let i = 1; i <= months; i++) {
    eq *= 1 + 0.0122 + (rng() - 0.5) * 0.085;
    bm *= 1 + 0.0062 + (rng() - 0.5) * 0.052;
    equity.push(eq); benchmark.push(bm);
  }
  const drawdown = [];
  let peak = -Infinity;
  for (const v of equity) { peak = Math.max(peak, v); drawdown.push((v / peak - 1) * 100); }
  const maxDD = Math.min(...drawdown);
  const segments = [12, 12, 10];
  const yearly = [];
  let idx = 0;
  ['2024', '2025', '2026 YTD'].forEach((year, k) => {
    const n = segments[k];
    const a = equity[idx], b = equity[idx + n];
    const ba = benchmark[idx], bb = benchmark[idx + n];
    yearly.push({
      year,
      ret: (b / a - 1) * 100,
      bench: (bb / ba - 1) * 100,
      maxDD: Math.min(...drawdown.slice(idx, idx + n + 1)),
      trades: [30, 32, 24][k],
      win: [53.3, 56.2, 54.1][k],
    });
    idx += n;
  });
  const trades = [
    { open: '2026-09-02', close: '2026-09-08', code: '603083', name: '剑桥科技', side: '买入', qty: 1200, price: 36.80, pnl: 5232, fee: 44.2 },
    { open: '2026-08-19', close: '2026-08-26', code: '000977', name: '浪潮信息', side: '买入', qty: 1000, price: 43.26, pnl: -1860, fee: 38.7 },
    { open: '2026-07-30', close: '2026-08-06', code: '002261', name: '拓维信息', side: '买入', qty: 2500, price: 22.40, pnl: 9450, fee: 51.4 },
    { open: '2026-07-09', close: '2026-07-15', code: '300502', name: '新易盛', side: '买入', qty: 900, price: 79.60, pnl: 7740, fee: 32.1 },
    { open: '2026-06-18', close: '2026-06-24', code: '300474', name: '景嘉微', side: '买入', qty: 1100, price: 70.10, pnl: -2420, fee: 36.6 },
    { open: '2026-05-27', close: '2026-06-03', code: '688981', name: '中芯国际', side: '买入', qty: 800, price: 84.20, pnl: 6560, fee: 29.8 },
    { open: '2026-05-06', close: '2026-05-12', code: '601595', name: '上海电影', side: '买入', qty: 3000, price: 18.90, pnl: 8100, fee: 45.3 },
    { open: '2026-04-15', close: '2026-04-21', code: '600036', name: '招商银行', side: '买入', qty: 600, price: 36.20, pnl: 1380, fee: 18.9 },
  ];
  return {
    equity, benchmark, drawdown, yearly, trades,
    metrics: {
      total: equity[months] - 100,
      annual: (Math.pow(equity[months] / 100, 12 / months) - 1) * 100,
      bench: benchmark[months] - 100,
      excess: (equity[months] - 100) - (benchmark[months] - 100),
      maxDD, trades: 86, win: 54.7, fees: 1.94,
    },
    meta: {
      snapshot: 'snapshot-20261106-1532', strategy: '首板回封 v0.1.3',
      paramsHash: 'a7f3c9e1', seed: 42, range: '2024-01-02 → 2026-11-06',
      benchmark: '沪深 300', pool: '观察池（3 只）', timing: 'T 日收盘信号 / T+1 开盘成交',
    },
  };
}

/* ---------- 初始任务 ---------- */
function initialTasks() {
  return [
    {
      id: 'T-1046', type: '数据质量检查', status: 'running', progress: 62,
      submitted: '11-06 15:33', params: '交易日完整性 / 价格异常 / 复权因子 / 股票状态冲突',
      cancelable: false, server: 'AutoDL · worker-2',
      logs: ['15:33:02 任务受理，远端 worker-2 启动', '15:33:05 交易日完整性检查通过（2016-01-04 至今）', '15:33:18 价格异常检查：3,120 / 5,412 只完成', '15:33:41 复权因子检查：64%'],
    },
    {
      id: 'T-1045', type: '批量筛选', status: 'queued', progress: 0,
      submitted: '11-06 15:36', params: '条件：连板 ≥ 2 · 11-05 补算',
      cancelable: true, server: 'AutoDL · queue',
      logs: ['15:36:10 已入队，等待数据质量检查完成'],
    },
    {
      id: 'T-1044', type: '数据更新', status: 'success', progress: 100,
      submitted: '11-06 15:30', finished: '15:32', params: '全A 日线 + 复权因子 + 股票状态',
      cancelable: false, server: 'AutoDL · worker-1',
      artifact: '数据集 snapshot-20261106-1532（5,412 只）',
      logs: ['15:30:00 任务受理', '15:30:12 拉取日线数据 5,412 只', '15:31:40 复权因子对齐完成', '15:32:03 数据质量抽检通过', '15:32:05 产物已保存：snapshot-20261106-1532'],
    },
    {
      id: 'T-1043', type: '复盘计算', status: 'success', progress: 100,
      submitted: '11-06 15:32', finished: '15:32', params: '交易日 2026-11-06 · 全市场宽度 / 连板 / 板块',
      cancelable: false, server: 'AutoDL · worker-1',
      artifact: '复盘数据 2026-11-06',
      logs: ['15:32:10 复盘计算开始', '15:32:16 市场宽度完成', '15:32:21 连板梯队完成', '15:32:29 板块聚合完成', '15:32:30 计算完成'],
    },
    {
      id: 'T-1042', type: '筛选', status: 'success', progress: 100,
      submitted: '11-06 15:34', finished: '15:34', params: '连板 ≥ 2 · 全A · 数据日 11-06',
      cancelable: false, server: 'AutoDL · worker-1',
      artifact: '筛选结果 6 只',
      logs: ['15:34:02 载入快照 snapshot-20261106-1532', '15:34:04 应用条件：连板 ≥ 2', '15:34:05 返回 6 只，样本日期 2026-11-06'],
    },
    {
      id: 'T-1041', type: '回测', status: 'success', progress: 100,
      submitted: '11-06 14:58', finished: '15:07', params: '首板回封 v0.1.3 · 观察池 3 只 · 2024-01-02 → 2026-11-06',
      cancelable: false, server: 'AutoDL · backtest-1',
      artifact: 'BT-20261106-0141 · 净值 / 回撤 / 交易明细',
      result: buildBacktest(101),
      logs: ['14:58:00 回测任务受理', '14:58:04 数据快照校验通过', '15:02:11 信号生成完成', '15:05:40 成交模拟完成', '15:06:58 报告生成完成', '15:07:00 任务成功'],
    },
    {
      id: 'T-1040', type: '回测', status: 'failed', progress: 47,
      submitted: '11-06 14:40', finished: '14:44', params: '首板回封 v0.1.3 · 全A · 2025-01-01 → 2026-11-06',
      cancelable: false, server: 'AutoDL · backtest-2',
      error: '数据快照缺少 2025-03-14 至 2025-03-18 的停牌记录，成交模拟被中止（退出码 3）。',
      logs: ['14:40:00 回测任务受理', '14:40:06 数据快照校验通过', '14:43:51 成交模拟异常：停牌记录缺失', '14:44:00 任务失败，退出码 3'],
    },
    {
      id: 'T-1039', type: 'Agent 研究任务', status: 'success', progress: 100,
      submitted: '11-06 14:20', finished: '14:25', params: '“统计算力题材近 20 日涨停后次日表现” · 内置 Agent',
      cancelable: false, server: 'AutoDL · worker-1',
      artifact: '研究结果 1 份（样本 32）',
      logs: ['14:20:11 Agent 创建研究任务', '14:20:14 调用 read_limit_up_ladder', '14:24:40 统计完成：样本 32，次日收红率 56.3%', '14:25:00 任务成功'],
    },
  ];
}

/* ---------- 持久化 ---------- */
const LS_KEY = 'qwb-prototype-v1';
function loadPersisted() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
}
function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ watchlist: state.watchlist, savedScreens: state.savedScreens, basket: state.basket, watchMeta: state.watchMeta, settings: state.settings }));
  } catch (e) { /* 隐私模式下不持久化，原型可继续 */ }
}

/* ---------- 状态 ---------- */
const persisted = loadPersisted();
const state = {
  module: 'review',
  sub: 'overview',
  date: '2026-11-06',
  reviewLoading: true,
  selectedStock: null,
  selectedTask: null,
  watchlist: Array.isArray(persisted?.watchlist) ? persisted.watchlist : ['300750', '002230', '603083'],
  basket: Array.isArray(persisted?.basket) ? persisted.basket : ['002261', '000977'],
  watchMeta: persisted?.watchMeta || { '300750': { group: '核心', note: '电池龙头，等回踩' }, '002230': { group: '核心', note: 'AI 应用，看晋级' }, '603083': { group: '弹性', note: '' } },
  settings: persisted?.settings || { benchmark: '沪深300', fee: 0.0003, stamp: 0.001, slip: 0.001 },
  searchQuery: '',
  screenBasketOnly: false,
  savedScreens: Array.isArray(persisted?.savedScreens) && persisted.savedScreens.length
    ? persisted.savedScreens
    : [
        { id: 's1', name: '连板 ≥ 2', conditions: [{ field: 'ladder', op: 'gte', value: 2 }] },
        { id: 's2', name: '换手 ≥ 10% 且涨幅 ≥ 5%', conditions: [{ field: 'turnover', op: 'gte', value: 10 }, { field: 'chg', op: 'gte', value: 5 }] },
      ],
  screen: {
    conditions: [{ field: 'ladder', op: 'gte', value: 2 }],
    results: null, ran: false, loading: false,
    sort: { key: 'ladder', dir: -1 }, page: 1, pageSize: 8,
  },
  btForm: {
    strategy: '首板回封 v0.1.3', pool: '观察池', from: '2024-01-02', to: '2026-11-06',
    capital: 100000, maxPos: 5, fee: 0.0003, stamp: 0.001, slip: 0.001,
  },
  tasks: initialTasks(),
  seq: 1047,
  connection: 'online',
  connectedAt: '11-06 15:32',
  agent: { messages: [], busy: false, pending: null },
  agentOpened: false,
  logTaskId: null,
  tradePage: 1,
  flowWindow: 'd1',
  showBench: true,
  searchOpen: false,
  newsFilter: null,
  newsKind: 'all',
  newsSelected: null,
};

/* ---------- 日期/数据状态 ---------- */
function dataMeta(date) {
  if (date === '2026-11-06') return { mode: 'ok', text: '数据完整 · 15:32 更新', coverage: '5,412 只 · 覆盖率 99.2%' };
  if (date === '2026-11-05') return { mode: 'warn', text: '部分缺失 · 炸板率不可用', coverage: '5,398 只 · 覆盖率 98.9%' };
  if (date === '2026-11-04') return { mode: 'ok', text: '数据完整 · 15:29 更新', coverage: '5,401 只 · 覆盖率 99.0%' };
  return { mode: 'none', text: '非交易日 · 无数据', coverage: '—' };
}

/* ---------- 通用 UI ---------- */
function toast(text, kind = 'info') {
  const box = document.createElement('div');
  box.className = `toast toast-${kind}`;
  box.setAttribute('role', 'status');
  box.innerHTML = `<span aria-hidden="true">${kind === 'ok' ? '✓' : kind === 'bad' ? '!' : kind === 'warn' ? '△' : 'i'}</span><span>${esc(text)}</span>`;
  $('#toasts').appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; box.style.transition = 'opacity .25s'; setTimeout(() => box.remove(), 260); }, 4200);
}

let modalConfirm = null;
function openModal({ title, body, confirmText = '确认', cancelText = '取消', onConfirm = null, danger = false }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  const foot = $('#modal-foot');
  foot.innerHTML = '';
  if (cancelText) {
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.textContent = cancelText;
    cancel.addEventListener('click', closeModal);
    foot.appendChild(cancel);
  }
  if (confirmText) {
    const ok = document.createElement('button');
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    ok.textContent = confirmText;
    ok.addEventListener('click', () => { const fn = modalConfirm; closeModal(); if (fn) fn(); });
    foot.appendChild(ok);
  }
  modalConfirm = onConfirm;
  $('#modal-wrap').hidden = false;
  foot.querySelector('.btn')?.focus();
}
function closeModal() { $('#modal-wrap').hidden = true; modalConfirm = null; }

/* ---------- 模块与子功能 ---------- */
const MODULES = {
  review: { label: '复盘', subs: [['overview', '复盘总览'], ['news', '资讯 / 事件']] },
  stock: { label: '个股', subs: [['overview', '个股详情'], ['watchlist', '观察池'], ['news', '资讯 / 事件']] },
  screener: { label: '筛选', subs: [['list', '条件与结果']] },
  backtest: { label: '回测', subs: [['config', '回测配置'], ['result', '回测结果']] },
  tasks: { label: '任务', subs: [['list', '任务列表']] },
  mcp: { label: 'Agent', subs: [['overview', 'Agent 与 MCP']] },
};
const ROUTE_TO_MODULE = {
  review: ['review', 'overview'], stock: ['stock', 'overview'], watchlist: ['stock', 'watchlist'],
  screener: ['screener', 'list'], backtest: ['backtest', 'config'], result: ['backtest', 'result'],
  tasks: ['tasks', 'list'], mcp: ['mcp', 'overview'], news: ['review', 'news'],
};

function setSub(module, sub) {
  if (!MODULES[module]) return;
  state.module = module;
  state.sub = sub || MODULES[module].subs[0][0];
  if (module === 'stock' && state.sub === 'news') state.newsFilter = state.selectedStock || null;
  if (module === 'review' && state.sub === 'news') state.newsFilter = null;
  renderAll();
}

function openTab(route, opts = {}) {
  const target = ROUTE_TO_MODULE[route] || ROUTE_TO_MODULE.review;
  state.module = target[0];
  state.sub = target[1];
  if (route === 'stock') state.selectedStock = opts.code || state.selectedStock;
  if (route === 'result') state.selectedTask = opts.taskId || state.selectedTask;
  if (route === 'screener' && opts.loadScreen) loadScreen(opts.loadScreen, false);
  if (route === 'news') { state.newsFilter = opts.code || null; state.newsSelected = opts.id || null; }
  if (route === 'review') state.newsFilter = null;
  renderAll();
}

/* ---------- 顶栏 / 侧栏 / 底栏 ---------- */
function renderTop() {
  $('#top-date').textContent = state.date;
  const meta = dataMeta(state.date);
  const chip = $('#top-data-status');
  const dotColor = state.connection === 'offline' ? 'dot-bad' : meta.mode === 'ok' ? 'dot-ok' : meta.mode === 'warn' ? 'dot-warn' : 'dot-neutral';
  const dataText = $('#top-data-text');
  if (dataText) dataText.textContent = state.connection === 'offline' ? '缓存 · 最后成功 11-06' : meta.text.replace('数据完整 · ', '完整 · ').replace('部分缺失 · ', '缺失 · ');
  const statusChip = $('#top-data-status');
  if (statusChip) statusChip.querySelector('.dot').className = `dot ${dotColor}`;
  const online = state.connection === 'online';
  $('#conn-dot').className = `dot ${online ? 'dot-ok' : 'dot-bad'}`;
  $('#conn-label').textContent = online ? '已连接 AutoDL' : '已断连 · 点击重连';
  $('#offline-banner').hidden = online;
  const railDot = $('#rail-conn-dot');
  railDot.className = `dot ${online ? 'dot-ok' : 'dot-bad'}`;
  $('#rail-conn-text').textContent = online ? '远端健康 · 延迟 38ms' : '远端不可达 · 最后成功 11-06';
  if (!online) $('#offline-text').textContent = `最后成功数据 2026-11-06 15:32 · 以下内容为本地缓存并标记为过期，请勿当作实时数据。`;
}

function renderTabs() {
  const box = $('#tabs');
  const mod = MODULES[state.module] || MODULES.review;
  box.innerHTML = mod.subs.map(([id, label]) => `
    <button class="tab ${state.sub === id ? 'active' : ''}" role="tab" aria-selected="${state.sub === id}" data-sub="${id}">${esc(label)}</button>`).join('');
}

function renderSidebar() {
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === state.module));
  const watchNav = $('.nav-item[data-route="watchlist"]');
  if (watchNav) watchNav.title = `观察池（${state.watchlist.length} 只）`;
  $('#task-badge').textContent = state.tasks.filter((t) => ['running', 'queued'].includes(t.status)).length;
}

function renderBottom() {
  const active = state.tasks.filter((t) => ['running', 'queued'].includes(t.status));
  const box = $('#bottom-running');
  if (!active.length) {
    const last = state.tasks.find((t) => t.status === 'success');
    box.innerHTML = `<span class="muted">无运行中任务${last ? ` · 最近完成 ${last.id} ${last.type}` : ''}</span>`;
    return;
  }
  box.innerHTML = active.slice(0, 2).map((t) => `
    <span class="task-mini" data-action="task-focus" data-task="${t.id}" role="button" tabindex="0" style="cursor:pointer">
      <span class="pill ${t.status === 'running' ? 'pill-running' : 'pill-queued'}">${t.status === 'running' ? '运行中' : '排队'}</span>
      <span>${esc(t.id)} · ${esc(t.type)}</span>
      <span class="progress ${t.status === 'success' ? 'done' : ''}"><i style="width:${t.progress}%"></i></span>
      <span class="num">${t.progress}%</span>
    </span>`).join('');
  $$('#bottom-running [data-action]').forEach((el) => {
    el.addEventListener('click', () => { state.selectedTask = el.dataset.task; openTab('tasks'); });
  });
}

/* ---------- 视图渲染入口 ---------- */
function viewHtmlFor() {
  if (state.module === 'review') return state.sub === 'news' ? viewNews() : viewReview();
  if (state.module === 'stock') return state.sub === 'watchlist' ? viewWatchlist() : state.sub === 'news' ? viewNews() : viewStock();
  if (state.module === 'screener') return viewScreener();
  if (state.module === 'backtest') return state.sub === 'result' ? viewResult() : viewBacktest();
  if (state.module === 'tasks') return viewTasks();
  if (state.module === 'mcp') return viewMcp();
  return viewReview();
}

function renderView() {
  const v = $('#main-content');
  if (state.reviewLoading && state.module === 'review' && state.sub === 'overview') v.innerHTML = skeletonReview();
  else v.innerHTML = viewHtmlFor();
}

function skeletonReview() {
  return `<div class="skeleton" aria-busy="true" aria-label="加载复盘数据">
    <div class="sk sk-line" style="width:220px;height:20px"></div>
    <div class="sk sk-line" style="width:340px"></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="sk sk-card"></div><div class="sk sk-card"></div></div>
    <div class="sk sk-chart"></div>
    <div class="sk sk-table"></div>
    <p class="small muted" role="status">正在加载复盘数据…</p>
  </div>`;
}

/* ---------- 复盘 ---------- */
function ladderGroups() {
  const map = new Map();
  UNIVERSE.filter((s) => s.ladder).forEach((s) => {
    if (!map.has(s.ladder)) map.set(s.ladder, []);
    map.get(s.ladder).push(s);
  });
  return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
}

function newsStatusHtml(n) {
  const cls = n.status === 'full' ? 'tag-ok' : n.status === 'title' ? 'tag-warn' : 'tag-bad';
  return `<span class="tag ${cls}">${esc(NEWS_STATUS[n.status])}</span>`;
}
function newsRelatedHtml(n) {
  const stocks = n.codes.map((c) => stockByCode(c)).filter(Boolean);
  return `${stocks.map((st) => `<button class="stock-link" data-action="open-stock" data-code="${st.code}">${esc(st.name)}</button>`).join('')}
    ${n.sectors.map((x) => `<button class="stock-link" data-action="sector" data-sector="${esc(x)}">${esc(x)}</button>`).join('')}`;
}
function newsMetaHtml(n) {
  return `<span class="tag">${esc(NEWS_KIND[n.kind])}</span>
    <span class="tag">${esc(n.event)}</span>
    <span class="tag ${n.sentiment.includes('偏空') ? 'tag-bad' : n.sentiment.includes('偏多') ? 'tag-ok' : ''}">${esc(n.sentiment)}</span>`;
}
function newsCardHtml(n, compact = false) {
  if (compact) {
    return `<div class="news-mini ${state.newsSelected === n.id ? 'selected' : ''}">
      <button class="news-title" data-action="open-news" data-id="${n.id}">${esc(n.title)}</button>
      <div class="news-meta"><span>${esc(n.source)}</span><span>${esc(n.published)} · 抓取 ${esc(n.fetched)}</span>${newsStatusHtml(n)}</div>
      <div class="news-meta">${newsMetaHtml(n)}<button class="mini-link" data-action="news-origin" data-id="${n.id}">原文 ↗</button></div>
      <div class="news-rel small">关联：${newsRelatedHtml(n)}</div>
    </div>`;
  }
  return `<article class="news-item ${state.newsSelected === n.id ? 'selected' : ''}">
    <div class="news-top">
      <span class="news-source">${esc(n.source)}</span>
      <span class="news-time">发布 ${esc(n.published)} · 抓取 ${esc(n.fetched)}</span>
      ${newsStatusHtml(n)}
    </div>
    <button class="news-title" data-action="open-news" data-id="${n.id}">${esc(n.title)}</button>
    <div class="news-meta">${newsMetaHtml(n)}<span class="news-rel">关联：${newsRelatedHtml(n)}</span></div>
    <div class="news-foot">
      <span class="small muted">原型静态示例 · 功能未接入</span>
      <button class="mini-link" data-action="news-origin" data-id="${n.id}">原文 ↗</button>
    </div>
  </article>`;
}
function marketNewsBlock() {
  const items = NEWS.slice(0, 3);
  return `<div class="card section">
    <div class="card-head">
      <span class="card-title">市场资讯 / 事件</span>
      <span class="tag tag-warn">静态示例 · 功能未接入</span>
      <button class="mini-link" style="margin-left:auto" data-action="open-news">查看全部 ${NEWS.length} 条</button>
    </div>
    <div class="news-grid">${items.map((n) => `<article class="news-card" data-action="open-news" data-id="${n.id}">
      <div class="news-top"><span class="news-source">${esc(n.source)}</span><span class="news-time">${esc(n.published)} · 抓取 ${esc(n.fetched)}</span></div>
      <button class="news-title" data-action="open-news" data-id="${n.id}">${esc(n.title)}</button>
      <div class="news-meta">${newsMetaHtml(n)}${newsStatusHtml(n)}</div>
      <div class="news-foot"><span class="news-rel">${newsRelatedHtml(n)}</span><button class="mini-link" data-action="news-origin" data-id="${n.id}">原文 ↗</button></div>
    </article>`).join('')}</div>
    <div class="card-note">来源、发布时间与抓取时间均为构造数据；事实与规则推断分开标注，不构成荐股。</div>
  </div>`;
}
function stockNewsBlock(stock) {
  const items = newsFor(stock.code).slice(0, 3);
  return `<div class="ctx-section">
    <div class="ctx-label" style="display:flex;align-items:center;gap:6px">相关资讯 / 事件
      <button class="mini-link" style="margin-left:auto" data-action="open-news" data-code="${stock.code}">全部</button>
    </div>
    ${items.length ? items.map((n) => newsCardHtml(n, true)).join('') : '<div class="ctx-empty" style="padding:10px 0">暂无相关事件（示例数据）</div>'}
    <div class="card-note">静态示例 · 功能未接入</div>
  </div>`;
}
function viewNews() {
  const code = state.newsFilter;
  const stock = code ? stockByCode(code) : null;
  const base = code ? newsFor(code) : NEWS;
  const items = state.newsKind === 'all' ? base : base.filter((n) => n.kind === state.newsKind);
  return `
  <div class="view-head">
    <div><h2 class="view-title">资讯 / 事件</h2><div class="view-sub">消息面工作区 · 静态示例，未接入真实资讯源</div></div>
    <div class="view-actions">
      ${stock ? `<span class="tag">筛选：${esc(stock.name)} <button class="mini-link" data-action="news-all">×</button></span>` : ''}
      <div class="segmented" role="tablist" aria-label="资讯类型">
        ${[['all', '全部'], ['fact', '事实'], ['inferred', '规则推断']].map(([k, t]) => `<button class="seg-item ${state.newsKind === k ? 'active' : ''}" role="tab" aria-selected="${state.newsKind === k}" data-action="news-kind" data-kind="${k}">${t}</button>`).join('')}
      </div>
    </div>
  </div>
  <div class="banner banner-info"><span class="banner-ico">i</span><div class="banner-body"><strong>原型静态示例</strong> · 功能未接入真实资讯源；来源、发布时间、抓取时间、关联对象均为构造数据。事实与规则推断分列，不构成荐股或投资建议。</div></div>
  ${items.length ? `<div class="news-list">${items.map((n) => newsCardHtml(n)).join('')}</div>` : `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-review"/></svg></div><h4>没有匹配的资讯</h4><p>当前筛选条件下暂无事件，可切换“全部”或清除股票筛选。</p><div class="empty-actions"><button class="btn" data-action="news-all">查看全部</button></div></div>`}
  <div class="card-note">数据状态：已抓取全文 / 仅标题 / 源不可用。原文入口为占位，不跳转外部链接。</div>`;
}
function openNews(code = null, id = null) {
  state.newsFilter = code || null;
  state.newsKind = 'all';
  state.newsSelected = id || null;
  state.module = code ? 'stock' : 'review';
  state.sub = 'news';
  renderAll();
}

function sectorFlowBlock() {
  const key = state.flowWindow || 'd1';
  const val = (x) => (key === 'd1' ? x.flow : key === 'd5' ? x.d5 : key === 'd10' ? x.d10 : x.d20);
  const rows = SECTOR_FLOW.slice().sort((a, b) => val(b) - val(a));
  const label = key === 'd1' ? '今日' : `${key.slice(1)} 日累计`;
  return `<div class="card section">
    <div class="card-head">
      <span class="card-title">板块表现</span>
      <div class="segmented" style="margin-left:auto" role="tablist" aria-label="资金流周期">
        ${[['d1', '今日'], ['d5', '5 日'], ['d10', '10 日'], ['d20', '20 日']].map(([k, t]) => `<button class="seg-item ${key === k ? 'active' : ''}" role="tab" aria-selected="${key === k}" data-action="flow-window" data-window="${k}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="table-wrap" style="margin-top:10px">
      <table class="data">
        <thead><tr><th>板块</th><th class="num">涨跌幅</th><th class="num">${esc(label)}净流入</th><th class="num">上涨/家数</th><th>代表股</th></tr></thead>
        <tbody>
          ${rows.map((x, i) => { const base = SECTORS.find((v) => v.name === x.name) || {}; return `<tr data-action="sector" data-sector="${esc(x.name)}">
            <td><span class="rank ${i < 3 ? 'rank-top' : ''}">${i + 1}</span> ${esc(x.name)}</td>
            <td class="num ${cls(base.chg)}">${pct(base.chg)}</td>
            <td class="num ${cls(val(x))}">${val(x) > 0 ? '+' : ''}${fmt(val(x), 1)} 亿</td>
            <td class="num">${base.up}/${base.total}</td>
            <td class="muted">${esc((stockByCode(base.leader) || {}).name || '—')}</td>
          </tr>`; }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function reviewVizGrid(warn) {
  return `<div class="viz-grid section">
    ${vizCard('涨跌幅分布', histogramSvg([
      { label: '≤-7', v: 96, up: false }, { label: '-7~-3', v: 412, up: false }, { label: '-3~0', v: 1324, up: false },
      { label: '0', v: 460, up: null }, { label: '0~3', v: 2180, up: true }, { label: '3~7', v: 712, up: true },
      { label: '7~涨停', v: 228, up: true },
    ], { label: '涨跌幅分布' }), '全A 5,412 只 · 7 个涨跌幅区间')}
    ${vizCard('封板时间分布', warn ? '<div class="viz-empty">数据缺失 · 源失败</div>' : histogramSvg([
      { label: '9:30-10:00', v: 24, up: true }, { label: '10:00-11:30', v: 18, up: true },
      { label: '13:00-14:00', v: 14, up: true }, { label: '14:00-14:45', v: 8, up: true },
      { label: '尾盘', v: 4, up: true }, { label: '炸板', v: 21, up: false },
    ], { label: '封板时间分布' }), warn ? '2026-11-05 原因源失败' : '涨停 68 只 / 炸板 21 只')}
    ${vizCard('近 20 日涨停 / 炸板', multiLineSvg([
      { name: '涨停', values: LIMIT_SERIES.map((x) => x.up), color: PAL.up, width: 1.5, fill: true },
      { name: '炸板', values: LIMIT_SERIES.map((x) => x.broken), color: PAL.muted, width: 1.1 },
    ], { labels: LIMIT_SERIES.map((x) => x.date) }), '交易所涨停 / 炸板标记', seriesLegend([{ name: '涨停', color: PAL.up }, { name: '炸板', color: PAL.muted }]))}
    ${vizCard('板块资金流热力图', heatmapSvg(SECTOR_FLOW.map((x) => ({ name: x.name, values: [x.flow, x.d5, x.d10, x.d20] })), 4, { labels: ['今日', '5 日', '10 日', '20 日'] }), '净流入 · 亿元 · 红流入 / 绿流出')}
  </div>`;
}

function viewReview() {
  const meta = dataMeta(state.date);
  if (meta.mode === 'none') {
    return `<div class="view-head"><div><h2 class="view-title">盘后复盘</h2><div class="view-sub">交易日历 · 数据状态</div></div></div>
      <div class="empty-state">
        <div class="empty-ico"><svg><use href="#i-review"/></svg></div>
        <h4>${state.date} 无复盘数据</h4>
        <p>该日期不是交易日，或数据尚未更新。</p>
        <div class="empty-actions"><button class="btn btn-primary" data-action="go-latest">返回最近交易日 2026-11-06</button><button class="btn" data-action="data-status">数据状态</button></div>
      </div>`;
  }
  const groups = ladderGroups();
  const limitStocks = UNIVERSE.filter((s) => s.ladder).sort((a, b) => b.ladder - a.ladder);
  const warn = meta.mode === 'warn';
  return `
  <div class="view-head">
    <div>
      <h2 class="view-title">盘后复盘 · ${state.date}${state.connection === 'offline' ? '<span class="tag tag-warn">缓存 · 已过期</span>' : ''}</h2>
      <div class="view-sub">数据日期 ${state.date} · ${state.date === '2026-11-05' ? '11-05 15:30' : state.date === '2026-11-04' ? '11-04 15:29' : '11-06 15:32'} 更新 · ${esc(meta.coverage)}</div>
    </div>
    <div class="view-actions">
      <label class="field-inline">交易日
        <select id="review-date" aria-label="选择复盘交易日">
          <option value="2026-11-06" ${state.date === '2026-11-06' ? 'selected' : ''}>2026-11-06 · 最近交易日</option>
          <option value="2026-11-05" ${state.date === '2026-11-05' ? 'selected' : ''}>2026-11-05 · 部分缺失</option>
          <option value="2026-11-04" ${state.date === '2026-11-04' ? 'selected' : ''}>2026-11-04</option>
          <option value="2026-11-07" ${state.date === '2026-11-07' ? 'selected' : ''}>2026-11-07 · 周六</option>
        </select>
      </label>
      <button class="btn" data-route="watchlist">观察池</button>
      <button class="btn" data-action="refresh-review">刷新</button>
    </div>
  </div>

  ${warn ? `<div class="banner banner-warn"><span class="banner-ico">△</span><div class="banner-body"><strong>数据部分缺失</strong>：涨停原因源调用失败，炸板率与题材归类暂不可用；其他指标完整。Agent 查询将返回完整性提示。<div class="small">数据日期 2026-11-05 · 失败源：limit_reason（重试 2 次后放弃）</div></div><button class="btn btn-small" data-action="data-status">数据状态</button></div>` : ''}
  ${state.connection === 'offline' ? `<div class="banner banner-bad"><span class="banner-ico">!</span><div class="banner-body"><strong>远端断连</strong>：展示的是 2026-11-06 15:32 的本地缓存，不能视为实时数据。重连后可查询远端任务和最新结果。</div><button class="btn btn-small" data-action="reconnect">重连</button></div>` : ''}

  <div class="index-strip">
    ${INDICES.map((i) => `<div class="index-item"><div class="index-name"><span>${esc(i.name)}</span><span class="num">${i.code}</span></div><div class="index-value">${fmt(i.value)}</div><div class="index-chg ${cls(i.chg)}">${pct(i.chg)}</div></div>`).join('')}
  </div>

  ${marketNewsBlock()}

  <div class="grid grid-2 section">
    <div class="card">
      <div class="card-head"><span class="card-title">市场宽度</span><span class="card-sub">全A 5,412 只</span></div>
      <div class="breadth">
        <div class="breadth-bar" aria-label="上涨下跌家数比例">
          <i style="width:${(BREADTH.up / BREADTH.total * 100).toFixed(1)}%;background:var(--up)"></i>
          <i style="width:${(BREADTH.flat / BREADTH.total * 100).toFixed(1)}%;background:#4a4a4a"></i>
          <i style="width:${(BREADTH.down / BREADTH.total * 100).toFixed(1)}%;background:var(--down)"></i>
        </div>
        <div class="breadth-legend"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--up);margin-right:4px"></i>上涨 <b>${fmt(BREADTH.up, 0)}</b></span><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#4a4a4a;margin-right:4px"></i>平盘 <b>${fmt(BREADTH.flat, 0)}</b></span><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--down);margin-right:4px"></i>下跌 <b>${fmt(BREADTH.down, 0)}</b></span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">涨跌停与封板</span><span class="card-sub">样本 ${LIMIT_STATS.sample} 只</span></div>
      <div class="limit-stats">
        <div class="limit-stat"><div class="k">涨停</div><div class="v up">${LIMIT_STATS.up}</div></div>
        <div class="limit-stat"><div class="k">跌停</div><div class="v down">${LIMIT_STATS.down}</div></div>
        <div class="limit-stat"><div class="k">炸板</div><div class="v ${warn ? 'muted' : ''}">${warn ? '—' : LIMIT_STATS.broken}</div></div>
        <div class="limit-stat"><div class="k">封板率 <button class="metric-link" data-action="metric-info" data-metric="seal_rate">口径</button></div><div class="v ${warn ? 'muted' : ''}">${warn ? '—' : LIMIT_STATS.sealRate + '%'}</div></div>
        ${warn ? '<span class="tag tag-warn">数据缺失</span>' : ''}
      </div>
    </div>
  </div>

  ${reviewVizGrid(warn)}

  <div class="card section">
    <div class="card-head"><span class="card-title">连板梯队</span><span class="card-sub">最高 ${groups[0]?.[0] || 0} 板 · ${limitStocks.length} 只涨停股</span></div>
    <div class="ladder">
      ${groups.map(([lvl, arr]) => `<button class="ladder-chip" data-action="select-stock" data-code="${arr[0].code}"><span class="lvl">${lvl} 板</span><span class="names">${arr.map((s) => esc(s.name)).join(' · ')}</span></button>`).join('')}
    </div>
    
  </div>

  ${sectorFlowBlock()}

  <div class="grid grid-2 section">
    <div class="card">
      <div class="card-head"><span class="card-title">涨停题材</span><span class="card-sub">规则推断 · 非交易所事实</span></div>
      ${warn ? '<div class="empty-state" style="padding:24px 12px"><div class="empty-ico">△</div><h4>题材归类不可用</h4><p>原因文本源调用失败，本日不展示模型推断结果，避免与事实混淆。</p></div>' : THEMES.map((t) => `<div style="margin-bottom:10px"><div class="small muted" style="margin-bottom:4px">${esc(t.name)} · ${t.count} 只</div><div style="display:flex;flex-wrap:wrap;gap:4px">${t.codes.map((c) => { const s = stockByCode(c); return s ? `<button class="stock-link" data-action="select-stock" data-code="${s.code}">${esc(s.name)}<span class="c">${s.code}</span></button>` : ''; }).join('')}</div></div>`).join('')}
      
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">涨停股票</span><span class="card-sub">单击预览 · 双击打开个股</span></div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>股票</th><th>行业</th><th class="num">连板</th><th>封板时间</th><th>涨停原因（规则推断）</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          ${limitStocks.map((s) => `<tr data-stock="${s.code}" class="${state.selectedStock === s.code ? 'selected' : ''}">
            <td><div class="stock-cell"><span class="n">${esc(s.name)}</span><span class="c">${s.code} · ${esc(s.board)}</span></div></td>
            <td>${esc(s.industry)}</td>
            <td class="num">${s.ladder} 板</td>
            <td class="num">${s.seal || '—'}</td>
            <td class="muted">${esc(s.reason || '—')}</td>
            <td><div class="row-actions"><button class="mini-link" data-action="open-stock" data-code="${s.code}">打开</button><button class="mini-link" data-action="add-watch" data-code="${s.code}">${state.watchlist.includes(s.code) ? '已观察' : '观察'}</button><button class="mini-link" data-action="basket-add" data-code="${s.code}">${state.basket.includes(s.code) ? '已选' : '选股篮'}</button></div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    
  </div>`;
}

/* ---------- 图表（内联 SVG，示例数据） ---------- */
function candleSvg(stock) {
  const cs = candlesFor(stock);
  const W = 560, H = 300, left = 10, right = 52, priceTop = 14, priceH = 204, volTop = 246, volH = 38;
  const lows = cs.map((c) => c.low), highs = cs.map((c) => c.high);
  const min = Math.min(...lows), max = Math.max(...highs);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad, hi = max + pad;
  const y = (v) => priceTop + (hi - v) / (hi - lo) * priceH;
  const bw = (W - left - right) / cs.length;
  const maxVol = Math.max(...cs.map((c) => c.vol));
  let ma = [], sum = 0;
  cs.forEach((c, i) => { sum += c.close; if (i >= 20) sum -= cs[i - 20].close; if (i >= 19) ma.push([i, sum / 20]); });
  const maPath = ma.map(([i, v], k) => `${k ? 'L' : 'M'}${(left + i * bw + bw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const bars = cs.map((c, i) => {
    const x = left + i * bw;
    const up = c.close >= c.open;
    const col = up ? PAL.up : PAL.down;
    const yO = y(c.open), yC = y(c.close);
    const bodyTop = Math.min(yO, yC), bodyH = Math.max(1.2, Math.abs(yO - yC));
    const vh = Math.max(1, (c.vol / maxVol) * volH);
    const wickX = x + bw / 2;
    return `<line x1="${wickX.toFixed(1)}" y1="${y(c.high).toFixed(1)}" x2="${wickX.toFixed(1)}" y2="${y(c.low).toFixed(1)}" stroke="${col}" stroke-width=".9"/>
      <rect x="${(x + bw * 0.18).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${Math.max(1.5, bw * 0.64).toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${up ? col : col}" opacity=".95"/>
      <rect x="${(x + bw * 0.18).toFixed(1)}" y="${(volTop + volH - vh).toFixed(1)}" width="${Math.max(1.5, bw * 0.64).toFixed(1)}" height="${vh.toFixed(1)}" fill="${col}" opacity=".22"/>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(stock.name)} 近 60 个交易日示例日K">
    <line x1="${left}" y1="${priceTop + priceH}" x2="${W - right}" y2="${priceTop + priceH}" stroke="${PAL.line}"/>
    <line x1="${left}" y1="${volTop - 8}" x2="${W - right}" y2="${volTop - 8}" stroke="${PAL.line}" stroke-dasharray="2 4"/>
    ${bars}
    <path d="${maPath}" fill="none" stroke="${PAL.muted}" stroke-width="1" opacity=".65" stroke-linejoin="round"/>
    <text x="${left + 2}" y="${priceTop + 10}">最高 ${fmt(max)}</text>
    <text x="${left + 2}" y="${priceTop + priceH - 2}">最低 ${fmt(min)}</text>
    <text x="${W - right + 4}" y="${priceTop + 10}">MA20</text>
    <text x="${W - right + 4}" y="${volTop + 10}">量</text>
    <text x="${left + 2}" y="${H - 6}">60 个交易日前</text>
    <text x="${W - right - 60}" y="${H - 6}">最近交易日</text>
  </svg>`;
}

function multiLineSvg(series, opts = {}) {
  const { unit = '', fill = true, yMin, yMax, labels = [] } = opts;
  const w = 560, h = 300, left = 40, right = 12, top = 16, bottom = 26;
  const n = series[0].values.length;
  const all = series.flatMap((x) => x.values);
  const lo = yMin !== undefined ? yMin : Math.min(...all);
  const hi = yMax !== undefined ? yMax : Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1;
  const y = (v) => top + (1 - (v - (lo - pad)) / (hi - lo + pad * 2)) * (h - top - bottom);
  const x = (i) => left + (i / (n - 1)) * (w - left - right);
  const grid = [0, 0.5, 1].map((k) => {
    const v = (lo - pad) + k * (hi - lo + pad * 2);
    return `<line x1="${left}" y1="${y(v).toFixed(1)}" x2="${w - right}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.06)"/>
      <text x="2" y="${(y(v) + 4).toFixed(1)}">${v.toFixed(0)}${unit}</text>`;
  }).join('');
  const paths = series.map((ser) => {
    const d = ser.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = fill && ser.fill ? `<path d="${d} L${x(n - 1).toFixed(1)},${(h - bottom).toFixed(1)} L${left},${(h - bottom).toFixed(1)} Z" fill="${ser.color}" opacity=".06"/>` : '';
    return `${area}<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="${ser.width || 1.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const ticks = [0, Math.floor(n / 2), n - 1].map((i) => `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${labels[i] || ''}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map((x) => x.name).join(' / '))}">${grid}${paths}${ticks}</svg>`;
}

function seriesLegend(series) {
  return `<span class="legend">${series.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</span>`;
}

function heatmapSvg(rows, cols, opts = {}) {
  const w = 560, h = 300, left = 68, top = 20, right = 10, bottom = 8, gap = 4;
  const cw = (w - left - right - gap * (cols - 1)) / cols;
  const rh = (h - top - bottom - gap * (rows.length - 1)) / rows.length;
  const all = rows.flatMap((r) => r.values);
  const max = Math.max(...all.map(Math.abs), 1);
  const labels = opts.labels || [];
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="热力图">
    ${labels.map((l, i) => `<text x="${(left + i * (cw + gap) + cw / 2).toFixed(1)}" y="13" text-anchor="middle">${esc(l)}</text>`).join('')}
    ${rows.map((r, ri) => `
      <text x="0" y="${(top + ri * (rh + gap) + rh / 2 + 4).toFixed(1)}">${esc(r.name)}</text>
      ${r.values.map((v, ci) => {
        const t = Math.abs(v) / max;
        const col = v >= 0 ? '224, 90, 109' : '47, 163, 122';
        return `<rect x="${(left + ci * (cw + gap)).toFixed(1)}" y="${(top + ri * (rh + gap)).toFixed(1)}" width="${cw.toFixed(1)}" height="${rh.toFixed(1)}" rx="4" fill="rgba(${col}, ${(0.08 + t * 0.72).toFixed(2)})"/>
          <text x="${(left + ci * (cw + gap) + cw / 2).toFixed(1)}" y="${(top + ri * (rh + gap) + rh / 2 + 4).toFixed(1)}" text-anchor="middle" fill="#f5f5f5" opacity="${t > .35 ? .95 : .55}">${v > 0 ? '+' : ''}${v.toFixed(1)}</text>`;
      }).join('')}`).join('')}
  </svg>`;
}

function vizCard(title, body, note, legend = '') {
  return `<div class="viz-card">
    <div class="chart-head"><span class="card-title">${esc(title)}</span>${legend || ''}</div>
    <div class="viz-body">${body}</div>
    <div class="card-note">${esc(note)}</div>
  </div>`;
}

function histogramSvg(buckets, opts = {}) {
  const w = 560, h = 300, left = 10, right = 10, top = 24, bottom = 28;
  const max = Math.max(...buckets.map((b) => b.v), 1);
  const bw = (w - left - right) / buckets.length;
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.label || '分布')}">
    ${buckets.map((b, i) => {
      const bh = (b.v / max) * (h - top - bottom);
      const isUp = b.up;
      const fill = isUp === true ? '#e05a6d' : isUp === false ? '#2fa37a' : '#4a4a4a';
      return `<rect x="${(left + i * bw + 3).toFixed(1)}" y="${(h - bottom - bh).toFixed(1)}" width="${Math.max(2, bw - 6).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${fill}" opacity=".75"/>
        <text x="${(left + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(b.label)}</text>
        <text x="${(left + i * bw + bw / 2).toFixed(1)}" y="${(h - bottom - bh - 6).toFixed(1)}" text-anchor="middle" opacity="${b.v ? .9 : 0}">${b.v}</text>`;
    }).join('')}
  </svg>`;
}

function sparklineSvg(stock, w = 280, h = 56) {
  const cs = candlesFor(stock, 30).map((c) => c.close);
  const min = Math.min(...cs), max = Math.max(...cs);
  const x = (i) => 2 + (i / (cs.length - 1)) * (w - 4);
  const y = (v) => 4 + (1 - (v - min) / (max - min || 1)) * (h - 8);
  const path = cs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const color = cs[cs.length - 1] >= cs[0] ? PAL.up : PAL.down;
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="近 30 日示例走势">
    <path d="${path} L${w - 2},${h - 2} L2,${h - 2} Z" fill="${color}" opacity=".08"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="1.6"/>
  </svg>`;
}

/* ---------- 个股统计（示例，带窗口与样本数） ---------- */
const statCache = new Map();
function statsFor(stock) {
  if (statCache.has(stock.code)) return statCache.get(stock.code);
  const rng = seedRng(Number(stock.code) + 31);
  const samples = 6 + Math.floor(rng() * 9);
  const hits = Math.max(1, Math.round(samples * (0.45 + rng() * 0.35)));
  const out = {
    lowOpenHits: hits,
    lowOpenSamples: samples,
    lowOpenRate: (hits / samples) * 100,
    chg20: (rng() - 0.35) * 22,
    limit250: (stock.limit20 || 0) * 3 + Math.floor(rng() * 4),
    maxLadder: stock.ladder || Math.floor(rng() * 2),
    dragon: Math.floor(rng() * 4),
    flow: (rng() - 0.4) * 6,
  };
  statCache.set(stock.code, out);
  return out;
}

/* ---------- 个股 ---------- */
function viewStock() {
  const s = state.selectedStock && stockByCode(state.selectedStock);
  if (!s) {
    return `<div class="view-head"><div><h2 class="view-title">个股终端</h2><div class="view-sub">从复盘、筛选或观察池选择一只股票</div></div></div>
      <div class="empty-state"><div class="empty-ico"><svg><use href="#i-stock"/></svg></div><h4>尚未选择股票</h4><p>单击预览，双击打开个股。</p>
      <div class="empty-actions"><button class="btn btn-primary" data-action="go-review">去复盘选股</button><button class="btn" data-route="watchlist">打开观察池</button></div>
      <div class="small muted" style="margin-top:14px">快速打开：</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:4px">${['300750','600519','002230','603083'].map((c) => { const s = stockByCode(c); return `<button class="saved-chip" data-action="open-stock" data-code="${s.code}">${esc(s.name)} <span class="muted">${s.code}</span></button>`; }).join('')}</div></div>`;
  }
  const st = statsFor(s);
  const inWatch = state.watchlist.includes(s.code);
  const flowRng = seedRng(Number(s.code) + 11);
  const flowSeries = Array.from({ length: 20 }, (_, i) => { const v = +((flowRng() - 0.45) * 3.2).toFixed(2); return { label: i % 4 === 0 ? `${i + 1}` : '', v: Math.abs(v) * 10, up: v >= 0 }; });
  const limitDates = ['2026-10-28', '2026-09-12', '2026-08-21', '2026-07-15'];
  const histLimit = Array.from({ length: Math.min(4, Math.max(1, st.limit250)) }, (_, i) => ({
    date: limitDates[i],
    type: i === 0 && s.ladder ? `${s.ladder} 连板` : i % 2 ? '首板' : '回封',
    ladder: Math.max(1, (s.ladder || 1) - i),
    next: i % 2 ? 2.4 : -1.2,
  }));
  return `
  <div class="view-head">
    <div>
      <h2 class="view-title">${esc(s.name)} <span class="num muted" style="font-size:15px">${s.code}</span></h2>
      <div class="view-sub">${esc(s.board)} · 正常交易 · ${s.concepts.map(esc).join(' · ')}</div>
    </div>
    <div class="view-actions">
      <button class="btn" data-route="watchlist">观察池</button>
      <button class="btn ${inWatch ? '' : 'btn-primary'}" data-action="toggle-watch" data-code="${s.code}">${inWatch ? '移出观察池' : '+ 加入观察池'}</button>
      <button class="btn" data-action="research-task" data-code="${s.code}">创建研究任务</button>
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">关键统计</span><span class="card-sub">窗口与样本均展示</span></div>
    <div class="grid grid-4">
      <div class="stat"><div class="stat-label">现价</div><div class="stat-value ${cls(s.chg)}">${fmt(s.price)} <span style="font-size:13px">${pct(s.chg)}</span></div><div class="stat-sub">示例收盘价 · 2026-11-06</div></div>
      <div class="stat"><div class="stat-label">近 20 日涨幅</div><div class="stat-value ${cls(st.chg20)}" style="font-size:18px">${pct(st.chg20, 1)}</div><div class="stat-sub">窗口 20 个交易日</div></div>
      <div class="stat"><div class="stat-label">低开高走率 <button class="metric-link" data-action="metric-info" data-metric="low_open_high_close">口径</button></div><div class="stat-value" style="font-size:18px">${st.lowOpenRate.toFixed(1)}%</div><div class="stat-sub ${st.lowOpenSamples < 10 ? 'warn' : ''}">${st.lowOpenHits}/${st.lowOpenSamples} 笔 · ${st.lowOpenSamples < 10 ? '样本不足' : '样本满足阈值'}</div></div>
      <div class="stat"><div class="stat-label">近 250 日涨停</div><div class="stat-value" style="font-size:18px">${st.limit250} 次</div><div class="stat-sub">最高连板 ${st.maxLadder} 板</div></div>
    </div>
  </div>

  <div class="viz-grid">
    ${vizCard('日 K · 成交量', candleSvg(s), '60 个交易日 · 前复权 · 示例', seriesLegend([{ name: '涨', color: PAL.up }, { name: '跌', color: PAL.down }, { name: 'MA20', color: PAL.muted }]))}
    ${vizCard('20 日资金净流入', histogramSvg(flowSeries, { label: '资金净流入' }), '单位：亿元 · 正值红 / 负值绿')}
  </div>

  <div class="grid grid-2 section">
    <div class="card">
      <div class="card-head"><span class="card-title">历史涨停 / 连板记录</span><span class="card-sub">近 250 日 · 示例</span></div>
      <div class="table-wrap">
        <table class="data"><thead><tr><th>日期</th><th>类型</th><th class="num">连板</th><th class="num">次日涨跌</th></tr></thead>
        <tbody>${histLimit.map((h) => `<tr><td class="num">${h.date}</td><td>${h.type}</td><td class="num">${h.ladder}</td><td class="num ${cls(h.next)}">${pct(h.next)}</td></tr>`).join('')}</tbody></table>
      </div>
      
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">资金与龙虎榜</span><span class="card-sub">近 20 日 · 示例</span></div>
      <div class="limit-stats" style="margin-bottom:10px">
        <div class="limit-stat"><div class="k">主力净流入</div><div class="v ${cls(st.flow)}">${st.flow > 0 ? '+' : ''}${fmt(st.flow, 1)} 亿</div></div>
        <div class="limit-stat"><div class="k">龙虎榜上榜</div><div class="v">${st.dragon} 次</div></div>
        <div class="limit-stat"><div class="k">换手率</div><div class="v">${fmt(s.turnover)}%</div></div>
      </div>
      ${st.dragon ? `<div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th>营业部</th><th class="num">净买入</th></tr></thead><tbody><tr><td class="num">2026-10-28</td><td>示例机构专用</td><td class="num up">+${fmt(st.flow * 0.42 + 0.3, 1)} 亿</td></tr><tr><td class="num">2026-09-19</td><td>示例游资营业部</td><td class="num down">-${fmt(Math.abs(st.flow) * 0.2 + 0.1, 1)} 亿</td></tr></tbody></table></div>` : '<div class="empty-state" style="padding:20px"><div class="empty-ico">—</div><h4>近 20 日无龙虎榜记录</h4><p>数据源返回为空，不代表没有资金活动。</p></div>'}
      
    </div>
  </div>

  <div class="banner banner-info section"><span class="banner-ico">i</span><div class="banner-body"><strong>可追溯性</strong>：本页数据日期 2026-11-06、快照 snapshot-20261106-1532、价格口径前复权；低开高走指标版本 v0.2。<div class="small"></div></div></div>`;
}

/* ---------- 观察池 ---------- */
function viewWatchlist() {
  const list = state.watchlist.map(stockByCode).filter(Boolean);
  return `
  <div class="view-head">
    <div><h2 class="view-title">观察池</h2><div class="view-sub">默认观察池 · 已持久化到本地（刷新页面保留）· ${list.length} 只</div></div>
    <div class="view-actions"><button class="btn" data-action="export-csv" data-target="watchlist">导出</button><button class="btn" data-action="basket-to-backtest">用选股篮回测（${state.basket.length}）</button></div>
  </div>
  ${list.length === 0 ? `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-star"/></svg></div><h4>观察池为空</h4><p>在复盘、个股或筛选结果中点击“加入观察池”，会保存在本地。</p><div class="empty-actions"><button class="btn btn-primary" data-action="go-review">去复盘选股</button></div></div>` : `
  <div class="table-wrap">
    <table class="data">
      <thead><tr><th>股票</th><th>分组</th><th>备注</th><th class="num">现价</th><th class="num">涨跌幅</th><th class="num">连板</th><th class="num">近20日涨停</th><th>来源</th><th style="text-align:right">操作</th></tr></thead>
      <tbody>
        ${list.map((s, i) => `<tr data-stock="${s.code}" class="${state.selectedStock === s.code ? 'selected' : ''}">
          <td><div class="stock-cell"><span class="n">${esc(s.name)}</span><span class="c">${s.code}</span></div></td>
          <td><button class="mini-link" data-action="watch-group" data-code="${s.code}">${esc((state.watchMeta[s.code] || {}).group || '未分组')}</button></td>
          <td><input class="note-input" data-note="${s.code}" value="${esc((state.watchMeta[s.code] || {}).note || '')}" placeholder="备注" aria-label="${esc(s.name)} 备注"></td>
          <td class="num">${fmt(s.price)}</td>
          <td class="num ${cls(s.chg)}">${pct(s.chg)}</td>
          <td class="num">${s.ladder || '—'}</td>
          <td class="num">${s.limit20 || 0}</td>
          <td class="muted">${i % 2 ? '筛选' : '复盘'}</td>
          <td><div class="row-actions"><button class="mini-link" data-action="open-stock" data-code="${s.code}">打开</button><button class="mini-link" data-action="remove-watch" data-code="${s.code}">移除</button></div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  `}`;
}

/* ---------- 筛选 ---------- */
const SCREEN_FIELDS = {
  chg: { label: '涨跌幅（%）' },
  ladder: { label: '连板数' },
  turnover: { label: '换手率（%）' },
  amount: { label: '成交额（亿元）' },
  mcap: { label: '流通市值（亿元）' },
  limit20: { label: '近 20 日涨停次数' },
};
const SCREEN_OPS = { gte: '≥', lte: '≤', eq: '=' };
const condText = (c) => `${SCREEN_FIELDS[c.field]?.label || c.field} ${SCREEN_OPS[c.op]} ${c.value}`;
const condSummary = () => state.screen.conditions.map(condText).join(' 且 ') || '未设置条件';

function filterUniverse() {
  return UNIVERSE.filter((s) => state.screen.conditions.every((c) => {
    const v = Number(s[c.field] ?? 0);
    const t = Number(c.value);
    return c.op === 'gte' ? v >= t : c.op === 'lte' ? v <= t : Math.abs(v - t) < 1e-9;
  }));
}
function sortResults(rows) {
  const { key, dir } = state.screen.sort;
  if (!key) return rows;
  return rows.slice().sort((a, b) => ((Number(a[key] ?? 0) - Number(b[key] ?? 0)) * dir));
}
function runScreen() {
  if (state.connection === 'offline') { toast('远端断连：筛选需要远端数据，已保留上次结果并标记为缓存。', 'bad'); return; }
  if (!state.screen.conditions.length) { toast('请先添加至少一个筛选条件', 'warn'); return; }
  state.screen.loading = true;
  state.screen.ran = true;
  renderView();
  const started = Date.now();
  setTimeout(() => {
    state.screen.results = sortResults(filterUniverse());
    state.screen.loading = false;
    state.screen.page = 1;
    state.screen.ranAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    renderAll();
    const n = state.screen.results.length;
    toast(n ? `筛选完成：${n} 只 · 数据日期 2026-11-06 · 耗时 ${Date.now() - started}ms` : '筛选完成：没有股票满足当前条件', n ? 'ok' : 'warn');
  }, 650);
}
function loadScreen(id, run = true) {
  const saved = state.savedScreens.find((s) => s.id === id);
  if (!saved) return;
  state.screen.conditions = saved.conditions.map((c) => ({ ...c }));
  state.screen.ran = false;
  state.screen.results = null;
  state.screen.page = 1;
  if (run) runScreen();
  else renderAll();
}
function addCondition() {
  if (state.screen.conditions.length >= 4) { toast('原型最多演示 4 个 AND 条件', 'warn'); return; }
  const field = $('#cond-field').value;
  const op = $('#cond-op').value;
  const value = Number($('#cond-value').value);
  if (!Number.isFinite(value)) { toast('请输入有效的条件数值', 'bad'); return; }
  state.screen.conditions.push({ field, op, value });
  renderAll();
}
function saveScreen() {
  if (!state.screen.conditions.length) { toast('没有可保存的条件', 'warn'); return; }
  const name = condSummary();
  state.savedScreens = state.savedScreens.filter((s) => s.name !== name);
  state.savedScreens.unshift({ id: `s${Date.now()}`, name, conditions: state.screen.conditions.map((c) => ({ ...c })) });
  persist();
  renderAll();
  toast(`已保存筛选条件：${name}`, 'ok');
}
function screenSortedRows() {
  const rows = sortResults(state.screen.results || []);
  const pageSize = state.screen.pageSize;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.screen.page = clamp(state.screen.page, 1, pages);
  return { rows, pages, pageSize, pageRows: rows.slice((state.screen.page - 1) * pageSize, state.screen.page * pageSize) };
}

function viewScreener() {
  const rows = state.screen.results;
  const stale = state.connection === 'offline' && rows;
  const sortKey = state.screen.sort.key;
  const sortInd = (k) => (sortKey === k ? ` <span class="sort-ind">${state.screen.sort.dir === 1 ? '▲' : '▼'}</span>` : '');
  const { pages, pageRows } = screenSortedRows();
  return `
  <div class="view-head">
    <div><h2 class="view-title">条件筛选</h2><div class="view-sub">表单筛选 · AND 组合 · 数据日期 2026-11-06 · 口径 v0.3</div></div>
    <div class="view-actions"><span class="status-line small ${state.connection === 'offline' ? 'muted' : 'muted'}"><span class="dot ${state.connection === 'offline' ? 'dot-bad' : 'dot-ok'}"></span>${state.connection === 'offline' ? '断连 · 不可运行' : '远端可用'}</span></div>
  </div>

  ${stale ? '<div class="banner banner-warn"><span class="banner-ico">△</span><div class="banner-body"><strong>缓存结果</strong>：以下为断连前最后一次筛选结果，不能视为最新数据。</div></div>' : ''}

  <div class="card">
    <div class="card-head"><span class="card-title">筛选条件</span><span class="card-sub">${state.screen.conditions.length}/4 个条件</span></div>
    <div class="form-grid" style="grid-template-columns:1.4fr .8fr 1fr auto;align-items:end">
      <div class="field"><label for="cond-field">字段</label><select id="cond-field">${Object.entries(SCREEN_FIELDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="cond-op">条件</label><select id="cond-op">${Object.entries(SCREEN_OPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="cond-value">数值</label><input id="cond-value" type="number" step="0.1" value="2" aria-label="条件数值"></div>
      <button class="btn" data-action="add-condition">添加条件</button>
    </div>
    <div class="conditions" aria-label="当前条件">
      ${state.screen.conditions.length ? state.screen.conditions.map((c, i) => `<div class="cond-chip"><span class="small muted">${i ? 'AND' : '条件'}</span> ${esc(condText(c))} <button class="x" data-action="remove-condition" data-idx="${i}" aria-label="移除条件 ${esc(condText(c))}">✕</button></div>`).join('') : '<div class="muted small">尚未设置条件。</div>'}
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" data-action="run-screen" ${state.connection === 'offline' ? 'disabled' : ''}>运行筛选</button>
      <button class="btn" data-action="save-screen">保存条件</button>
      <span class="muted small">样本数会随结果展示；条件与结果可复跑。</span>
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">已保存条件</span><span class="card-sub">点击载入并运行</span></div>
    <div class="saved-chips">${state.savedScreens.map((s) => `<button class="saved-chip" data-action="load-screen" data-screen="${s.id}">${esc(s.name)} <span class="muted">↻</span></button>`).join('') || '<span class="muted small">暂无保存条件</span>'}</div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">筛选结果</span><span class="card-sub">${rows ? `命中 ${rows.length} 只 · 数据日期 2026-11-06 · 运行 ${esc(state.screen.ranAt || '—')}` : '尚未运行'}</span></div>
    ${state.screen.loading ? `<div class="skeleton" aria-busy="true"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-table"></div><p class="small muted" role="status">正在运行筛选（远端计算）…</p></div>` : ''}
    ${!state.screen.loading && !rows ? `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-screen"/></svg></div><h4>还没有结果</h4><p>添加条件后运行。</p></div>` : ''}
    ${!state.screen.loading && rows && rows.length === 0 ? `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-empty"/></svg></div><h4>没有股票满足当前条件</h4><p>当前条件：${esc(condSummary())}</p><div class="empty-actions"><button class="btn" data-action="run-screen">重新运行</button><button class="btn" data-action="clear-conditions">清空条件</button></div></div>` : ''}
    ${!state.screen.loading && rows && rows.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>股票</th><th>板块</th>
            <th class="num sortable" data-action="screen-sort" data-key="price">现价${sortInd('price')}</th>
            <th class="num sortable" data-action="screen-sort" data-key="chg">涨跌幅${sortInd('chg')}</th>
            <th class="num sortable" data-action="screen-sort" data-key="turnover">换手率${sortInd('turnover')}</th>
            <th class="num sortable" data-action="screen-sort" data-key="ladder">连板${sortInd('ladder')}</th>
            <th class="num sortable" data-action="screen-sort" data-key="limit20">近20日涨停${sortInd('limit20')}</th>
            <th class="num sortable" data-action="screen-sort" data-key="amount">成交额${sortInd('amount')}</th>
            <th style="text-align:right">操作</th>
          </tr></thead>
          <tbody>
            ${pageRows.map((s) => `<tr data-stock="${s.code}" class="${state.selectedStock === s.code ? 'selected' : ''}">
              <td><div class="stock-cell"><span class="n">${esc(s.name)}</span><span class="c">${s.code}</span></div></td>
              <td>${esc(s.industry)}</td>
              <td class="num">${fmt(s.price)}</td>
              <td class="num ${cls(s.chg)}">${pct(s.chg)}</td>
              <td class="num">${fmt(s.turnover)}%</td>
              <td class="num">${s.ladder || '—'}</td>
              <td class="num">${s.limit20 || 0}</td>
              <td class="num">${money(s.amount)}</td>
              <td><div class="row-actions"><button class="mini-link" data-action="open-stock" data-code="${s.code}">打开</button><button class="mini-link" data-action="add-watch" data-code="${s.code}">${state.watchlist.includes(s.code) ? '已观察' : '观察'}</button><button class="mini-link" data-action="basket-add" data-code="${s.code}">${state.basket.includes(s.code) ? '已选' : '选股篮'}</button></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="page-info">共 ${rows.length} 只 · 第 ${state.screen.page}/${pages} 页 · ${state.screen.pageSize} 只/页</span>
        <button class="page-btn" data-action="screen-page" data-page="${state.screen.page - 1}" ${state.screen.page <= 1 ? 'disabled' : ''}>上一页</button>
        ${Array.from({ length: pages }, (_, i) => `<button class="page-btn ${i + 1 === state.screen.page ? 'active' : ''}" data-action="screen-page" data-page="${i + 1}">${i + 1}</button>`).join('')}
        <button class="page-btn" data-action="screen-page" data-page="${state.screen.page + 1}" ${state.screen.page >= pages ? 'disabled' : ''}>下一页</button>
      </div>
      ` : ''}
  </div>`;
}

/* ---------- 回测 ---------- */
function viewBacktest() {
  const f = state.btForm;
  const offline = state.connection === 'offline';
  return `
  <div class="view-head">
    <div><h2 class="view-title">日频回测</h2><div class="view-sub">单策略基础回测 · 信号与成交分离 · 基准沪深 300</div></div>
    <div class="view-actions"><span class="status-line small muted"><span class="dot ${offline ? 'dot-bad' : 'dot-ok'}"></span>${offline ? '断连 · 不可提交' : '回测引擎可用'}</span></div>
  </div>
  ${offline ? '<div class="banner banner-warn"><span class="banner-ico">△</span><div class="banner-body"><strong>远端断连</strong>：回测提交需要远端计算资源；当前保留表单与最近结果，不允许伪装提交成功。</div></div>' : ''}
  <div class="grid grid-main-side">
    <div class="card">
      <div class="card-head"><span class="card-title">回测配置</span><span class="card-sub">参数变更会记录到运行记录</span></div>
      <div class="form-grid">
        <div class="field"><label for="bt-strategy">策略</label><select id="bt-strategy"><option>首板回封 v0.1.3</option><option>连板回踩 v0.1.1（示例）</option></select></div>
        <div class="field"><label for="bt-pool">股票池</label><select id="bt-pool"><option ${f.pool === '观察池' ? 'selected' : ''}>观察池</option><option ${f.pool === '选股篮' ? 'selected' : ''}>选股篮</option><option ${f.pool === '筛选结果' ? 'selected' : ''}>筛选结果</option><option ${f.pool === '全A' ? 'selected' : ''}>全A</option></select></div>
        <div class="field"><label for="bt-from">开始日期</label><input id="bt-from" type="date" value="${f.from}"></div>
        <div class="field"><label for="bt-to">结束日期</label><input id="bt-to" type="date" value="${f.to}"></div>
        <div class="field"><label for="bt-capital">初始资金（元）</label><input id="bt-capital" type="number" value="${f.capital}" min="10000" step="10000"></div>
        <div class="field"><label for="bt-maxpos">最大持仓数</label><input id="bt-maxpos" type="number" value="${f.maxPos}" min="1" max="20"></div>
        <div class="field"><label for="bt-fee">佣金费率</label><input id="bt-fee" type="number" value="${f.fee}" step="0.0001"></div>
        <div class="field"><label for="bt-stamp">印花税率（卖出）</label><input id="bt-stamp" type="number" value="${f.stamp}" step="0.0001"></div>
        <div class="field"><label for="bt-slip">滑点</label><input id="bt-slip" type="number" value="${f.slip}" step="0.0001"></div>
        <div class="field" style="justify-content:flex-end"><span class="small muted">当前池：${f.pool === '观察池' ? `观察池（${state.watchlist.length} 只）` : f.pool === '选股篮' ? `选股篮（${state.basket.length} 只）` : f.pool === '筛选结果' ? `筛选结果（${state.screen.results?.length ?? 0} 只）` : '全A（5,412 只）'}</span></div>
      </div>
      <div class="form-actions" style="margin-top:12px">
        <button class="btn btn-primary" data-action="submit-backtest" ${offline ? 'disabled' : ''}>提交回测</button>
        <span class="small muted">提交后进入任务中心，不阻塞页面查询。</span>
      </div>
      
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">交易假设</span><span class="card-sub">报告内固定展示</span></div>
      <ul class="assume-list">${BT_ASSUMPTIONS.slice(0, 4).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <div class="card-head" style="margin-top:14px"><span class="card-title">最近运行</span><button class="mini-link" style="margin-left:auto" data-action="open-tasks">任务中心</button></div>
      ${state.tasks.filter((t) => t.type === '回测').slice(0, 2).map((t) => `<div class="task-mini" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">
        <span><span class="pill ${t.status === 'success' ? 'pill-success' : t.status === 'failed' ? 'pill-failed' : t.status === 'running' ? 'pill-running' : 'pill-queued'}">${statusLabel(t.status)}</span> <span class="num">${t.id}</span></span>
        <span><button class="mini-link" data-action="${t.result ? 'open-result' : 'task-focus'}" data-task="${t.id}">${t.result ? '结果' : t.status === 'failed' ? '错误' : '任务'}</button></span>
      </div>`).join('') || '<div class="muted small">暂无运行记录</div>'}
    </div>
  </div>`;
}

function submitBacktest() {
  if (state.connection === 'offline') { toast('远端断连：无法提交回测，请先重连。', 'bad'); return; }
  const form = {
    strategy: $('#bt-strategy').value,
    pool: $('#bt-pool').value,
    from: $('#bt-from').value,
    to: $('#bt-to').value,
    capital: Number($('#bt-capital').value),
    maxPos: Number($('#bt-maxpos').value),
    fee: Number($('#bt-fee').value),
    stamp: Number($('#bt-stamp').value),
    slip: Number($('#bt-slip').value),
  };
  if (!form.from || !form.to || form.from >= form.to) { toast('回测区间无效：开始日期必须早于结束日期', 'bad'); return; }
  if (!(form.capital >= 10000)) { toast('初始资金至少 10,000 元', 'bad'); return; }
  if (!(form.maxPos >= 1 && form.maxPos <= 20)) { toast('最大持仓数需在 1–20 之间', 'bad'); return; }
  if (form.pool === '观察池' && state.watchlist.length === 0) { toast('股票池为空：请先向观察池添加股票', 'bad'); return; }
  if (form.pool === '选股篮' && state.basket.length === 0) { toast('选股篮为空：先从复盘或个股加入标的', 'bad'); return; }
  state.btForm = { ...form };
  const id = `T-${state.seq++}`;
  const poolText = form.pool === '观察池' ? `观察池 ${state.watchlist.length} 只` : form.pool === '选股篮' ? `选股篮 ${state.basket.length} 只` : form.pool === '筛选结果' ? `筛选结果 ${state.screen.results.length} 只` : '全A';
  const task = {
    id, type: '回测', status: 'running', progress: 2,
    submitted: nowTime(), params: `${form.strategy} · ${poolText} · ${form.from} → ${form.to} · 初始 ${fmt(form.capital, 0)} 元`,
    cancelable: true, server: 'AutoDL · backtest-1', result: null,
    form, logs: [`${nowTime()} 回测任务受理`, `${nowTime()} 校验数据快照 snapshot-20261106-1532`, `${nowTime()} 参数：最大持仓 ${form.maxPos}，佣金 ${form.fee}，印花税 ${form.stamp}，滑点 ${form.slip}`],
  };
  state.tasks.unshift(task);
  state.selectedTask = id;
  openTab('tasks');
  toast(`回测任务已提交：${id}（可在任务中心取消或查看日志）`, 'ok');
}
function nowTime() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
function statusLabel(s) { return { running: '运行中', queued: '排队', success: '成功', failed: '失败', canceled: '已取消' }[s] || s; }

/* ---------- 任务中心 ---------- */
function viewTasks() {
  state.taskFilter = state.taskFilter || 'all';
  const rows = state.tasks.filter((t) => state.taskFilter === 'all' || (state.taskFilter === 'active' ? ['running', 'queued'].includes(t.status) : t.status === state.taskFilter));
  const filters = [['all', '全部'], ['active', '运行/排队'], ['success', '成功'], ['failed', '失败'], ['canceled', '已取消']];
  return `
  <div class="view-head">
    <div><h2 class="view-title">任务中心</h2><div class="view-sub">数据更新、筛选、复盘、回测与 Agent 任务统一管理 · 断连后可查询远端任务</div></div>
    <div class="view-actions"><span class="status-line small muted"><span class="dot ${state.connection === 'offline' ? 'dot-bad' : 'dot-ok'}"></span>${state.connection === 'offline' ? '断连 · 显示已同步任务' : '远端任务同步正常'}</span></div>
  </div>
  <div class="segmented" role="tablist" aria-label="任务状态筛选" style="margin-bottom:12px">
    ${filters.map(([k, label]) => `<button class="seg-item ${state.taskFilter === k ? 'active' : ''}" role="tab" aria-selected="${state.taskFilter === k}" data-action="task-filter" data-filter="${k}">${label}</button>`).join('')}
  </div>
  ${rows.length === 0 ? `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-tasks"/></svg></div><h4>该分类下暂无任务</h4><p>暂无任务。</p><div class="empty-actions"><button class="btn" data-action="task-filter" data-filter="all">查看全部</button></div></div>` : `
  <div class="table-wrap">
    <table class="data">
      <thead><tr><th>任务</th><th>类型</th><th>状态</th><th>进度</th><th>参数摘要</th><th>提交 / 完成</th><th style="text-align:right">操作</th></tr></thead>
      <tbody>
        ${rows.map((t) => `<tr data-action="task-focus" data-task="${t.id}" class="${state.selectedTask === t.id ? 'selected' : ''}" style="cursor:pointer">
          <td><div class="stock-cell"><span class="n num">${t.id}</span><span class="c">${esc(t.server)}</span></div></td>
          <td>${esc(t.type)}</td>
          <td><span class="pill ${t.status === 'running' ? 'pill-running' : t.status === 'queued' ? 'pill-queued' : t.status === 'success' ? 'pill-success' : t.status === 'failed' ? 'pill-failed' : 'pill-canceled'}">${statusLabel(t.status)}</span>${t.status === 'failed' && state.connection === 'offline' ? '' : ''}</td>
          <td><div class="task-mini"><span class="progress ${t.status === 'success' ? 'done' : t.status === 'failed' ? 'fail' : ''}"><i style="width:${t.progress}%"></i></span><span class="num">${t.progress}%</span></div></td>
          <td class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${esc(t.params)}</td>
          <td class="num muted">${esc(t.submitted)}${t.finished ? ` / ${esc(t.finished)}` : ''}</td>
          <td><div class="row-actions">
            <button class="mini-link" data-action="task-logs" data-task="${t.id}">日志</button>
            ${t.artifact && !t.error ? `<button class="mini-link" data-action="task-artifact" data-task="${t.id}">产物</button>` : ''}
            ${['running', 'queued'].includes(t.status) ? `<button class="mini-link" data-action="cancel-task" data-task="${t.id}">取消</button>` : ''}
            
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  `}`;
}

/* ---------- 回测结果 ---------- */
function equitySvg(r) {
  const W = 560, H = 300, left = 44, right = 12, top = 14, bottom = 24;
  const values = [...r.equity, ...r.benchmark];
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const x = (i) => left + (i / (r.equity.length - 1)) * (W - left - right);
  const y = (v) => top + (1 - (v - min) / (max - min)) * (H - top - bottom);
  const makePath = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const eqPath = makePath(r.equity), bmPath = makePath(r.benchmark);
  const grid = [0, 1, 2, 3].map((k) => {
    const v = min + (k / 3) * (max - min);
    return `<line x1="${left}" y1="${y(v).toFixed(1)}" x2="${W - right}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.06)"/><text x="2" y="${(y(v) + 4).toFixed(1)}">${(v - 100).toFixed(0)}%</text>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="策略与基准累计净值示例曲线">${grid}
    <path d="${bmPath}" fill="none" stroke="${PAL.muted}" stroke-width="1.2" stroke-dasharray="3 4" stroke-linejoin="round"/>
    <path d="${eqPath} L${x(r.equity.length - 1).toFixed(1)},${(H - bottom).toFixed(1)} L${x(0)},${(H - bottom).toFixed(1)} Z" fill="${PAL.text}" opacity=".05"/>
    <path d="${eqPath}" fill="none" stroke="${PAL.text}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${x(0)}" y="${H - 6}">2024-01</text><text x="${x(11)}" y="${H - 6}">2025-01</text><text x="${x(22)}" y="${H - 6}">2026-01</text><text x="${x(33) - 54}" y="${H - 6}">2026-11</text>
  </svg>`;
}

function drawdownSvg(r) {
  const W = 560, H = 300, left = 44, right = 12, top = 16, bottom = 24;
  const dd = r.drawdown;
  const minDD = Math.min(...dd, -1);
  const x = (i) => left + (i / (dd.length - 1)) * (W - left - right);
  const y = (v) => top + (v / minDD) * (H - top - bottom);
  const area = dd.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + ` L${x(dd.length - 1).toFixed(1)},${top} L${left},${top} Z`;
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="策略回撤示例面积图">
    <path d="${area}" fill="${PAL.up}" opacity=".16"/>
    <path d="${dd.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${PAL.up}" stroke-width="1.2"/>
    <line x1="${left}" y1="${top}" x2="${W - right}" y2="${top}" stroke="rgba(255,255,255,.06)"/>
    <text x="2" y="${top + 6}">0%</text><text x="2" y="${(H - bottom).toFixed(1)}">${minDD.toFixed(0)}%</text>
  </svg>`;
}

function viewResult() {
  let task = state.tasks.find((t) => t.id === state.selectedTask);
  if (!task) task = state.tasks.find((t) => t.id === 'T-1041');
  if (!task) {
    return `<div class="empty-state"><div class="empty-ico"><svg><use href="#i-clock"/></svg></div><h4>没有可显示的回测运行</h4><p>从回测页提交，或在任务中心打开已完成的结果。</p><div class="empty-actions"><button class="btn btn-primary" data-route="backtest">去回测</button><button class="btn" data-route="tasks">任务中心</button></div></div>`;
  }
  const head = `<div class="view-head"><div><h2 class="view-title">回测结果 · ${task.id}</h2><div class="view-sub">${esc(task.params)}</div></div><div class="view-actions"><button class="btn" data-action="export-csv" data-target="trades">导出交易明细</button><button class="btn" data-action="open-logs" data-task="${task.id}">查看日志</button><button class="btn" data-route="backtest">再跑一次</button></div></div>`;
  if (task.status === 'running' || task.status === 'queued') {
    return head + `<div class="card"><div class="task-mini" style="margin-bottom:10px"><span class="pill pill-running">${statusLabel(task.status)}</span><span>${task.progress}% · ${esc(task.server)}</span></div><div class="progress" style="height:8px"><i style="width:${task.progress}%"></i></div><div class="skeleton" style="margin-top:14px"><div class="sk sk-chart"></div><div class="sk sk-table"></div></div><p class="small muted">运行中，完成后自动打开结果。</p></div>`;
  }
  if (task.status === 'failed' || task.status === 'canceled' || !task.result) {
    return head + `<div class="error-state" style="margin-bottom:12px"><div><strong>回测未产生结果（${statusLabel(task.status)}）</strong><div style="margin-top:4px">${esc(task.error || '任务已取消，未生成回测报告。')}</div><div class="small" style="margin-top:6px">数据快照 snapshot-20261106-1532 · 退出码 ${task.status === 'canceled' ? '—' : '3'} · 日志已保留</div><div style="margin-top:8px"><button class="btn btn-small" data-action="open-logs" data-task="${task.id}">查看日志</button> <button class="btn btn-small" data-action="retry-backtest" data-task="${task.id}">重新提交</button></div></div></div>
      <div class="card"><div class="card-head"><span class="card-title">失败信息</span><span class="card-sub">可复现</span></div><pre class="code-box">${esc(task.error || '任务在完成前被取消，没有可用的产物。')}\n\n建议：补齐停牌记录后重跑；同一快照与参数将可复现该错误。</pre></div>`;
  }
  const r = task.result, m = r.metrics;
  const tp = Math.max(1, Math.ceil(r.trades.length / 5));
  const page = clamp(state.tradePage, 1, tp);
  return `${head}
  <div class="metric-row">
    <div class="card stat"><div class="stat-label">累计收益</div><div class="stat-value ${cls(m.total)}">${pct(m.total)}</div><div class="stat-sub">区间 ${esc(r.meta.range)}</div></div>
    <div class="card stat"><div class="stat-label">年化收益</div><div class="stat-value ${cls(m.annual)}">${pct(m.annual)}</div><div class="stat-sub">样本 34 个月</div></div>
    <div class="card stat"><div class="stat-label">最大回撤</div><div class="stat-value down">${m.maxDD.toFixed(1)}%</div><div class="stat-sub">净值峰值到谷底</div></div>
    <div class="card stat"><div class="stat-label">基准 / 超额 <button class="metric-link" data-action="metric-info" data-metric="excess">口径</button></div><div class="stat-value ${cls(m.excess)}" style="font-size:18px">${pct(m.bench)} / ${pct(m.excess)}</div><div class="stat-sub">沪深 300</div></div>
    <div class="card stat"><div class="stat-label">交易数</div><div class="stat-value" style="font-size:18px">${m.trades}</div><div class="stat-sub">平均持仓 4.6 日</div></div>
    <div class="card stat"><div class="stat-label">胜率</div><div class="stat-value" style="font-size:18px">${m.win}%</div><div class="stat-sub">盈利 ${Math.round(m.trades * m.win / 100)} / ${m.trades}</div></div>
    <div class="card stat"><div class="stat-label">费用合计</div><div class="stat-value" style="font-size:18px">${fmt(m.fees)} 万</div><div class="stat-sub">佣金 + 印花税 + 滑点</div></div>
    <div class="card stat"><div class="stat-label">数据快照</div><div class="stat-value" style="font-size:15px;font-family:var(--mono)">${esc(r.meta.snapshot)}</div><div class="stat-sub">${esc(r.meta.strategy)}</div></div>
  </div>

  <div class="viz-grid section">
    ${vizCard('累计净值与基准', equitySvg(r), '策略与沪深 300 · 示例', seriesLegend([{ name: '策略', color: PAL.text }, { name: '沪深 300', color: PAL.muted }]))}
    ${vizCard('回撤', drawdownSvg(r), `最大回撤 ${m.maxDD.toFixed(1)}%`)}
    ${vizCard('超额收益', multiLineSvg([{ name: '超额', values: r.equity.map((v, i) => +((v - 100) - (r.benchmark[i] - 100)).toFixed(2)), color: PAL.down, width: 1.5, fill: true }], { yMin: Math.min(0, ...r.equity.map((v, i) => (v - 100) - (r.benchmark[i] - 100))) }), `累计超额 ${pct(m.excess)}`, seriesLegend([{ name: '策略 − 基准', color: PAL.down }]))}
    ${vizCard('月度收益', heatmapSvg([
      { name: '2024', values: [2.4, -1.8, 3.6, 5.1, -2.2, 4.4, 1.2, -3.4, 6.2, 2.8, -1.1, 3.9] },
      { name: '2025', values: [4.1, 2.2, -2.6, 6.8, 3.1, -1.4, 5.2, 2.0, -3.8, 4.6, 1.9, 2.7] },
      { name: '2026', values: [3.2, -1.2, 5.4, 2.1, 4.8, -2.4, 3.6, 1.4, 2.9, 3.3, 1.7, 0] },
    ], { labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] }), '分年收益热力图 · 最后一列为未完成月')}
  </div>

  <div class="grid grid-2 section">
    <div class="card">
      <div class="card-head"><span class="card-title">分年统计</span><span class="card-sub">收益 / 回撤 / 胜率</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>年份</th><th class="num">策略</th><th class="num">基准</th><th class="num">回撤</th><th class="num">交易</th><th class="num">胜率</th></tr></thead><tbody>
        ${r.yearly.map((y) => `<tr><td>${y.year}</td><td class="num ${cls(y.ret)}">${pct(y.ret)}</td><td class="num ${cls(y.bench)}">${pct(y.bench)}</td><td class="num down">${y.maxDD.toFixed(1)}%</td><td class="num">${y.trades}</td><td class="num">${y.win}%</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">成交与交易假设</span><span class="card-sub">报告固定展示</span></div>
      <ul class="assume-list">${BT_ASSUMPTIONS.map((assume) => `<li>${esc(assume)}</li>`).join('')}</ul>
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">交易明细</span><span class="card-sub">${r.trades.length} 笔样例 · 第 ${page}/${tp} 页</span></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>开仓</th><th>平仓</th><th>股票</th><th class="num">数量</th><th class="num">成交价</th><th class="num">盈亏（元）</th><th class="num">费用（元）</th></tr></thead><tbody>
      ${r.trades.slice((page - 1) * 5, page * 5).map((t) => `<tr><td class="num">${t.open}</td><td class="num">${t.close}</td><td>${esc(t.name)} <span class="num muted">${t.code}</span></td><td class="num">${fmt(t.qty, 0)}</td><td class="num">${fmt(t.price)}</td><td class="num ${cls(t.pnl)}">${t.pnl > 0 ? '+' : ''}${fmt(t.pnl, 0)}</td><td class="num muted">${fmt(t.fee)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="pagination"><span class="page-info">共 ${r.trades.length} 笔样例</span>
      <button class="page-btn" data-action="trade-page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <button class="page-btn" data-action="trade-page" data-page="${page + 1}" ${page >= tp ? 'disabled' : ''}>下一页</button>
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">可复现信息</span><span class="card-sub">运行记录已保存</span></div>
    <div class="grid grid-2">
      <dl class="ctx-kv" style="font-size:13.5px">
        <dt>数据快照</dt><dd class="num">${esc(r.meta.snapshot)}</dd>
        <dt>策略版本</dt><dd class="num">${esc(r.meta.strategy)}</dd>
        <dt>参数哈希</dt><dd class="num">${esc(r.meta.paramsHash)}</dd>
        <dt>随机种子</dt><dd class="num">${r.meta.seed}</dd>
      </dl>
      <dl class="ctx-kv" style="font-size:13.5px">
        <dt>基准</dt><dd>${esc(r.meta.benchmark)}</dd>
        <dt>股票池</dt><dd>${esc(r.meta.pool)}</dd>
        <dt>成交时点</dt><dd>${esc(r.meta.timing)}</dd>
      </dl>
    </div>
  </div>`;
}

/* ---------- Agent 与 MCP ---------- */
const MCP_TOOLS = [
  { name: 'read_market_review', kind: '只读', desc: '读取指定交易日的市场复盘：指数、宽度、涨跌停、连板梯队', args: 'trade_date' },
  { name: 'read_stock', kind: '只读', desc: '读取个股行情、统计指标、涨停记录与数据日期', args: 'code, window' },
  { name: 'screen_stocks', kind: '只读', desc: '按白名单字段筛选股票，返回结果数与数据日期', args: 'conditions[]' },
  { name: 'read_limit_up_ladder', kind: '只读', desc: '读取连板梯队与涨停原因（标注推断 / 原始来源）', args: 'trade_date' },
  { name: 'submit_backtest', kind: '计算', desc: '提交日频回测任务，返回 task_id；需 UI 留痕', args: 'strategy, pool, range, params' },
  { name: 'get_task', kind: '只读', desc: '查询任务状态、进度、日志与产物引用', args: 'task_id' },
  { name: 'get_data_status', kind: '只读', desc: '读取数据更新、完整性与质量检查结果', args: 'trade_date' },
  { name: 'read_sector_flow', kind: '只读', desc: '读取板块资金流 Top/Bottom 与 5/10/20 日累计', args: 'trade_date, window' },
  { name: 'export_result', kind: '只读', desc: '导出结果集为 CSV（返回产物引用，不返回大表）', args: 'kind, task_id' },
];

function viewMcp() {
  const offline = state.connection === 'offline';
  const snippet = `{
  "mcpServers": {
    "quant-workbench": {
      "type": "streamable-http",
      "url": "https://autodl-demo.example:8443/mcp",
      "headers": {
        "Authorization": "Bearer <LOCAL_TOKEN>"
      }
    }
  }
}`;
  return `
  <div class="view-head">
    <div><h2 class="view-title">Agent 与 MCP</h2><div class="view-sub">内置 Agent 面板与外部 MCP 接入使用同一套受控业务服务 · v1 无交易工具</div></div>
    <div class="view-actions"><span class="status-line small muted"><span class="dot ${offline ? 'dot-bad' : 'dot-ok'}"></span>${offline ? '远端断连 · 工具不可用' : 'MCP 握手正常 · 38ms'}</span></div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><span class="card-title">入口 1 · 内置 Agent 面板</span><span class="card-sub">工作台内</span></div>
      <p class="small muted" style="margin-bottom:10px">提问后自动展示工具调用、参数与结果；提交计算任务需确认。</p>
      <div class="tool-card" style="margin-bottom:10px">
        <div class="tool-head">read_market_review <span class="tool-kind">只读</span><span class="tool-dur">412ms</span></div>
        <div class="tool-body"><div class="tool-row"><span class="k">参数</span><span class="v">{"trade_date":"2026-11-06"}</span></div><div class="tool-row"><span class="k">返回</span><span class="v">指数 4 · 涨停 68 · 封板率 76.4% · 完整性 ok</span></div></div>
      </div>
      <button class="btn btn-primary" data-action="open-agent">打开内置 Agent 面板</button>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">入口 2 · 外部 MCP 接入</span><span class="card-sub">Claude Desktop / Cursor 等</span></div>
      <dl class="kv-grid">
        <dt>端点</dt><dd><span class="tool-tag">https://autodl-demo.example:8443/mcp</span></dd>
        <dt>传输</dt><dd>Streamable HTTP（示例）</dd>
        <dt>鉴权</dt><dd>Bearer token（已掩码 · 不写入 Git）</dd>
        <dt>状态</dt><dd><span class="status-line"><span class="dot ${offline ? 'dot-bad' : 'dot-ok'}"></span>${offline ? '断连，外部客户端同样不可用' : '已连接 · 最后握手 15:31:58'}</span></dd>
        <dt>审计</dt><dd>每次调用记录工具、参数、耗时、结果摘要与任务引用</dd>
      </dl>
      <div class="form-actions" style="margin-top:12px"><button class="btn" data-action="copy-mcp">复制接入配置</button><button class="btn btn-ghost" data-action="mcp-security">安全说明</button></div>
    </div>
  </div>

  <div class="card section">
    <div class="card-head"><span class="card-title">工具清单</span><span class="card-sub">${MCP_TOOLS.length} 个 · 只读 / 计算</span></div>
    <div class="table-wrap">
      <table class="data"><thead><tr><th>工具</th><th>类型</th><th>说明</th><th>参数</th></tr></thead>
      <tbody>${MCP_TOOLS.map((t) => `<tr><td><span class="tool-tag">${t.name}</span></td><td><span class="tool-kind">${t.kind}</span></td><td class="muted" style="white-space:normal">${esc(t.desc)}</td><td class="num muted">${esc(t.args)}</td></tr>`).join('')}</tbody></table>
    </div>
    
  </div>

  <div class="grid grid-2 section">
    <div class="card">
      <div class="card-head"><span class="card-title">外部客户端配置</span><span class="card-sub">示例，需替换真实 token</span></div>
      <div style="position:relative"><pre class="code-box" id="mcp-config">${esc(snippet)}</pre><button class="btn btn-small copy-btn" data-action="copy-mcp">复制</button></div>
      
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">最近 MCP 调用审计</span><span class="card-sub">示例记录</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>客户端</th><th>工具</th><th class="num">耗时</th><th>结果</th></tr></thead><tbody>
        <tr><td class="num">15:33:12</td><td>内置 Agent</td><td class="tool-tag">read_market_review</td><td class="num">412ms</td><td class="muted">ok · 68 涨停</td></tr>
        <tr><td class="num">15:24:40</td><td>Claude Desktop</td><td class="tool-tag">screen_stocks</td><td class="num">688ms</td><td class="muted">ok · 6 只</td></tr>
        <tr><td class="num">15:02:03</td><td>Cursor</td><td class="tool-tag">submit_backtest</td><td class="num">1.2s</td><td class="muted">ok · T-1041</td></tr>
        <tr><td class="num">14:44:02</td><td>内置 Agent</td><td class="tool-tag">get_task</td><td class="num">—</td><td class="muted">failed · 停牌数据缺失</td></tr>
        <tr><td class="num">14:20:14</td><td>内置 Agent</td><td class="tool-tag">read_limit_up_ladder</td><td class="num">530ms</td><td class="muted">partial · 原因源缺失</td></tr>
      </tbody></table></div>
    </div>
  </div>

  <div class="banner banner-info section"><span class="banner-ico">i</span><div class="banner-body"><strong>权限边界</strong>：Agent 只能通过受控工具访问业务服务，不直接读底层文件或数据库；查询无需确认，提交计算任务需 UI 留痕；删除数据、改全局配置等破坏性操作需要用户确认；v1 不包含任何交易工具。</div></div>`;
}

/* ---------- 内置 Agent ---------- */
function toggleAgent() { state.agentOpened ? closeAgent() : openAgent(); }
function openAgent() {
  state.agentOpened = true;
  $('#agent-wrap').hidden = false;
  renderAgent();
  setTimeout(() => $('#agent-input')?.focus(), 30);
}
function closeAgent() { state.agentOpened = false; $('#agent-wrap').hidden = true; }

function toolCard(t) {
  return `<div class="tool-card">
    <div class="tool-head">${esc(t.name)} <span class="tool-kind">${t.kind || '只读'}</span><span class="tool-dur">${esc(t.duration)}</span></div>
    <div class="tool-body">
      <div class="tool-row"><span class="k">参数</span><span class="v">${esc(t.params)}</span></div>
      <div class="tool-row"><span class="k">结果</span><span class="v">${esc(t.meta)}</span></div>
      <div class="tool-summary">${esc(t.summary)}</div>
    </div>
  </div>`;
}

function renderAgent() {
  const online = state.connection === 'online';
  $('#agent-status').innerHTML = `<span class="dot ${online ? 'dot-ok' : 'dot-bad'}"></span>${online ? '已连接业务服务 · 工具调用可审计 · 数据日期 2026-11-06' : '远端断连 · 工具不可用；不会返回伪造结果'}`;
  const box = $('#agent-messages');
  const msgs = state.agent.messages;
  if (!msgs.length) {
    box.innerHTML = `<div class="agent-empty"><h4>内置 Agent</h4><p>通过受控工具读取复盘、个股、筛选和任务。每次调用都会展示参数、耗时、数据日期与口径；提交回测需确认。</p></div>`;
  } else {
    box.innerHTML = msgs.map((m, i) => {
      if (m.role === 'typing') return `<div class="msg msg-agent"><div class="typing" aria-label="Agent 正在调用工具"><i></i><i></i><i></i></div></div>`;
      if (m.role === 'user') return `<div class="msg msg-user"><div class="bubble">${esc(m.text)}</div><div class="msg-meta">你</div></div>`;
      return `<div class="msg msg-agent">
        ${(m.tools || []).map(toolCard).join('')}
        ${m.text ? `<div class="bubble">${esc(m.text)}</div>` : ''}
        ${(m.actions || []).map((a) => `<button class="mini-link" style="text-align:left" data-action="${a.action}">${esc(a.label)}</button>`).join('')}
        ${m.confirm ? `<div class="confirm-card"><strong>需要确认：提交计算任务</strong><div style="margin-top:4px">将通过 <span class="tool-tag">submit_backtest</span> 提交：首板回封 v0.1.3 · 观察池 ${state.watchlist.length} 只 · 2024-01-02 → 2026-11-06 · 初始资金 100,000 元。提交后出现在任务中心并可取消。</div><div class="confirm-actions"><button class="btn btn-small btn-primary" data-action="agent-confirm">确认提交</button><button class="btn btn-small" data-action="agent-cancel">取消</button></div></div>` : ''}
        <div class="msg-meta">Agent · ${esc(m.time || '示例会话')}</div>
      </div>`;
    }).join('');
  }
  $('#agent-presets').innerHTML = [
    '查询 11-06 复盘：涨停梯队和封板率',
    '查询 300750 近 20 日低开高走率（含样本数）',
    '提交一次首板回封回测（观察池）',
  ].map((p) => `<button class="preset" data-action="agent-preset" data-text="${esc(p)}">${esc(p)}</button>`).join('');
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function agentPush(m) { state.agent.messages.push({ time: nowTime(), ...m }); }

function sendAgent(raw) {
  const text = String(raw || '').trim();
  if (!text || state.agent.busy) return;
  agentPush({ role: 'user', text });
  if (state.connection === 'offline') {
    agentPush({ role: 'agent', text: '当前远端断连，工具不可用。为避免把缓存当成实时结果，我不会返回复盘/行情数值。可在任务中心查看已同步任务；恢复连接后重新提问。' });
    renderAgent();
    return;
  }
  state.agent.busy = true;
  agentPush({ role: 'typing' });
  renderAgent();
  setTimeout(() => {
    state.agent.messages = state.agent.messages.filter((m) => m.role !== 'typing');
    if (/回测|提交/.test(text)) {
      if (state.watchlist.length === 0) {
        agentPush({ role: 'agent', text: '观察池为空，无法提交以观察池为股票池的回测。请先在复盘或筛选中加入股票。' });
      } else {
        state.agent.pending = { kind: 'backtest' };
        agentPush({
          role: 'agent',
          tools: [{ name: 'screen_stocks', kind: '只读', duration: '486ms', params: '{"pool":"watchlist"}', meta: `观察池 ${state.watchlist.length} 只 · 数据日期 2026-11-06 · 完整性 ok`, summary: `观察池可用：${state.watchlist.map((c) => stockByCode(c)?.name).join('、')}` }],
          text: '已核对股票池与数据快照。提交回测属于计算任务，需要你在下方确认后才会创建任务；执行期间可在任务中心查看进度或取消。',
          confirm: true,
        });
      }
    } else if (/300750|低开|样本|个股/.test(text)) {
      const s = stockByCode('300750');
      const st = statsFor(s);
      agentPush({
        role: 'agent',
        tools: [{
          name: 'read_stock', kind: '只读', duration: '238ms',
          params: '{"code":"300750","window":"20d"}',
          meta: `数据日期 2026-11-06 · 指标版本 v0.2 · 样本 ${st.lowOpenSamples} · 完整性 ok`,
          summary: `${s.name}：低开高走率 ${st.lowOpenRate.toFixed(1)}%（${st.lowOpenHits}/${st.lowOpenSamples}），窗口 20 个交易日；${st.lowOpenSamples < 10 ? '样本不足，不宜据此判断稳定规律。' : '样本达到阈値。'}`,
        }],
        text: `300750 宁德时代（示例数据）：近 20 个交易日中，满足“低开 ≥0.2%”的样本 ${st.lowOpenSamples} 个，其中收阳 ${st.lowOpenHits} 个，低开高走率 ${st.lowOpenRate.toFixed(1)}%。\n口径：低开 = 开盘较前收盘低至少 0.2%；收阳 = 收盘高于开盘；分母为低开样本数。${st.lowOpenSamples < 10 ? '当前样本不足 10，只作观察，不宣称稳定规律。' : ''}\n数据日期 2026-11-06 · 快照 snapshot-20261106-1532。`,
      });
    } else {
      agentPush({
        role: 'agent',
        tools: [
          { name: 'read_market_review', kind: '只读', duration: '412ms', params: '{"trade_date":"2026-11-06"}', meta: '指数 4 · 宽度 · 涨停 68 · 封板率 76.4% · 完整性 ok', summary: '上证 +0.82%，上涨 3,120 / 下跌 1,832；涨停 68，跌停 7；封板率 76.4%（68/89）。' },
          { name: 'read_limit_up_ladder', kind: '只读', duration: '331ms', params: '{"trade_date":"2026-11-06"}', meta: '梯队 6 档 · 涨停股 14 只 · 原因标注“规则推断”', summary: '最高 6 板（拓维信息）；4 板浪潮信息；3 板剑桥科技；2 板科大讯飞、新易盛、景嘉微。' },
        ],
        text: '2026-11-06 复盘（示例数据）：\n· 市场宽度：上涨 3,120 / 平盘 460 / 下跌 1,832。\n· 涨停 68、跌停 7、炸板 21，封板率 76.4%（分子 68 / 分母 89）。\n· 梯队：6 板 拓维信息；4 板 浪潮信息；3 板 剑桥科技；2 板 科大讯飞、新易盛、景嘉微。\n· 涨停题材由原因文本规则聚类，标注为推断，非交易所事实；数据日期 2026-11-06，完整性 ok。',
      });
    }
    state.agent.busy = false;
    renderAgent();
  }, 820);
}

function agentConfirm() {
  if (!state.agent.pending) return;
  if (state.connection !== 'online') {
    agentPush({ role: 'agent', text: '远端断连，提交被拒绝，未创建任务。请先重连再试。' });
    state.agent.pending = null;
    state.agent.messages = state.agent.messages.map((m) => (m.confirm ? { ...m, confirm: false } : m));
    renderAgent();
    toast('远端断连：Agent 提交被拒绝', 'bad');
    return;
  }
  state.agent.pending = null;
  state.agent.messages = state.agent.messages.map((m) => (m.confirm ? { ...m, confirm: false } : m));
  if (state.watchlist.length === 0) {
    agentPush({ role: 'agent', text: '观察池为空，已取消提交。' });
    renderAgent();
    return;
  }
  const form = { strategy: '首板回封 v0.1.3', pool: '观察池', from: '2024-01-02', to: '2026-11-06', capital: 100000, maxPos: 5, fee: 0.0003, stamp: 0.001, slip: 0.001 };
  const id = `T-${state.seq++}`;
  const task = {
    id, type: '回测', status: 'running', progress: 2, submitted: nowTime(),
    params: `${form.strategy} · 观察池 ${state.watchlist.length} 只 · ${form.from} → ${form.to} · 初始 ${fmt(form.capital, 0)} 元 · 来源：内置 Agent`,
    cancelable: true, server: 'AutoDL · backtest-1', result: null, form,
    logs: [`${nowTime()} Agent 确认提交，任务受理`, `${nowTime()} 数据快照 snapshot-20261106-1532 校验通过`, `${nowTime()} 参数：最大持仓 ${form.maxPos}，佣金 ${form.fee}，印花税 ${form.stamp}，滑点 ${form.slip}`],
  };
  state.tasks.unshift(task);
  state.selectedTask = id;
  agentPush({
    role: 'agent',
    tools: [{ name: 'submit_backtest', kind: '计算', duration: '1.1s', params: `{"strategy":"${form.strategy}","pool":"watchlist","range":"${form.from}..${form.to}"}`, meta: `task_id=${id} · 已记录到 UI 与审计`, summary: `回测任务已创建：${id}，可在任务中心查看进度、日志与产物。` }],
    text: `已提交回测任务 ${id}。任务在远端运行，可继续提问；在任务中心可查看进度或取消。`,
    actions: [{ label: '打开任务中心 ›', action: 'agent-open-task' }],
  });
  renderAgent();
  renderAll();
  toast(`Agent 已提交回测任务 ${id}`, 'ok');
}
function agentCancel() {
  state.agent.pending = null;
  state.agent.messages = state.agent.messages.map((m) => (m.confirm ? { ...m, confirm: false } : m));
  agentPush({ role: 'agent', text: '已取消提交，未创建任何任务。' });
  renderAgent();
}

/* ---------- 右栏上下文 ---------- */
function ctxStock(code) {
  const s = stockByCode(code);
  if (!s) return '';
  const st = statsFor(s);
  const inWatch = state.watchlist.includes(s.code);
  return `<div class="ctx-section">
    <div class="ctx-stock-name"><h3>${esc(s.name)}</h3><span class="small muted">${esc(s.board)}</span></div>
    <div class="small muted">${s.code} · ${esc(s.industry)}</div>
    <div class="ctx-price"><span class="price ${cls(s.chg)}">${fmt(s.price)}</span><span class="${cls(s.chg)}">${pct(s.chg)}</span></div>
    <div class="ctx-mini-chart">${sparklineSvg(s)}</div>
    <div class="ctx-actions">
      <button class="btn btn-small btn-primary" data-action="open-stock" data-code="${s.code}">打开个股页</button>
      <button class="btn btn-small" data-action="toggle-watch" data-code="${s.code}">${inWatch ? '移出观察池' : '+ 观察池'}</button>
    </div>
  </div>
  <div class="ctx-section">
    <div class="ctx-label">快速统计</div>
    <dl class="ctx-kv">
      <dt>连板 / 近 20 日涨停</dt><dd>${s.ladder || 0} / ${s.limit20 || 0}</dd>
      <dt>低开高走率</dt><dd>${st.lowOpenRate.toFixed(1)}% <span class="muted">(${st.lowOpenHits}/${st.lowOpenSamples})</span></dd>
      <dt>换手率</dt><dd>${fmt(s.turnover)}%</dd>
      <dt>成交额</dt><dd>${money(s.amount)}</dd>
      <dt>流通市值</dt><dd>${money(s.mcap)}</dd>
    </dl>
    <div class="card-note">${st.lowOpenSamples < 10 ? '低开高走样本不足 10，仅作观察。' : '样本满足阈值，仍需结合口径使用。'} 数据日期 2026-11-06。</div>
  </div>
  ${stockNewsBlock(s)}
  <div class="ctx-section">
    <div class="ctx-label">标签</div>
    <div class="small muted">${s.concepts.map(esc).join(' · ')}</div>
  </div>`;
}

function ctxTask(task) {
  return `<div class="ctx-section">
    <div class="ctx-label">任务</div>
    <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><h3 class="num" style="font-size:16px">${task.id}</h3><span class="pill ${task.status === 'running' ? 'pill-running' : task.status === 'queued' ? 'pill-queued' : task.status === 'success' ? 'pill-success' : task.status === 'failed' ? 'pill-failed' : 'pill-canceled'}">${statusLabel(task.status)}</span></div>
    <div class="small muted" style="margin-top:2px">${esc(task.type)} · ${esc(task.server)}</div>
    <div class="task-mini" style="margin:10px 0 4px"><span class="progress ${task.status === 'success' ? 'done' : task.status === 'failed' ? 'fail' : ''}" style="flex:1"><i style="width:${task.progress}%"></i></span><span class="num">${task.progress}%</span></div>
  </div>
  <div class="ctx-section"><div class="ctx-label">参数摘要</div><div class="small">${esc(task.params)}</div></div>
  ${task.error ? `<div class="ctx-section"><div class="error-state" style="display:block"><strong>错误</strong><div style="margin-top:4px">${esc(task.error)}</div></div></div>` : ''}
  <div class="ctx-section">
    <div class="ctx-label">时间</div>
    <dl class="ctx-kv"><dt>提交</dt><dd class="num">${esc(task.submitted)}</dd><dt>完成</dt><dd class="num">${task.finished ? esc(task.finished) : '—'}</dd></dl>
  </div>
  <div class="ctx-section">
    <div class="ctx-label">产物</div>
    <div class="small">${task.artifact ? esc(task.artifact) : task.error ? '无产物' : '运行中，尚未生成'}</div>
    <div class="ctx-actions">
      <button class="btn btn-small" data-action="task-logs" data-task="${task.id}">日志</button>
      ${task.result ? `<button class="btn btn-small btn-primary" data-action="open-result" data-task="${task.id}">打开结果</button>` : ''}
      ${task.artifact && !task.result ? `<button class="btn btn-small" data-action="task-artifact" data-task="${task.id}">查看产物</button>` : ''}
      ${['running', 'queued'].includes(task.status) ? `<button class="btn btn-small btn-danger" data-action="cancel-task" data-task="${task.id}">取消</button>` : ''}
      ${task.status === 'failed' ? `<button class="btn btn-small" data-action="retry-backtest" data-task="${task.id}">重试</button>` : ''}
    </div>
  </div>
  <div class="ctx-section"></div>`;
}

function ctxDefault() {
  const meta = dataMeta(state.date);
  const running = state.tasks.filter((t) => ['running', 'queued'].includes(t.status));
  return `<div class="ctx-section">
    <div class="ctx-label">当前上下文</div>
    <div class="ctx-empty">未选择对象<br>单击表格行可在此预览个股或任务</div>
  </div>
  <div class="ctx-section">
    <div class="ctx-label">当前数据</div>
    <dl class="ctx-kv">
      <dt>交易日</dt><dd class="num">2026-11-06</dd>
      <dt>数据更新</dt><dd class="num">15:32</dd>
      <dt>完整性</dt><dd>${meta.mode === 'ok' ? '完整' : meta.mode === 'warn' ? '部分缺失' : '无数据'}</dd>
      <dt>连接</dt><dd>${state.connection === 'online' ? '已连接' : '已断连'}</dd>
    </dl>
  </div>
  <div class="ctx-section">
    <div class="ctx-label">最近任务 <button class="mini-link" data-action="open-tasks">全部</button></div>
    ${state.tasks.slice(0, 3).map((t) => `<button class="rail-item" data-action="task-focus" data-task="${t.id}" style="width:100%"><span class="num">${t.id}</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(t.type)}</span><span class="pill ${t.status === 'success' ? 'pill-success' : t.status === 'failed' ? 'pill-failed' : 'pill-running'}" style="margin-left:auto">${statusLabel(t.status)}</span></button>`).join('')}
    ${running.length ? `<div class="card-note">${running.length} 个任务运行/排队中。</div>` : ''}
  </div>
  <div class="ctx-section">
    <div class="ctx-label">快捷操作</div>
    <div class="ctx-actions">
      <button class="btn btn-small" data-route="review">复盘</button>
      <button class="btn btn-small" data-route="screener">筛选</button>
      <button class="btn btn-small" data-route="backtest">回测</button>
    </div>
  </div>`;
}

function renderContext() {
  const body = $('#context-body');
  if (!body) return;
  const taskMode = state.module === 'tasks' || (state.module === 'backtest' && state.sub === 'result');
  if (state.selectedTask && (taskMode || !state.selectedStock)) {
    const t = state.tasks.find((x) => x.id === state.selectedTask);
    body.innerHTML = t ? ctxTask(t) : ctxDefault();
    return;
  }
  if (state.selectedStock) { body.innerHTML = ctxStock(state.selectedStock); return; }
  if (state.selectedTask) {
    const t = state.tasks.find((x) => x.id === state.selectedTask);
    if (t) { body.innerHTML = ctxTask(t); return; }
  }
  body.innerHTML = ctxDefault();
}

/* ---------- 任务推进 / 完成 ---------- */
function finishTask(t) {
  t.progress = 100;
  t.status = 'success';
  t.finished = nowTime();
  t.logs.push(`${nowTime()} 任务成功`);
  if (t.type === '回测') {
    if (!t.result) t.result = buildBacktest(2026 + Number(t.id.slice(2)));
    t.artifact = t.artifact || `${t.id} · 净值 / 回撤 / 分年统计 / 交易明细`;
  } else if (!t.artifact) {
    t.artifact = t.type === '数据质量检查' ? '质量检查报告（示例）· 6 项检查' : `${t.type}结果（示例）`;
  }
  toast(`${t.id} ${t.type}完成`, 'ok');
  if (t.type === '回测' && state.module === 'tasks') {
    state.selectedTask = t.id;
    openTab('result', { taskId: t.id });
  }
}

function tickTasks() {
  let changed = false;
  const running = state.tasks.filter((t) => t.status === 'running');
  for (const t of running) {
    if (t.progress < 100) {
      const step = t.type === '回测' ? 7 : t.type === '数据质量检查' ? 3 : 5;
      t.progress = Math.min(100, t.progress + step);
      changed = true;
      if (t.progress % 20 < step) {
        t.logs.push(`${nowTime()} 进度 ${t.progress}% · ${t.type === '回测' ? '成交模拟进行中' : t.type === '数据质量检查' ? '检查项推进中' : '计算进行中'}`);
      }
      if (t.progress >= 100) finishTask(t);
    }
  }
  if (!state.tasks.some((t) => t.status === 'running')) {
    const q = state.tasks.find((t) => t.status === 'queued');
    if (q) {
      q.status = 'running';
      q.progress = 2;
      q.logs.push(`${nowTime()} 前序任务完成，开始执行`);
      changed = true;
    }
  }
  if (!changed) return;
  renderBottom();
  renderSidebar();
  renderContext();
  if (state.module === 'tasks' || (state.module === 'backtest' && state.sub === 'result')) renderView();
}

/* ---------- 任务操作 ---------- */
function focusTask(id) {
  state.selectedTask = id;
  $$('[data-action="task-focus"]').forEach((el) => el.classList.toggle('selected', el.dataset.task === id));
  renderContext();
  if (window.matchMedia('(max-width: 1100px)').matches) openContext();
}
function openLogs(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  state.logTaskId = id;
  $('#log-sub').textContent = `${t.id} · ${t.type} · ${statusLabel(t.status)} · ${t.progress}%`;
  $('#log-body').textContent = `${t.id} ${t.type}\n参数：${t.params}\n远端：${t.server}\n提交：${t.submitted}${t.finished ? ` · 完成：${t.finished}` : ''}\n状态：${statusLabel(t.status)}（${t.progress}%）\n${t.error ? `错误：${t.error}\n` : ''}\n--- 日志 ---\n${t.logs.join('\n')}`;
  $('#log-wrap').hidden = false;
}
function requestCancel(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t || !['running', 'queued'].includes(t.status)) return;
  if (!t.cancelable) {
    t.logs.push(`${nowTime()} 用户请求取消，被拒绝：该任务不支持安全中止`);
    toast('取消失败：该任务不支持安全中止，状态保持运行，不会被标记为已取消。', 'bad');
    if (state.logTaskId === t.id) openLogs(t.id);
    renderContext();
    return;
  }
  openModal({
    title: '取消任务',
    body: `<p>确认取消 <b class="num">${t.id}</b>（${esc(t.type)}）？</p><p class="small muted">取消会请求远端安全中止；失败会明确报告。</p>`,
    confirmText: '确认取消',
    danger: true,
    onConfirm: () => {
      t.status = 'canceled';
      t.finished = nowTime();
      t.logs.push(`${nowTime()} 已请求远端安全中止`, `${nowTime()} 任务已取消（未生成产物）`);
      toast(`任务 ${t.id} 已取消`, 'warn');
      renderAll();
    },
  });
}
function openArtifact(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.result) { openTab('result', { taskId: t.id }); return; }
  openModal({
    title: `产物 · ${t.id}`,
    confirmText: '关闭',
    cancelText: '',
    body: `<p>${esc(t.artifact || '暂无产物')}</p>`,
  });
}

/* ---------- 交互辅助 ---------- */
const MCP_SNIPPET = `{
  "mcpServers": {
    "quant-workbench": {
      "type": "streamable-http",
      "url": "https://autodl-demo.example:8443/mcp",
      "headers": {
        "Authorization": "Bearer <LOCAL_TOKEN>"
      }
    }
  }
}`;

function selectStock(code) {
  if (!stockByCode(code)) return;
  state.selectedStock = code;
  $$('[data-stock]').forEach((el) => el.classList.toggle('selected', el.dataset.stock === code));
  renderContext();
  if (window.matchMedia('(max-width: 1100px)').matches) openContext();
}
function openContext() { $('#context-panel').classList.add('open'); }
function closeContext() { $('#context-panel').classList.remove('open'); }

function addWatch(code) {
  if (!stockByCode(code)) return;
  if (state.watchlist.includes(code)) { toast(`${stockByCode(code).name} 已在观察池`, 'info'); return; }
  state.watchlist.push(code);
  persist();
  renderAll();
  toast(`已加入观察池：${stockByCode(code).name}（本地持久化）`, 'ok');
}
function removeWatch(code) {
  state.watchlist = state.watchlist.filter((c) => c !== code);
  persist();
  renderAll();
  toast(`已移出观察池：${stockByCode(code)?.name || code}`, 'info');
}
function toggleWatch(code) { state.watchlist.includes(code) ? removeWatch(code) : addWatch(code); }

function researchTask(code) {
  const s = stockByCode(code);
  if (!s) return;
  const id = `T-${state.seq++}`;
  state.tasks.unshift({
    id, type: '个股研究', status: 'queued', progress: 0, submitted: nowTime(),
    params: `${s.code} ${s.name} · 日K / 资金流 / 涨停记录（示例）`, cancelable: true,
    server: 'AutoDL · queue', logs: [`${nowTime()} 已创建研究任务，等待调度`],
  });
  renderAll();
  toast(`已创建研究任务 ${id}：${s.name}`, 'ok');
}

function openDataStatus() {
  openModal({
    title: '数据状态与质量检查',
    confirmText: '关闭',
    cancelText: '',
    body: `<dl class="ctx-kv" style="margin-bottom:12px">
      <dt>最近交易日</dt><dd class="num">2026-11-06</dd>
      <dt>更新时间</dt><dd class="num">15:32</dd>
      <dt>股票覆盖</dt><dd>5,412 只（覆盖率 99.2%）</dd>
      <dt>连接</dt><dd>${state.connection === 'online' ? '已连接 AutoDL' : '已断连 · 缓存数据'}</dd>
    </dl>
    <div class="table-wrap"><table class="data"><thead><tr><th>检查项</th><th>结果</th><th>说明</th></tr></thead><tbody>
      <tr><td>交易日完整性</td><td><span class="tag tag-ok">通过</span></td><td class="muted">2016-01-04 至今</td></tr>
      <tr><td>股票覆盖数量</td><td><span class="tag tag-ok">通过</span></td><td class="muted">5,412 只，异常 0</td></tr>
      <tr><td>价格 / 成交异常</td><td><span class="tag tag-warn">警告</span></td><td class="muted">2 条待人工确认，已排除出统计</td></tr>
      <tr><td>复权因子</td><td><span class="tag tag-ok">通过</span></td><td class="muted">最近 3 年对齐</td></tr>
      <tr><td>股票状态冲突</td><td><span class="tag tag-ok">通过</span></td><td class="muted">ST / 停牌 / 新股按历史日期</td></tr>
      <tr><td>关键源 limit_reason</td><td><span class="tag tag-bad">失败</span></td><td class="muted">2026-11-05 重试 2 次后放弃</td></tr>
    </tbody></table></div>
    <div class="form-actions" style="margin-top:12px">
      <button class="btn btn-small" data-action="run-data-update" ${state.connection === 'offline' ? 'disabled' : ''}>更新今日数据</button>
      <button class="btn btn-small" data-action="run-data-backfill" ${state.connection === 'offline' ? 'disabled' : ''}>补数</button>
      <button class="btn btn-small" data-action="run-data-check" ${state.connection === 'offline' ? 'disabled' : ''}>质量检查</button>
      <span class="small muted">更新失败保留上次成功数据日期</span>
    </div>`,
  });
}

function openSector(name) {
  const comp = UNIVERSE.filter((s) => s.industry === name);
  openModal({
    title: `板块成分股 · ${name}`,
    confirmText: '关闭',
    cancelText: '',
    body: `${comp.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>股票</th><th class="num">涨跌幅</th><th class="num">连板</th><th></th></tr></thead><tbody>${comp.map((s) => `<tr><td>${esc(s.name)} <span class="num muted">${s.code}</span></td><td class="num ${cls(s.chg)}">${pct(s.chg)}</td><td class="num">${s.ladder || '—'}</td><td style="text-align:right"><button class="mini-link" data-action="open-stock" data-code="${s.code}">打开</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">示例数据中暂无该板块成分股。</p>'}`,
  });
}

function openSecurity() {
  openModal({
    title: 'MCP 安全与权限说明',
    confirmText: '关闭',
    cancelText: '',
    body: `<ul class="assume-list"><li>远端 API / MCP 不允许匿名公网访问，token 走本地凭证管理，不写入 Git、日志或截图。</li><li>Agent 只能调用受控工具，不直接访问底层文件/数据库，也不能通过 shell 执行任意用户代码。</li><li>查询无需确认；提交计算任务在 UI 留痕；删除数据、改全局配置等破坏性操作需要用户确认。</li><li>v1 不提供交易工具，不接券商下单。</li><li>工具返回必须带数据日期、口径/版本、完整性提示与错误信息。</li></ul>`,
  });
}

function copyMcp() {
  const text = MCP_SNIPPET;
  const done = () => toast('已复制 MCP 接入配置（示例 token 需替换）', 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch (e) { toast('复制失败，请手动选择配置文本', 'bad'); }
}

let reconnecting = false;
function toggleConnection() {
  if (state.connection === 'online') {
    state.connection = 'offline';
    if (state.agentOpened) renderAgent();
    renderAll();
    toast('已模拟远端断连：现有结果标记为缓存，提交类操作已禁用', 'warn');
  } else reconnect();
}
function reconnect() {
  if (reconnecting || state.connection === 'online') return;
  reconnecting = true;
  const btn = $('#btn-reconnect');
  if (btn) btn.textContent = '连接中…';
  toast('正在重连 AutoDL…', 'info');
  setTimeout(() => {
    state.connection = 'online';
    reconnecting = false;
    if (btn) btn.textContent = '重新连接';
    if (state.agentOpened) renderAgent();
    renderAll();
    toast(`已恢复连接 · 已同步远端任务 ${state.tasks.length} 条，运行中 ${state.tasks.filter((t) => ['running', 'queued'].includes(t.status)).length} 个`, 'ok');
  }, 1200);
}

/* ---------- 选股篮 / 链路回填 ---------- */
function addBasket(code) {
  if (!stockByCode(code)) return;
  if (state.basket.includes(code)) { toast('已在选股篮中', 'info'); return; }
  state.basket.push(code);
  persist();
  renderAll();
  toast(`已加入选股篮：${stockByCode(code).name}（${state.basket.length} 只）`, 'ok');
}
function toBacktestFromBasket() {
  if (!state.basket.length) { toast('选股篮为空：先从复盘或个股加入标的', 'warn'); return; }
  state.btForm = { ...state.btForm, pool: '选股篮' };
  openTab('backtest');
  toast(`回测股票池已回填为选股篮（${state.basket.length} 只）`, 'ok');
}
function basketCodes() { return state.basket.slice(); }

/* ---------- 观察池分组 / 备注 ---------- */
const WATCH_GROUPS = ['核心', '弹性', '观察', '未分组'];
function cycleWatchGroup(code) {
  const meta = state.watchMeta[code] || {};
  const cur = meta.group || '未分组';
  const next = WATCH_GROUPS[(WATCH_GROUPS.indexOf(cur) + 1) % WATCH_GROUPS.length];
  state.watchMeta[code] = { ...meta, group: next };
  persist();
  renderAll();
  toast(`${stockByCode(code)?.name || code} → ${next}`, 'info');
}

/* ---------- 导出 ---------- */
function exportCsv(target) {
  let rows = [];
  let name = 'export';
  if (target === 'screen') {
    name = `screen-${state.date}`;
    rows = [['代码', '名称', '涨跌幅', '换手率', '连板'], ...(state.screen.results || []).map((s) => [s.code, s.name, s.chg, s.turnover, s.ladder || 0])];
  } else if (target === 'trades') {
    name = 'trades-T-1041';
    rows = [['开仓', '平仓', '代码', '数量', '成交价', '盈亏'], ...buildBacktest(101).trades.map((t) => [t.open, t.close, t.code, t.qty, t.price, t.pnl])];
  } else {
    name = 'watchlist';
    rows = [['代码', '名称', '分组', '备注'], ...state.watchlist.map((c) => { const s = stockByCode(c); const m = state.watchMeta[c] || {}; return [c, s ? s.name : '', m.group || '', m.note || '']; })];
  }
  const csv = '\ufeff' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`已导出 ${name}.csv（示例数据）`, 'ok');
}

/* ---------- 设置 / 数据任务 ---------- */
function runDataJob(kind) {
  if (state.connection === 'offline') { toast('远端断连：无法触发数据任务', 'bad'); return; }
  closeModal();
  const id = `T-${state.seq++}`;
  state.tasks.unshift({
    id, type: kind, status: 'running', progress: 4, submitted: nowTime(),
    params: `${kind} · 2026-11-06 · 示例源`, cancelable: true, server: 'AutoDL · worker-2',
    logs: [`${nowTime()} ${kind}任务受理`, `${nowTime()} 拉取示例数据源`],
  });
  openTab('tasks');
  toast(`已提交${kind}任务 ${id}`, 'ok');
}

function openSettings() {
  const st = state.settings;
  openModal({
    title: '设置',
    confirmText: '保存',
    body: `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="field"><label for="set-bench">基准指数</label><select id="set-bench">${['沪深300', '中证500', '中证1000', '创业板指'].map((b) => `<option ${st.benchmark === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label for="set-fee">佣金费率</label><input id="set-fee" type="number" step="0.0001" value="${st.fee}"></div>
      <div class="field"><label for="set-stamp">印花税（卖出）</label><input id="set-stamp" type="number" step="0.0001" value="${st.stamp}"></div>
      <div class="field"><label for="set-slip">滑点</label><input id="set-slip" type="number" step="0.0001" value="${st.slip}"></div>
    </div>`,
    onConfirm: () => {
      state.settings = { ...state.settings, benchmark: $('#set-bench').value, fee: Number($('#set-fee').value), stamp: Number($('#set-stamp').value), slip: Number($('#set-slip').value) };
      persist();
      toast('设置已保存', 'ok');
    },
  });
}

function openMetricInfo(id) {
  const m = METRICS.find((x) => x.id === id);
  if (!m) return;
  openModal({
    title: `口径 · ${m.name}`,
    confirmText: '关闭',
    cancelText: '',
    body: `<dl class="ctx-kv">
      <dt>标识</dt><dd class="tool-tag">${esc(m.id)}</dd>
      <dt>定义</dt><dd>${esc(m.formula)}</dd>
      <dt>窗口</dt><dd>${esc(m.window)}</dd>
      <dt>样本</dt><dd>${esc(m.sample)}</dd>
      <dt>版本</dt><dd>${esc(m.version)}</dd>
      <dt>状态</dt><dd>${esc(m.status)}</dd>
    </dl>`,
  });
}

/* ---------- 搜索 ---------- */
function searchResults(q) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const items = [];
  UNIVERSE.forEach((st) => {
    if (st.code.includes(query) || st.name.toLowerCase().includes(query) || st.industry.toLowerCase().includes(query)) {
      items.push({ kind: 'stock', code: st.code, label: `${st.name} ${st.code}`, hint: st.industry });
    }
  });
  SECTORS.forEach((x) => { if (x.name.includes(query)) items.push({ kind: 'sector', label: `板块 · ${x.name}`, hint: pct(x.chg) }); });
  state.tasks.forEach((t) => { if (t.id.toLowerCase().includes(query) || t.type.includes(query)) items.push({ kind: 'task', label: `${t.id} ${t.type}`, hint: statusLabel(t.status) }); });
  return items.slice(0, 8);
}
function renderSearch() {
  const box = $('#search-results');
  if (!box) return;
  const items = searchResults(state.searchQuery);
  if (!state.searchQuery.trim()) { box.innerHTML = '<div class="search-empty">代码、名称或板块</div>'; return; }
  box.innerHTML = items.length ? items.map((it, i) => `<button class="search-item ${i === 0 ? 'active' : ''}" data-action="search-pick" data-kind="${it.kind}" data-code="${it.code || ''}" data-label="${esc(it.label)}">
      <span>${esc(it.label)}</span><span class="hint">${esc(it.hint)}</span></button>`).join('')
    : '<div class="search-empty">没有匹配项</div>';
}
function closeSearch() { state.searchOpen = false; $('#search-wrap').hidden = true; }
function pickSearch(kind, code, label) {
  closeSearch();
  if (kind === 'stock') openTab('stock', { code });
  else if (kind === 'sector') openSector(label.replace('板块 · ', ''));
  else if (kind === 'task') openTab('tasks');
}

function openSearch() {
  state.searchOpen = true;
  state.searchQuery = '';
  $('#search-wrap').hidden = false;
  const input = $('#search-input');
  input.value = '';
  renderSearch();
  setTimeout(() => input.focus(), 20);
}
function closeSearch() { state.searchOpen = false; $('#search-wrap').hidden = true; }
function pickSearch(kind, code, label) {
  closeSearch();
  if (kind === 'stock') openTab('stock', { code });
  else if (kind === 'sector') openSector(label.replace('板块 · ', ''));
  else if (kind === 'task') openTab('tasks');
}

/* ---------- 动作分发 ---------- */
function handleAction(action, el) {
  const code = el.dataset.code;
  const id = el.dataset.task;
  switch (action) {
    case 'select-stock': selectStock(code); break;
    case 'open-stock': closeModal(); openTab('stock', { code }); break;
    case 'add-watch': addWatch(code); break;
    case 'remove-watch': removeWatch(code); break;
    case 'toggle-watch': toggleWatch(code); break;
    case 'go-review': openTab('review'); break;
    case 'go-latest': state.date = '2026-11-06'; state.reviewLoading = true; renderAll(); setTimeout(() => { state.reviewLoading = false; renderAll(); }, 550); break;
    case 'refresh-review': {
      if (state.connection === 'offline') { toast('远端断连：无法刷新，当前仍为 2026-11-06 缓存。', 'bad'); return; }
      state.reviewLoading = true; renderView();
      setTimeout(() => { state.reviewLoading = false; renderAll(); toast('复盘已刷新 · 数据日期 2026-11-06', 'ok'); }, 650);
      break;
    }
    case 'data-status': openDataStatus(); break;
    case 'metric-info': openMetricInfo(el.dataset.metric); break;
    case 'open-settings': openSettings(); break;
    case 'sector': openSector(el.dataset.sector); break;
    case 'add-condition': addCondition(); break;
    case 'remove-condition': state.screen.conditions.splice(Number(el.dataset.idx), 1); renderAll(); break;
    case 'clear-conditions': state.screen.conditions = []; state.screen.results = null; state.screen.ran = false; renderAll(); break;
    case 'run-screen': runScreen(); break;
    case 'save-screen': saveScreen(); break;
    case 'load-screen': loadScreen(el.dataset.screen); break;
    case 'screen-page': state.screen.page = Number(el.dataset.page); renderView(); break;
    case 'screen-sort': {
      const key = el.dataset.key;
      if (state.screen.sort.key === key) state.screen.sort.dir *= -1;
      else state.screen.sort = { key, dir: -1 };
      state.screen.page = 1;
      renderView();
      break;
    }
    case 'submit-backtest': submitBacktest(); break;
    case 'retry-backtest': openTab('backtest'); toast('已回到回测配置，原失败任务的参数与日志仍保留在任务中心', 'info'); break;
    case 'task-filter': state.taskFilter = el.dataset.filter; renderView(); break;
    case 'task-focus': focusTask(el.dataset.task); break;
    case 'task-logs': openLogs(el.dataset.task); break;
    case 'cancel-task': requestCancel(el.dataset.task); break;
    case 'task-artifact': openArtifact(el.dataset.task); break;
    case 'open-result': openTab('result', { taskId: el.dataset.task }); break;
    case 'trade-page': state.tradePage = Number(el.dataset.page); renderView(); break;
    case 'open-tasks': openTab('tasks'); break;
    case 'open-logs': openLogs(id || state.selectedTask || state.tasks[0].id); break;
    case 'research-task': researchTask(code); break;
    case 'open-agent': openAgent(); break;
    case 'agent-preset': sendAgent(el.dataset.text); break;
    case 'agent-confirm': agentConfirm(); break;
    case 'open-news':
      if (el.dataset.id && state.sub === 'news') { state.newsSelected = el.dataset.id; renderView(); }
      else openNews(el.dataset.code || null, el.dataset.id || null);
      break;
    case 'news-kind': state.newsKind = el.dataset.kind; renderView(); break;
    case 'news-all': openNews(null); break;
    case 'news-origin': toast('原型静态示例：原文入口未接入，不跳转外部链接', 'warn'); break;
    case 'flow-window': state.flowWindow = el.dataset.window; renderView(); break;
    case 'basket-add': addBasket(code); break;
    case 'basket-to-backtest': toBacktestFromBasket(); break;
    case 'export-csv': exportCsv(el.dataset.target); break;
    case 'watch-group': cycleWatchGroup(code); break;
    case 'run-data-update': runDataJob('日线更新'); break;
    case 'run-data-backfill': runDataJob('原因补数'); break;
    case 'run-data-check': runDataJob('质量检查'); break;
    case 'search-pick': pickSearch(el.dataset.kind, el.dataset.code, el.dataset.label); break;
    case 'close-search': closeSearch(); break;
    case 'agent-cancel': agentCancel(); break;
    case 'agent-open-task': closeAgent(); openTab('tasks'); break;
    case 'toggle-connection': toggleConnection(); break;
    case 'reconnect': reconnect(); break;
    case 'copy-mcp': copyMcp(); break;
    case 'mcp-security': openSecurity(); break;
    case 'open-context': openContext(); break;
    case 'close-context': closeContext(); break;
    default: break;
  }
}

/* ---------- 指标口径（按需弹窗） ---------- */
const METRICS = [
  { id: 'low_open_high_close', name: '低开高走率', formula: '低开（开盘较前收盘 ≤ -0.2%）样本中，收盘 > 开盘 的比例', window: '20 个交易日', sample: '6–14', version: 'v0.2', status: '待确认' },
  { id: 'seal_rate', name: '封板率', formula: '涨停数 /（涨停数 + 炸板数）', window: '当日', sample: '89', version: 'v0.3', status: '已确认' },
  { id: 'excess', name: '超额收益', formula: '策略累计收益 − 基准累计收益', window: '回测区间', sample: '34 个月', version: 'v0.2', status: '已确认' },
];
/* ---------- 汇总渲染 ---------- */
function renderAll() {
  renderTop();
  renderTabs();
  renderSidebar();
  renderView();
  renderContext();
  renderBottom();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', (e) => {
  const closeDrawer = e.target.closest('[data-close-drawer]');
  if (closeDrawer) {
    if (closeDrawer.dataset.closeDrawer === 'agent') closeAgent();
    else $('#log-wrap').hidden = true;
    return;
  }
  if (e.target.closest('[data-close-modal]')) { closeModal(); return; }

  const subTab = e.target.closest('[data-sub]');
  if (subTab) { setSub(state.module, subTab.dataset.sub); return; }

  const actionEl = e.target.closest('[data-action]');
  if (actionEl) { handleAction(actionEl.dataset.action, actionEl); return; }

  const routeEl = e.target.closest('[data-route]');
  if (routeEl) { openTab(routeEl.dataset.route); return; }

  const stockEl = e.target.closest('[data-stock]');
  if (stockEl) selectStock(stockEl.dataset.stock);
});

document.addEventListener('dblclick', (e) => {
  const tr = e.target.closest('[data-stock]');
  if (tr && !e.target.closest('[data-action]')) openTab('stock', { code: tr.dataset.stock });
});

document.addEventListener('change', (e) => {
  if (e.target.dataset && e.target.dataset.note) {
    const code = e.target.dataset.note;
    state.watchMeta[code] = { ...(state.watchMeta[code] || {}), note: e.target.value };
    persist();
    toast('备注已保存', 'ok');
    return;
  }
  if (e.target.id === 'review-date') {
    state.date = e.target.value;
    state.reviewLoading = true;
    renderAll();
    setTimeout(() => { state.reviewLoading = false; renderAll(); }, 520);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#search-wrap').hidden) { closeSearch(); return; }
    if (!$('#modal-wrap').hidden) { closeModal(); return; }
    if (!$('#agent-wrap').hidden) { closeAgent(); return; }
    if (!$('#log-wrap').hidden) { $('#log-wrap').hidden = true; return; }
    closeContext();
    return;
  }
});

function bindStatic() {
  $('#btn-agent').addEventListener('click', toggleAgent);
  $('#btn-search').addEventListener('click', openSearch);
  $('#btn-settings').addEventListener('click', openSettings);
  const searchInput = $('#search-input');
  searchInput.addEventListener('input', (e) => { state.searchQuery = e.target.value; renderSearch(); });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('#search-results .search-item'); if (first) first.click(); }
  });
  $('#btn-connection').addEventListener('click', toggleConnection);
  $('#btn-context').addEventListener('click', openContext);
  $('#btn-context-2').addEventListener('click', openContext);
  $('#btn-context-close').addEventListener('click', closeContext);
  $('#btn-open-tasks').addEventListener('click', () => openTab('tasks'));
  $('#btn-logs').addEventListener('click', () => {
    const t = state.tasks.find((x) => x.status === 'running') || state.tasks.find((x) => x.status === 'queued') || state.tasks[0];
    if (t) openLogs(t.id);
  });
  $('#btn-reconnect').addEventListener('click', reconnect);
  $('#offline-banner').addEventListener('click', (e) => { if (e.target.closest('button')) return; });

  $('#agent-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#agent-input');
    const v = input.value;
    if (!v.trim()) return;
    input.value = '';
    sendAgent(v);
  });
}

/* ---------- 启动 ---------- */
function init() {
  state.watchlist = state.watchlist.filter((c) => stockByCode(c));
  state.savedScreens = state.savedScreens.filter((s) => Array.isArray(s.conditions));
  bindStatic();
  renderAll();
  renderAgent();
  setTimeout(() => { state.reviewLoading = false; renderAll(); }, 760);
  setInterval(tickTasks, 1100);
}

init();
