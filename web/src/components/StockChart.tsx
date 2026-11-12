/**
 * K 线图由 lightweight-charts 渲染（L1 直接依赖，Apache-2.0，v5.2.1）。
 * 之前这里是手绘 SVG，按 TECHNICAL-DESIGN §9.5「不自研 K 线绘图」改为成熟组件：
 * 缩放、平移、十字光标、坐标轴与副图都由库负责，本文件只做数据映射与指标计算。
 * 来源与许可证登记见 research/REUSE-REGISTER.md。
 */
import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import type { Candle } from '../api/types';
import {
  aggregate,
  isoDate,
  kdj,
  macd,
  rsi,
  sma,
  type KIndicator,
  type KPeriod,
} from '../lib/indicators';

export type { KIndicator, KPeriod };

const UP = '#e04b4b';
const DOWN = '#2fa36b';
const MUTED = '#8a8a92';

const IND_LABEL: Record<KIndicator, string> = {
  macd: 'MACD(12,26,9)',
  kdj: 'KDJ(9,3,3)',
  rsi: 'RSI(14)',
};

export function StockChart({
  candles: raw,
  period,
  indicator,
}: {
  candles: Candle[];
  period: KPeriod;
  indicator: KIndicator;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);

  useEffect(() => {
    if (!boxRef.current) return undefined;
    const chart = createChart(boxRef.current, {
      height: 520,
      // 保留 px：图表库按 CSS px 在 canvas 内排布，跟随根字号放大会溢出画布
      layout: { background: { color: 'transparent' }, textColor: MUTED, fontSize: 11, panes: { separatorColor: '#2a2a30' } },
      grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } },
      rightPriceScale: { borderColor: '#2a2a30' },
      timeScale: { borderColor: '#2a2a30', rightOffset: 4 },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.applyOptions({ width: boxRef.current?.clientWidth ?? 0 }));
    observer.observe(boxRef.current);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const series of seriesRef.current) chart.removeSeries(series);
    seriesRef.current = [];

    const candles = aggregate(raw, period).flatMap((item) => {
      const date = isoDate(item.date);
      return date ? [{ ...item, date }] : [];
    });
    if (!candles.length) return;

    const price = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    }, 0);
    seriesRef.current.push(price);
    price.setData(
      candles.map((item) => ({ time: item.date as Time, open: item.open, high: item.high, low: item.low, close: item.close })),
    );

    const closes = candles.map((item) => item.close);
    for (const [span, color] of [[5, '#e0c04b'], [10, '#4b9ce0'], [20, '#b06be0'], [60, '#6b6b73']] as const) {
      const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 0);
      seriesRef.current.push(line);
      line.setData(
        sma(closes, span)
          .map((value, i) => (value === null ? null : { time: candles[i].date as Time, value }))
          .filter((point): point is { time: Time; value: number } => point !== null),
      );
    }

    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false }, 1);
    seriesRef.current.push(volume);
    volume.setData(
      candles.map((item) => ({
        time: item.date as Time,
        value: item.volume,
        color: item.close >= item.open ? 'rgba(224,75,75,.55)' : 'rgba(47,163,107,.55)',
      })),
    );

    const draw = (values: (number | null)[], color: string) => {
      const line = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 2);
      seriesRef.current.push(line);
      line.setData(
        values.flatMap((value, i) => (value === null ? [] : [{ time: candles[i].date as Time, value }])),
      );
    };
    if (indicator === 'macd') {
      const { dif, dea } = macd(closes);
      draw(dif, '#e0c04b');
      draw(dea, '#4b9ce0');
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2);
      seriesRef.current.push(hist);
      hist.setData(
        macd(closes).hist.map((value, i) => ({
          time: candles[i].date as Time,
          value,
          color: value >= 0 ? 'rgba(224,75,75,.6)' : 'rgba(47,163,107,.6)',
        })),
      );
    } else if (indicator === 'kdj') {
      const values = kdj(candles);
      draw(values.k, '#e0c04b');
      draw(values.d, '#4b9ce0');
      draw(values.j, '#b06be0');
    } else {
      draw(rsi(closes), '#e0c04b');
    }

    chart.timeScale().fitContent();
  }, [raw, period, indicator]);

  if (!raw.length) {
    return <div className="state-block"><h4>没有 K 线数据</h4><p>该标的当日没有行情数据。</p></div>;
  }

  return (
    <div className="kline-box">
      <div ref={boxRef} className="kline-canvas" />
      <div className="kline-legend">
        <span>MA5</span><span>MA10</span><span>MA20</span><span>MA60</span>
        <span>{IND_LABEL[indicator]}</span>
        <span className="kline-note">
          {period === 'day' ? '指标为展示层计算，非后端权威值' : `周/月按连续 ${period === 'week' ? 5 : 20} 个交易日近似，非自然周月`}
        </span>
      </div>
    </div>
  );
}
