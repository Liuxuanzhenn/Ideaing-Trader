import { useMemo, useRef, useState } from 'react';
import type { Candle } from '../api/types';
import { fmt, pct } from '../lib/format';

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
export function StockChart({ candles }: { candles: Candle[] }) {
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
    return { closes, ma5, ma10, ma20, ma60, dif, dea, macd, lo, hi, macdMax };
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

        {/* MACD */}
        <line x1={LEFT} y1={MACD_TOP + MACD_H / 2} x2={W - RIGHT} y2={MACD_TOP + MACD_H / 2} stroke="rgba(255,255,255,.08)" />
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
            <span>DIF</span><b>{model.dif[hover!].toFixed(3)}</b>
            <span>DEA</span><b>{model.dea[hover!].toFixed(3)}</b>
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
