import type { Candle } from '../api/types';

const AXIS = 'rgba(255,255,255,.055)';
const LABEL = 'var(--muted-2)';

/** 手绘蜡烛图：不引任何图表库。viewBox 宽度贴近容器，避免放大后字号发糊。 */
export function Candles({ candles }: { candles: Candle[] }) {
  if (candles.length === 0) return null;
  const W = 1120;
  const H = 300;
  const left = 8;
  const right = 64;
  const top = 12;
  const volH = 38;
  const priceBottom = H - 28 - volH;
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const pad = (max - min) * 0.08 || 1;
  const y = (value: number) => top + (1 - (value - (min - pad)) / (max - min + pad * 2)) * (priceBottom - top);
  const slot = (W - left - right) / candles.length;
  const bodyW = Math.max(2, slot * 0.56);
  const maxVol = Math.max(...candles.map((c) => c.volume), 1);
  const volY = (value: number) => H - 28 - (value / maxVol) * volH;
  const last = candles[candles.length - 1];
  const lastColor = last.close >= last.open ? 'var(--up)' : 'var(--down)';

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日 K 线与成交量">
      {[0, 0.5, 1].map((k) => {
        const value = max + pad - k * (max - min + pad * 2);
        return (
          <g key={k}>
            <line x1={left} y1={y(value)} x2={W - right + 6} y2={y(value)} stroke={AXIS} />
            <text x={W - right + 12} y={y(value) + 4} fill={LABEL}>{value.toFixed(1)}</text>
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
            <line x1={x} y1={y(candle.high)} x2={x} y2={y(candle.low)} stroke={color} strokeWidth={1} opacity={0.9} />
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={Math.max(1, bodyBottom - bodyTop)}
              fill={color}
              opacity={rising ? 0.9 : 0.9}
              rx={1}
            />
            <rect x={x - bodyW / 2} y={volY(candle.volume)} width={bodyW} height={H - 28 - volY(candle.volume)} fill={color} opacity={0.2} rx={1} />
            {index % 8 === 0 ? <text x={x} y={H - 8} textAnchor="middle" fill={LABEL}>{candle.date}</text> : null}
          </g>
        );
      })}
      {/* 最新价参考线：让"现在在哪"一眼可读 */}
      <line x1={left} y1={y(last.close)} x2={W - right + 6} y2={y(last.close)} stroke={lastColor} strokeWidth={1} strokeDasharray="2 4" opacity={0.55} />
      <text x={W - right + 12} y={y(last.close) + 4} fill={lastColor}>{last.close.toFixed(2)}</text>
      <line x1={left} y1={H - 28 - volH} x2={W - right} y2={H - 28 - volH} stroke={AXIS} />
    </svg>
  );
}

export interface LineSeries {
  values: number[];
  color: string;
  dashed?: boolean;
  label: string;
}

/** 折线 / 基准对比：末端加点与末值，减少读图成本。 */
export function LineChart({ series, labels }: { series: LineSeries[]; labels: string[] }) {
  const W = 1120;
  const H = 300;
  const left = 44;
  const right = 58;
  const top = 16;
  const bottom = 28;
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
            <line x1={left} y1={y(value)} x2={W - right} y2={y(value)} stroke={AXIS} strokeDasharray={k === 1 ? '2 5' : undefined} />
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
      {series.map((item) => {
        const value = item.values[count - 1];
        return (
          <g key={`${item.label}-dot`}>
            <circle cx={x(count - 1)} cy={y(value)} r={2.5} fill={item.color} />
            <text x={x(count - 1) + 8} y={y(value) + 4} fill={LABEL}>{value.toFixed(1)}</text>
          </g>
        );
      })}
      {labels.map((label, index) =>
        label ? (
          <text key={`${label}-${index}`} x={x(index)} y={H - 6} textAnchor="middle" fill={LABEL}>{label}</text>
        ) : null,
      )}
    </svg>
  );
}

/** 回撤面积图（负值）：回撤是亏损，只用跌色。 */
export function AreaChart({ values }: { values: number[] }) {
  const W = 1120;
  const H = 300;
  const left = 44;
  const right = 58;
  const top = 16;
  const bottom = 26;
  if (values.length === 0) return <div className="chart-empty">没有可绘制的回撤数据</div>;
  const min = Math.min(...values, -1);
  const x = (index: number) => left + (index / Math.max(1, values.length - 1)) * (W - left - right);
  const y = (value: number) => top + (value / min) * (H - top - bottom);
  const line = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${top} L${left},${top} Z`;
  const worst = Math.min(...values);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="回撤曲线">
      <path d={area} fill="var(--down)" opacity={0.14} />
      <path d={line} fill="none" stroke="var(--down)" strokeWidth={1.2} />
      <line x1={left} y1={top} x2={W - right} y2={top} stroke={AXIS} />
      <line x1={left} y1={y(worst)} x2={W - right} y2={y(worst)} stroke={AXIS} strokeDasharray="2 5" />
      <text x={4} y={top + 6} fill={LABEL}>0%</text>
      <text x={4} y={y(worst) + 4} fill={LABEL}>{worst.toFixed(1)}%</text>
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill="var(--down)" />
    </svg>
  );
}

/** 迷你趋势：方块卡里的小图，只看形状。 */
export function Spark({
  values,
  kind = 'line',
  tone = 'var(--muted)',
}: {
  values: (number | null)[];
  kind?: 'line' | 'bar';
  tone?: string;
}) {
  const points = values.filter((v): v is number => v !== null);
  if (points.length < 2) return <div className="spark" />;
  const W = 120;
  const H = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const n = values.length;

  if (kind === 'bar') {
    const slot = W / n;
    const bw = Math.max(1.5, slot * 0.62);
    return (
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {values.map((value, index) =>
          value === null ? null : (
            <rect
              key={index}
              x={index * slot + (slot - bw) / 2}
              y={H - ((value - min) / span) * (H - 4) - 2}
              width={bw}
              height={Math.max(1, ((value - min) / span) * (H - 4))}
              rx={1}
              fill={tone}
              opacity={index === n - 1 ? 0.95 : 0.45}
            />
          ),
        )}
      </svg>
    );
  }

  const x = (index: number) => (index / (n - 1)) * W;
  const y = (value: number) => H - 2 - ((value - min) / span) * (H - 6);
  const path = values
    .map((value, index) => (value === null ? null : `${index && values[index - 1] !== null ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={tone} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {values[n - 1] !== null ? (
        <circle cx={x(n - 1)} cy={y(values[n - 1] as number)} r={1.8} fill={tone} />
      ) : null}
    </svg>
  );
}
