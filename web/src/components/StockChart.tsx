import { useMemo, useRef, useState } from 'react';
import type { Candle } from '../api/types';
import { fmt, pct } from '../lib/format';

export type KPeriod = 'day' | 'week' | 'month';
export type KIndicator = 'macd' | 'kdj' | 'rsi';

/** 日线聚合成周/月（按 5 / 20 个交易日近似，真实实现由后端按自然周月聚合）。 */
function aggregate(candles: Candle[], period: KPeriod): Candle[] {
  if (period === 'day') return candles;
  const size = period === 'week' ? 5 : 20;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    if (chunk.length === 0) continue;
    out.push({
      date: chunk[chunk.length - 1].date,
      open: chunk[0].open,
      close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return out;
}

/** KDJ(9,3,3) */
function kdj(candles: Candle[]) {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  let prevK = 50;
  let prevD = 50;
  candles.forEach((candle, i) => {
    const from = Math.max(0, i - 8);
    const window = candles.slice(from, i + 1);
    const hh = Math.max(...window.map((c) => c.high));
    const ll = Math.min(...window.map((c) => c.low));
    const rsv = hh === ll ? 50 : ((candle.close - ll) / (hh - ll)) * 100;
    prevK = (2 / 3) * prevK + (1 / 3) * rsv;
    prevD = (2 / 3) * prevD + (1 / 3) * prevK;
    k.push(prevK);
    d.push(prevD);
    j.push(3 * prevK - 2 * prevD);
  });
  return { k, d, j };
}

/** RSI(14)，Wilder 平滑 */
function rsi(closes: number[], span = 14): number[] {
  const out: number[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) { out.push(50); continue; }
    const diff = closes[i] - closes[i - 1];
    const up = Math.max(0, diff);
    const down = Math.max(0, -diff);
    if (i <= span) {
      gain += up;
      loss += down;
      out.push(50);
    } else {
      gain = (gain * (span - 1) + up) / span;
      loss = (loss * (span - 1) + down) / span;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

const W = 900;
const MAIN_TOP = 8;
const MAIN_H = 232;
const VOL_TOP = MAIN_TOP + MAIN_H + 18;
const VOL_H = 56;
const MACD_TOP = VOL_TOP + VOL_H + 22;
const MACD_H = 76;
const H = MACD_TOP + MACD_H + 22;
const LEFT = 8;
const RIGHT = 62;

function ema(values: number[], span: number): number[] {
  const k = 2 / (span + 1);
  const out: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(values: number[], span: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= span) sum -= values[i - span];
    out.push(i >= span - 1 ? sum / span : null);
  }
  return out;
}

/** 通达信风格：主图 K 线 + 均线，副图成交量与 MACD，鼠标悬停出十字光标与浮窗。 */
export function StockChart({
  candles: raw,
  period = 'day',
  indicator = 'macd',
}: {
  candles: Candle[];
  period?: KPeriod;
  indicator?: KIndicator;
}) {
  const candles = useMemo(() => aggregate(raw, period), [raw, period]);
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const ma5 = sma(closes, 5);
    const ma10 = sma(closes, 10);
    const ma20 = sma(closes, 20);
    const ma60 = sma(closes, 60);
    const dif = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i]);
    const dea = ema(dif, 9);
    const macd = dif.map((v, i) => (v - dea[i]) * 2);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const priceMin = Math.min(...lows);
    const priceMax = Math.max(...highs);
    const pad = (priceMax - priceMin) * 0.06 || 1;
    const lo = priceMin - pad;
    const hi = priceMax + pad;
    const macdMax = Math.max(...macd.map(Math.abs), 0.001);
    const kdjData = kdj(candles);
    const rsiData = rsi(closes);
    return { closes, ma5, ma10, ma20, ma60, dif, dea, macd, lo, hi, macdMax, kdjData, rsiData };
  }, [candles]);

  if (candles.length === 0) return null;

  const n = candles.length;
  const slot = (W - LEFT - RIGHT) / n;
  const bodyW = Math.max(1.5, slot * 0.58);
  const x = (i: number) => LEFT + i * slot + slot / 2;
  const yPrice = (v: number) => MAIN_TOP + (1 - (v - model.lo) / (model.hi - model.lo)) * MAIN_H;
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const yVol = (v: number) => VOL_TOP + VOL_H - (v / maxVol) * VOL_H;
  const yMacd = (v: number) => MACD_TOP + MACD_H / 2 - (v / model.macdMax) * (MACD_H / 2 - 4);
  const yPct = (v: number) => MACD_TOP + MACD_H - (Math.max(0, Math.min(100, v)) / 100) * MACD_H;

  const line = (values: (number | null)[], toY: (v: number) => number) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${toY(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const px = ratio * W;
    const idx = Math.round((px - LEFT - slot / 2) / slot);
    setHover(idx >= 0 && idx < n ? idx : null);
  };

  const active = hover === null ? null : candles[hover];
  const prevClose = hover !== null && hover > 0 ? candles[hover - 1].close : null;
  const chg = active && prevClose ? ((active.close - prevClose) / prevClose) * 100 : null;

  return (
    <div className="kline" ref={boxRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="kline-svg"
        role="img"
        aria-label="日 K 线、成交量与 MACD"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* 主图网格 */}
        {[0, 0.25, 0.5, 0.75, 1].map((k) => {
          const value = model.hi - k * (model.hi - model.lo);
          return (
            <g key={`g${k}`}>
              <line x1={LEFT} y1={yPrice(value)} x2={W - RIGHT} y2={yPrice(value)} stroke="rgba(255,255,255,.05)" />
              <text x={W - RIGHT + 8} y={yPrice(value) + 4} fill="var(--muted-2)">{value.toFixed(2)}</text>
            </g>
          );
        })}

        {candles.map((candle, i) => {
          const rising = candle.close >= candle.open;
          const color = rising ? 'var(--up)' : 'var(--down)';
          const top = yPrice(Math.max(candle.open, candle.close));
          const bottom = yPrice(Math.min(candle.open, candle.close));
          return (
            <g key={candle.date}>
              <line x1={x(i)} y1={yPrice(candle.high)} x2={x(i)} y2={yPrice(candle.low)} stroke={color} strokeWidth={1} />
              <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bottom - top)} fill={color} rx={0.5} />
            </g>
          );
        })}

        {/* 均线：用线型区分，不额外增加色相 */}
        <path d={line(model.ma5, yPrice)} fill="none" stroke="var(--text)" strokeWidth={1.2} opacity={0.9} />
        <path d={line(model.ma10, yPrice)} fill="none" stroke="var(--muted)" strokeWidth={1.1} />
        <path d={line(model.ma20, yPrice)} fill="none" stroke="var(--muted-2)" strokeWidth={1} strokeDasharray="4 3" />
        <path d={line(model.ma60, yPrice)} fill="none" stroke="var(--muted-2)" strokeWidth={1} strokeDasharray="1 3" opacity={0.8} />

        {/* 成交量 */}
        <line x1={LEFT} y1={VOL_TOP + VOL_H} x2={W - RIGHT} y2={VOL_TOP + VOL_H} stroke="rgba(255,255,255,.08)" />
        {candles.map((candle, i) => (
          <rect
            key={`v${candle.date}`}
            x={x(i) - bodyW / 2}
            y={yVol(candle.volume)}
            width={bodyW}
            height={VOL_TOP + VOL_H - yVol(candle.volume)}
            fill={candle.close >= candle.open ? 'var(--up)' : 'var(--down)'}
            opacity={0.45}
          />
        ))}

        {/* 副图指标 */}
        <line x1={LEFT} y1={MACD_TOP + MACD_H / 2} x2={W - RIGHT} y2={MACD_TOP + MACD_H / 2} stroke="rgba(255,255,255,.08)" />
        {indicator === 'macd' ? (
          <>
            {model.macd.map((v, i) => (
              <rect
                key={`m${candles[i].date}`}
                x={x(i) - bodyW / 2}
                y={Math.min(yMacd(v), MACD_TOP + MACD_H / 2)}
                width={bodyW}
                height={Math.abs(yMacd(v) - (MACD_TOP + MACD_H / 2)) || 0.5}
                fill={v >= 0 ? 'var(--up)' : 'var(--down)'}
                opacity={0.55}
              />
            ))}
            <path d={line(model.dif, yMacd)} fill="none" stroke="var(--text)" strokeWidth={1.1} />
            <path d={line(model.dea, yMacd)} fill="none" stroke="var(--muted)" strokeWidth={1.1} strokeDasharray="3 3" />
          </>
        ) : indicator === 'kdj' ? (
          <>
            <path d={line(model.kdjData.k, yPct)} fill="none" stroke="var(--text)" strokeWidth={1.1} />
            <path d={line(model.kdjData.d, yPct)} fill="none" stroke="var(--muted)" strokeWidth={1.1} strokeDasharray="3 3" />
            <path d={line(model.kdjData.j, yPct)} fill="none" stroke="var(--muted-2)" strokeWidth={1} opacity={0.8} />
            <text x={LEFT + 2} y={MACD_TOP + 11} fill="var(--muted-2)">K/D/J 80 以上超买</text>
          </>
        ) : (
          <>
            <path d={line(model.rsiData, yPct)} fill="none" stroke="var(--text)" strokeWidth={1.2} />
            <line x1={LEFT} y1={yPct(70)} x2={W - RIGHT} y2={yPct(70)} stroke="rgba(255,255,255,.10)" strokeDasharray="3 4" />
            <line x1={LEFT} y1={yPct(30)} x2={W - RIGHT} y2={yPct(30)} stroke="rgba(255,255,255,.10)" strokeDasharray="3 4" />
            <text x={LEFT + 2} y={yPct(70) - 4} fill="var(--muted-2)">70</text>
            <text x={LEFT + 2} y={yPct(30) + 12} fill="var(--muted-2)">30</text>
          </>
        )}

        {/* 日期刻度 */}
        {candles.map((candle, i) =>
          i % 20 === 0 ? (
            <text key={`d${candle.date}`} x={x(i)} y={H - 4} textAnchor="middle" fill="var(--muted-2)">
              {candle.date}
            </text>
          ) : null,
        )}

        {/* 十字光标 */}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} y1={MAIN_TOP} x2={x(hover)} y2={H - 18} stroke="rgba(255,255,255,.35)" strokeWidth={1} strokeDasharray="3 3" />
            <line
              x1={LEFT}
              y1={yPrice(candles[hover].close)}
              x2={W - RIGHT}
              y2={yPrice(candles[hover].close)}
              stroke="rgba(255,255,255,.22)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </g>
        ) : null}
      </svg>

      {active ? (
        <div className="kline-tip">
          <div className="kt-date">
            {active.date}
            {chg !== null ? <span className={chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat'}>{pct(chg)}</span> : null}
          </div>
          <div className="kt-grid">
            <span>开</span><b>{fmt(active.open)}</b>
            <span>高</span><b>{fmt(active.high)}</b>
            <span>低</span><b>{fmt(active.low)}</b>
            <span>收</span><b className={active.close >= active.open ? 'up' : 'down'}>{fmt(active.close)}</b>
            <span>量</span><b>{(active.volume / 1e4).toFixed(1)} 万手</b>
            <span>MA5</span><b>{model.ma5[hover!] === null ? '—' : fmt(model.ma5[hover!]!)}</b>
            <span>MA20</span><b>{model.ma20[hover!] === null ? '—' : fmt(model.ma20[hover!]!)}</b>
            {indicator === 'macd' ? (
              <>
                <span>DIF</span><b>{model.dif[hover!].toFixed(3)}</b>
                <span>DEA</span><b>{model.dea[hover!].toFixed(3)}</b>
              </>
            ) : indicator === 'kdj' ? (
              <>
                <span>K</span><b>{model.kdjData.k[hover!].toFixed(1)}</b>
                <span>D</span><b>{model.kdjData.d[hover!].toFixed(1)}</b>
                <span>J</span><b>{model.kdjData.j[hover!].toFixed(1)}</b>
                <span />
              </>
            ) : (
              <>
                <span>RSI14</span><b>{model.rsiData[hover!].toFixed(1)}</b>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="kline-legend">
        <span><i className="lg-ma5" />MA5</span>
        <span><i className="lg-ma10" />MA10</span>
        <span><i className="lg-ma20" />MA20</span>
        <span><i className="lg-ma60" />MA60</span>
        <span className="kline-hint">悬停查看当日数据</span>
      </div>
    </div>
  );
}
