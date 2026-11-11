/**
 * 展示层指标数学（纯函数，无 DOM 无 JSX）。
 * 这些值不是后端权威指标：KDJ / RSI / MACD 与周月聚合都由前端按日线现算，
 * 口径写在各函数上方，改公式前先看注释里的冻结决策。
 */
import type { Candle } from '../api/types';

export type KPeriod = 'day' | 'week' | 'month';
export type KIndicator = 'macd' | 'kdj' | 'rsi';

/** 图表 time 必须是 yyyy-mm-dd；单条坏日期丢弃，不让它拖垮整页。 */
export function isoDate(date: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (/^\d{2}-\d{2}$/.test(date)) return `${new Date().getFullYear()}-${date}`;
  return null;
}

export function sma(values: number[], span: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= span) sum -= values[i - span];
    out.push(i >= span - 1 ? sum / span : null);
  }
  return out;
}

export function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  let prev = values[0] ?? 0;
  return values.map((value) => {
    prev = value * k + prev * (1 - k);
    return prev;
  });
}

export function macd(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const dif = closes.map((_, i) => fast[i] - slow[i]);
  const dea = ema(dif, 9);
  return { dif, dea, hist: dif.map((value, i) => (value - dea[i]) * 2) };
}

/**
 * KDJ(9,3,3)：RSV 窗口取最近 9 根，不足 9 根时用已有长度（通达信同口径）；
 * K/D 初值 50，J = 3K - 2D。
 */
export function kdj(candles: Candle[]) {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  let prevK = 50;
  let prevD = 50;
  candles.forEach((candle, i) => {
    const window = candles.slice(Math.max(0, i - 8), i + 1);
    const high = Math.max(...window.map((item) => item.high));
    const low = Math.min(...window.map((item) => item.low));
    const rsv = high === low ? 50 : ((candle.close - low) / (high - low)) * 100;
    prevK = (2 / 3) * prevK + (1 / 3) * rsv;
    prevD = (2 / 3) * prevD + (1 / 3) * prevK;
    k.push(prevK);
    d.push(prevD);
    j.push(3 * prevK - 2 * prevD);
  });
  return { k, d, j };
}

/**
 * Wilder RSI(14)：前 span 根没有足够样本，返回 null 而不是拿 50 冒充。
 * 种子用前 span 个涨跌幅的简单平均，之后按 (prev*(span-1)+x)/span 平滑。
 */
export function rsi(closes: number[], span = 14): (number | null)[] {
  const out: (number | null)[] = out_of(closes.length);
  if (closes.length <= span) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= span; i += 1) {
    const diff = closes[i] - closes[i - 1];
    avgGain += Math.max(0, diff);
    avgLoss += Math.max(0, -diff);
  }
  avgGain /= span;
  avgLoss /= span;
  for (let i = span; i < closes.length; i += 1) {
    if (i > span) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (span - 1) + Math.max(0, diff)) / span;
      avgLoss = (avgLoss * (span - 1) + Math.max(0, -diff)) / span;
    }
    // 全平盘窗口没有方向信息：返回 null（图上断线），不给 100 也不给 50
    out[i] = avgGain === 0 && avgLoss === 0 ? null : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** 预热期的空位，长度对齐 K 线。 */
export function out_of(length: number): (number | null)[] {
  return Array.from({ length }, () => null);
}

/**
 * 周/月按 5 / 20 个交易日近似聚合，从窗口起点每 5/20 根切一刀——**不等于自然周月**：
 * 窗口起点若落在周中，分组会整体偏移；末尾不足一组也照常输出。date 取该组最后一根。
 * 真实自然周由后端按日历聚合，这里只是展示层近似。
 */
export function aggregate(candles: Candle[], period: KPeriod): Candle[] {
  if (period === 'day') return candles;
  const size = period === 'week' ? 5 : 20;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    if (!chunk.length) continue;
    out.push({
      date: chunk[chunk.length - 1].date,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((item) => item.high)),
      low: Math.min(...chunk.map((item) => item.low)),
      volume: chunk.reduce((sum, item) => sum + item.volume, 0),
    });
  }
  return out;
}

