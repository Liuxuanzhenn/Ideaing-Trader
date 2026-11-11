/**
 * 展示层指标口径检查（RSI / 周月聚合）。
 * 直接 import 源码里的纯函数，不做文本匹配，所以公式一改这里就会红。
 * 用法：npm run check:indicators
 */
import { aggregate, rsi, type KPeriod } from '../src/lib/indicators.ts';

let failed = 0;
const fail = (message: string) => {
  failed += 1;
  console.error('FAIL', message);
};
const near = (a: number | null, b: number | null, message: string, tol = 1e-9) => {
  if (a === null || b === null) {
    if (a !== b) fail(`${message}：期望 ${b}，实际 ${a}`);
    return;
  }
  if (Math.abs(a - b) > tol) fail(`${message}：期望 ${b}，实际 ${a}`);
};

const walk = (length: number, step: number, start = 10) =>
  Array.from({ length }, (_, i) => start + i * step);

// 1) RSI 预热期没有样本 → null（不拿 50 冒充）
const warm = rsi(walk(20, 1));
if (warm.slice(0, 14).some((v) => v !== null)) fail('RSI 前 14 根应为 null');
if (warm[14] === null) fail('RSI 第 15 根应有值');

// 2) 单边涨 = 100，单边跌 = 0
near(rsi(walk(40, 1))[39], 100, '单边上涨 RSI 应为 100');
near(rsi(walk(40, -1, 100))[39], 0, '单边下跌 RSI 应为 0');

// 3) 全平盘窗口 → null（冻结口径：不代表超买 100，也不伪造中性 50）
const flat = rsi(Array.from({ length: 40 }, () => 20));
if (flat.slice(14).some((v) => v !== null)) fail('全平盘 RSI 应为 null（断线），实际给出了数值');
if (!flat.slice(0, 14).every((v) => v === null)) fail('全平盘预热期同样应为 null');

// 4) 与直白参考实现逐点比对（5 条随机游走 × 200 根）
function reference(closes: number[], span = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= span) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= span; i += 1) {
    const diff = closes[i] - closes[i - 1];
    gain += Math.max(0, diff);
    loss += Math.max(0, -diff);
  }
  gain /= span;
  loss /= span;
  for (let i = span; i < closes.length; i += 1) {
    if (i > span) {
      const diff = closes[i] - closes[i - 1];
      gain = (gain * (span - 1) + Math.max(0, diff)) / span;
      loss = (loss * (span - 1) + Math.max(0, -diff)) / span;
    }
    out[i] = gain === 0 && loss === 0 ? null : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
let seed = 7;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let trial = 0; trial < 5; trial += 1) {
  const closes = [50];
  for (let i = 1; i < 200; i += 1) closes.push(Math.max(1, closes[i - 1] * (1 + (random() - 0.5) * 0.08)));
  const actual = rsi(closes);
  const expected = reference(closes);
  for (let i = 0; i < closes.length; i += 1) near(actual[i], expected[i], `随机序列#${trial} 第 ${i} 根`);
}

// 5) 值域
const values = rsi(Array.from({ length: 300 }, () => 10 + random() * 20)).filter((v): v is number => v !== null);
if (values.some((v) => v < 0 || v > 100)) fail('RSI 越界');

// 6) 周/月聚合边界：每 5/20 根一组、末组可不足、date 取末根、量求和、高低取极值
const bars = Array.from({ length: 23 }, (_, i) => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  open: 10 + i,
  high: 12 + i,
  low: 8 + i,
  close: 11 + i,
  volume: 100 + i,
}));
const week = aggregate(bars, 'week');
if (week.length !== 5) fail(`周线应为 5 组，实际 ${week.length}`);
if (week[4].date !== '2026-01-23') fail(`末组 date 应取末根，实际 ${week[4].date}`);
if (week[4].open !== 30 || week[4].close !== 33) fail('末组开/收错误');
if (week[0].high !== 16 || week[0].low !== 8) fail('首组高低应取极值');
if (week[0].volume !== 510) fail(`首组量应为 510，实际 ${week[0].volume}`);
const month = aggregate(bars, 'month');
if (month.length !== 2) fail(`月线应为 2 组，实际 ${month.length}`);
if (month[1].volume !== bars.slice(20).reduce((sum, bar) => sum + bar.volume, 0)) fail('月线末组量错误');
if (aggregate(bars, 'day' as KPeriod) !== bars) fail('日线应原样返回');

if (failed) {
  console.error(`指标口径检查失败，${failed} 项`);
  process.exit(1);
}
console.log('指标口径检查通过：RSI 预热 null / 平盘 null / 单边 100·0 / 参考实现 5×200 / 值域；周月聚合边界 7 项');
