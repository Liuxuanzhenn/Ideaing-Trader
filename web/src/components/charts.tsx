import type { Candle } from '../api/types';

const AXIS = 'rgba(255,255,255,.06)';
const LABEL = 'var(--muted-2)';

/** 手绘蜡烛图：不引任何图表库。 */
export function Candles({ candles }: { candles: Candle[] }) {
  if (candles.length === 0) return null;
  const W = 560;
  const H = 300;
  const left = 6;
  const right = 46;
  const top = 10;
  const volH = 34;
  const priceBottom = H - 26 - volH;
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const pad = (max - min) * 0.08 || 1;
  const y = (value: number) => top + (1 - (value - (min - pad)) / (max - min + pad * 2)) * (priceBottom - top);
  const slot = (W - left - right) / candles.length;
  const bodyW = Math.max(2, slot * 0.58);
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const volY = (value: number) => H - 26 - (value / maxVol) * volH;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日 K 线与成交量">
      {[0, 0.5, 1].map((k) => {
        const value = max + pad - k * (max - min + pad * 2);
        return (
          <g key={k}>
            <line x1={left} y1={y(value)} x2={W - right + 4} y2={y(value)} stroke={AXIS} />
            <text x={W - right + 8} y={y(value) + 4} fill={LABEL}>{value.toFixed(1)}</text>
          </g>
        );
      })}
      {candles.map((candle, index) => {
        const x = left + index * slot + slot / 2;
        const rising = candle.close >= candle.open;
        const color = rising ? 'var(--up)' : 'var(--down)';
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyBottom = y(Math.min(candle.open, candle.close));
        return (
          <g key={candle.date + index}>
            <line x1={x} y1={y(candle.high)} x2={x} y2={y(candle.low)} stroke={color} strokeWidth={1} />
            <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(1, bodyBottom - bodyTop)} fill={color} opacity={0.85} rx={1} />
            <rect x={x - bodyW / 2} y={volY(candle.volume)} width={bodyW} height={H - 26 - volY(candle.volume)} fill={color} opacity={0.28} rx={1} />
            {index % 8 === 0 ? <text x={x} y={H - 8} textAnchor="middle" fill={LABEL}>{candle.date}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export interface LineSeries {
  values: number[];
  color: string;
  dashed?: boolean;
  label: string;
}

/** 折线 / 基准对比。 */
export function LineChart({ series, labels }: { series: LineSeries[]; labels: string[] }) {
  const W = 560;
  const H = 300;
  const left = 34;
  const right = 12;
  const top = 14;
  const bottom = 26;
  // 长度不一致时统一按最短截断：宁可少画尾部，也不要让两条线错位（错位会被读成"策略跑赢基准"）
  const count = Math.min(...series.map((item) => item.values.length));
  if (series.length === 0 || !Number.isFinite(count) || count === 0) {
    return <div className="chart-empty">没有可绘制的序列</div>;
  }
  const all = series.flatMap((item) => item.values.slice(0, count));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1;
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (W - left - right);
  const y = (value: number) => top + (1 - (value - (min - pad)) / (max - min + pad * 2)) * (H - top - bottom);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="净值曲线">
      {[0, 0.5, 1].map((k) => {
        const value = max + pad - k * (max - min + pad * 2);
        return (
          <g key={k}>
            <line x1={left} y1={y(value)} x2={W - right} y2={y(value)} stroke={AXIS} />
            <text x={4} y={y(value) + 4} fill={LABEL}>{value.toFixed(0)}</text>
          </g>
        );
      })}
      {series.map((item) => (
        <path
          key={item.label}
          d={item.values.slice(0, count).map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={item.color}
          strokeWidth={item.dashed ? 1.2 : 1.8}
          strokeDasharray={item.dashed ? '3 4' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {labels.map((label, index) =>
        label ? (
          <text key={`${label}-${index}`} x={x(index)} y={H - 6} textAnchor="middle" fill={LABEL}>{label}</text>
        ) : null,
      )}
    </svg>
  );
}

/** 回撤面积图（负值）。 */
export function AreaChart({ values }: { values: number[] }) {
  const W = 560;
  const H = 300;
  const left = 34;
  const right = 12;
  const top = 14;
  const bottom = 24;
  if (values.length === 0) return <div className="chart-empty">没有可绘制的回撤数据</div>;
  const min = Math.min(...values, -1);
  const x = (index: number) => left + (index / Math.max(1, values.length - 1)) * (W - left - right);
  const y = (value: number) => top + (value / min) * (H - top - bottom);
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${top} L${left},${top} Z`;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="回撤曲线">
      {/* 回撤是亏损，用跌色；红色在本产品里只表示上涨 */}
      <path d={area} fill="var(--down)" opacity={0.14} />
      <path d={line} fill="none" stroke="var(--down)" strokeWidth={1.2} />
      <line x1={left} y1={top} x2={W - right} y2={top} stroke={AXIS} />
      <text x={4} y={top + 6} fill={LABEL}>0%</text>
      <text x={4} y={H - bottom} fill={LABEL}>{min.toFixed(0)}%</text>
    </svg>
  );
}
