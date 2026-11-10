import { useMemo, useRef, useState } from 'react';
import type { Candle } from '../api/types';
import { fmt, pct } from '../lib/format';

export type KPeriod = 'day' | 'week' | 'month';
export type KIndicator = 'macd' | 'kdj' | 'rsi';

const W = 900;
const AXIS_W = 56;
const LEFT = 6;
const RIGHT = LEFT + (W - AXIS_W - LEFT * 2) ;

const MAIN_TOP = 10;
const MAIN_H = 248;
const VOL_TOP = MAIN_TOP + MAIN_H + 16;
const VOL_H = 58;
const IND_TOP = VOL_TOP + VOL_H + 18;
const IND_H = 86;
const DATE_Y = IND_TOP + IND_H + 16;
const H = DATE_Y + 14;

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

const IND_LABEL: Record<KIndicator, string> = {
  macd: 'MACD(12,26,9)',
  kdj: 'KDJ(9,3,3)',
  rsi: 'RSI(14)',
};

/** 通达信风格：主图 K 线 + 均线，副图成交量与指标，悬停十字光标与浮窗。 */
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
    if (candles.length === 0) return null;
    const closes = candles.map((c) => c.close);
    const dif = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i]);
    const dea = ema(dif, 9);
    return {
      closes,
      ma5: sma(closes, 5),
      ma10: sma(closes, 10),
      ma20: sma(closes, 20),
      ma60: sma(closes, 60),
      dif,
      dea,
      macd: dif.map((v, i) => (v - dea[i]) * 2),
      kdjData: kdj(candles),
      rsiData: rsi(closes),
      lo: Math.min(...candles.map((c) => c.low)),
      hi: Math.max(...candles.map((c) => c.high)),
    };
  }, [candles]);

  if (candles.length === 0 || !model) return null;

  const pad = (model.hi - model.lo) * 0.07 || 1;
  const lo = model.lo - pad;
  const hi = model.hi + pad;

  const n = candles.length;
  const slot = (RIGHT - LEFT) / n;
  const bodyW = Math.max(1.4, Math.min(9, slot * 0.62));
  const cx = (i: number) => LEFT + i * slot + slot / 2;
  const yPrice = (v: number) => MAIN_TOP + (1 - (v - lo) / (hi - lo)) * MAIN_H;

  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const yVol = (v: number) => VOL_TOP + VOL_H - (v / maxVol) * VOL_H;

  const macdMax = Math.max(...model.macd.map(Math.abs), 0.001);
  const yMacd = (v: number) => IND_TOP + IND_H / 2 - (v / macdMax) * (IND_H / 2 - 6);
  const yPct = (v: number) => IND_TOP + IND_H - (Math.max(0, Math.min(100, v)) / 100) * IND_H;

  const path = (values: (number | null)[], toY: (v: number) => number) =>
    values
      .map((v, i) => (v === null ? null : `${i && values[i - 1] !== null ? 'L' : 'M'}${cx(i).toFixed(1)},${toY(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const idx = Math.round(((ratio * W) - LEFT - slot / 2) / slot);
    setHover(idx >= 0 && idx < n ? idx : null);
  };

  const activeIndex = hover;
  const active = activeIndex === null ? null : candles[activeIndex];
  const prevClose = activeIndex !== null && activeIndex > 0 ? candles[activeIndex - 1].close : null;
  const chg = active && prevClose ? ((active.close - prevClose) / prevClose) * 100 : null;
  const tagColor = (up: boolean) => (up ? 'var(--up)' : 'var(--down)');

  return (
    <div className="kline" ref={boxRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="kline-svg"
        role="img"
        aria-label={`日 K 线、成交量与 ${IND_LABEL[indicator]}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* 主图水平网格 + 右侧价格刻度 */}
        {[0, 0.25, 0.5, 0.75, 1].map((k) => {
          const value = hi - k * (hi - lo);
          return (
            <g key={`h${k}`}>
              <line x1={LEFT} y1={yPrice(value)} x2={RIGHT} y2={yPrice(value)} stroke="rgba(255,255,255,.045)" />
              <text x={RIGHT + 8} y={yPrice(value) + 4} fill="var(--muted-2)">{value.toFixed(2)}</text>
            </g>
          );
        })}

        {/* 日期刻度（贯穿三个面板的竖参考） */}
        {candles.map((candle, i) =>
          i % Math.ceil(n / 6) === 0 ? (
            <g key={`d${candle.date}`}>
              <line x1={cx(i)} y1={MAIN_TOP} x2={cx(i)} y2={DATE_Y - 12} stroke="rgba(255,255,255,.03)" />
              <text x={cx(i)} y={DATE_Y} textAnchor="middle" fill="var(--muted-2)">{candle.date}</text>
            </g>
          ) : null,
        )}

        {/* K 线 */}
        {candles.map((candle, i) => {
          const rising = candle.close >= candle.open;
          const color = tagColor(rising);
          const top = yPrice(Math.max(candle.open, candle.close));
          const bottom = yPrice(Math.min(candle.open, candle.close));
          return (
            <g key={candle.date}>
              <line x1={cx(i)} y1={yPrice(candle.high)} x2={cx(i)} y2={yPrice(candle.low)} stroke={color} strokeWidth={1} />
              <rect
                x={cx(i) - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(1, bottom - top)}
                fill={color}
                shapeRendering="crispEdges"
              />
            </g>
          );
        })}

        {/* 均线 */}
        <path d={path(model.ma5, yPrice)} fill="none" stroke="var(--text)" strokeWidth={1.1} opacity={0.92} />
        <path d={path(model.ma10, yPrice)} fill="none" stroke="var(--muted)" strokeWidth={1} />
        <path d={path(model.ma20, yPrice)} fill="none" stroke="var(--muted-2)" strokeWidth={1} strokeDasharray="4 3" />
        <path d={path(model.ma60, yPrice)} fill="none" stroke="var(--muted-2)" strokeWidth={1} strokeDasharray="1 3" opacity={0.85} />

        {/* 最新价参考 */}
        <line
          x1={LEFT}
          y1={yPrice(model.closes[n - 1])}
          x2={RIGHT}
          y2={yPrice(model.closes[n - 1])}
          stroke={tagColor(candles[n - 1].close >= candles[n - 1].open)}
          strokeWidth={1}
          strokeDasharray="2 4"
          opacity={0.5}
        />

        {/* 面板分隔 */}
        <line x1={LEFT} y1={VOL_TOP - 8} x2={W - 4} y2={VOL_TOP - 8} stroke="rgba(255,255,255,.07)" />
        <line x1={LEFT} y1={IND_TOP - 9} x2={W - 4} y2={IND_TOP - 9} stroke="rgba(255,255,255,.07)" />

        {/* 成交量 */}
        <text x={LEFT + 2} y={VOL_TOP + 9} fill="var(--muted-2)">VOL</text>
        <text x={RIGHT + 8} y={VOL_TOP + 9} fill="var(--muted-2)">{maxVol >= 1e8 ? `${(maxVol / 1e8).toFixed(1)}亿` : `${(maxVol / 1e4).toFixed(0)}万`}</text>
        {candles.map((candle, i) => (
          <rect
            key={`v${candle.date}`}
            x={cx(i) - bodyW / 2}
            y={yVol(candle.volume)}
            width={bodyW}
            height={VOL_TOP + VOL_H - yVol(candle.volume)}
            fill={tagColor(candle.close >= candle.open)}
            opacity={0.5}
          />
        ))}

        {/* 指标面板 */}
        <text x={LEFT + 2} y={IND_TOP + 10} fill="var(--muted-2)">{IND_LABEL[indicator]}</text>
        {indicator === 'macd' ? (
          <>
            <line x1={LEFT} y1={IND_TOP + IND_H / 2} x2={RIGHT} y2={IND_TOP + IND_H / 2} stroke="rgba(255,255,255,.08)" />
            {model.macd.map((v, i) => (
              <rect
                key={`m${candles[i].date}`}
                x={cx(i) - bodyW / 2}
                y={Math.min(yMacd(v), IND_TOP + IND_H / 2)}
                width={bodyW}
                height={Math.max(0.5, Math.abs(yMacd(v) - (IND_TOP + IND_H / 2)))}
                fill={v >= 0 ? 'var(--up)' : 'var(--down)'}
                opacity={0.55}
              />
            ))}
            <path d={path(model.dif, yMacd)} fill="none" stroke="var(--text)" strokeWidth={1.1} />
            <path d={path(model.dea, yMacd)} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
          </>
        ) : indicator === 'kdj' ? (
          <>
            {[20, 50, 80].map((line) => (
              <line key={line} x1={LEFT} y1={yPct(line)} x2={RIGHT} y2={yPct(line)} stroke="rgba(255,255,255,.06)" strokeDasharray="3 4" />
            ))}
            <path d={path(model.kdjData.k, yPct)} fill="none" stroke="var(--text)" strokeWidth={1.1} />
            <path d={path(model.kdjData.d, yPct)} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            <path d={path(model.kdjData.j, yPct)} fill="none" stroke="var(--muted-2)" strokeWidth={1} opacity={0.85} />
          </>
        ) : (
          <>
            {[30, 70].map((line) => (
              <line key={line} x1={LEFT} y1={yPct(line)} x2={RIGHT} y2={yPct(line)} stroke="rgba(255,255,255,.07)" strokeDasharray="3 4" />
            ))}
            <path d={path(model.rsiData, yPct)} fill="none" stroke="var(--text)" strokeWidth={1.2} />
          </>
        )}

        {/* 十字光标 */}
        {activeIndex !== null ? (
          <g>
            <line x1={cx(activeIndex)} y1={MAIN_TOP} x2={cx(activeIndex)} y2={DATE_Y - 12} stroke="rgba(255,255,255,.30)" strokeWidth={1} strokeDasharray="3 3" />
            <line
              x1={LEFT}
              y1={yPrice(candles[activeIndex].close)}
              x2={RIGHT}
              y2={yPrice(candles[activeIndex].close)}
              stroke="rgba(255,255,255,.18)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {/* 右侧价格标签 */}
            <rect x={RIGHT + 4} y={yPrice(candles[activeIndex].close) - 8} width={AXIS_W - 8} height={16} rx={3} fill="#2a2a2e" />
            <text x={RIGHT + 8} y={yPrice(candles[activeIndex].close) + 4} fill="var(--text)">
              {candles[activeIndex].close.toFixed(2)}
            </text>
            {/* 底部日期标签 */}
            <rect x={cx(activeIndex) - 26} y={DATE_Y - 11} width={52} height={15} rx={3} fill="#2a2a2e" />
            <text x={cx(activeIndex)} y={DATE_Y} textAnchor="middle" fill="var(--text)">{candles[activeIndex].date}</text>
          </g>
        ) : null}

        {/* 最新价标签 */}
        <rect
          x={RIGHT + 4}
          y={yPrice(model.closes[n - 1]) - 8}
          width={AXIS_W - 8}
          height={16}
          rx={3}
          fill={tagColor(candles[n - 1].close >= candles[n - 1].open)}
        />
        <text
          x={RIGHT + 8}
          y={yPrice(model.closes[n - 1]) + 4}
          fill="#101012"
          style={{ fontWeight: 520 }}
        >
          {model.closes[n - 1].toFixed(2)}
        </text>
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
            <span>MA5</span><b>{model.ma5[activeIndex!] === null ? '—' : fmt(model.ma5[activeIndex!]!)}</b>
            <span>MA20</span><b>{model.ma20[activeIndex!] === null ? '—' : fmt(model.ma20[activeIndex!]!)}</b>
            {indicator === 'macd' ? (
              <>
                <span>DIF</span><b>{model.dif[activeIndex!].toFixed(3)}</b>
                <span>DEA</span><b>{model.dea[activeIndex!].toFixed(3)}</b>
              </>
            ) : indicator === 'kdj' ? (
              <>
                <span>K</span><b>{model.kdjData.k[activeIndex!].toFixed(1)}</b>
                <span>D</span><b>{model.kdjData.d[activeIndex!].toFixed(1)}</b>
              </>
            ) : (
              <>
                <span>RSI14</span><b>{model.rsiData[activeIndex!].toFixed(1)}</b>
                <span />
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
