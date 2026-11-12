/**
 * K 线图由 lightweight-charts 渲染（L1 直接依赖，Apache-2.0，v5.2.1）。
 * 之前这里是手绘 SVG，按 TECHNICAL-DESIGN §9.5「不自研 K 线绘图」改为成熟组件：
 * 缩放、平移、十字光标、坐标轴与副图都由库负责，本文件只做数据映射与指标计算。
 * 来源与许可证登记见 research/REUSE-REGISTER.md。
 */
import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import type { Candle } from '../api/types';
import { fmt, pct } from '../lib/format';
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
  const priceRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const dataRef = useRef<{
    candles: Candle[];
    ma5: (number | null)[];
    ma20: (number | null)[];
    dif: number[];
    dea: number[];
    k: number[];
    d: number[];
    rsi: (number | null)[];
  } | null>(null);
  const [tip, setTip] = useState<{
    left: number;
    top: number;
    index: number;
    time: string;
  } | null>(null);

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

    chart.subscribeCrosshairMove((param) => {
      // 指针离开画布、落在副图（成交量/指标 pane）、或不在任何一根 K 线上 → 隐藏
      if (!param.point || param.time === undefined || (param.paneIndex ?? 0) !== 0) {
        setTip(null);
        return;
      }
      const price = priceRef.current;
      const data = dataRef.current;
      const box = boxRef.current;
      if (!price || !data || !box) {
        setTip(null);
        return;
      }
      const bar = param.seriesData.get(price) as CandlestickData<Time> | undefined;
      const time = String(param.time);
      const index = data.candles.findIndex((item) => item.date === time);
      if (!bar || index < 0) {
        setTip(null);
        return;
      }
      // 浮窗尺寸固定（min-width 178），靠近右/下边界时翻到另一侧，避免超出容器
      const TIP_W = 196;
      const TIP_H = 132;
      const gap = 14;
      const maxLeft = Math.max(0, box.clientWidth - TIP_W - gap);
      const maxTop = Math.max(0, box.clientHeight - TIP_H - gap);
      const left = Math.min(maxLeft, Math.max(gap, param.point.x + gap));
      const top = Math.min(maxTop, Math.max(gap, param.point.y + gap));
      setTip({ left, top, index, time });
    });
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
    priceRef.current = price;
    price.setData(
      candles.map((item) => ({ time: item.date as Time, open: item.open, high: item.high, low: item.low, close: item.close })),
    );

    const closes = candles.map((item) => item.close);
    // 悬停浮窗要按 index 取均线与指标，先存好，避免每次 hover 重算
    const ma5 = sma(closes, 5);
    const ma20 = sma(closes, 20);
    const ind = macd(closes);
    const kdjValues = kdj(candles);
    const rsiValues = rsi(closes);
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

    dataRef.current = {
      candles,
      ma5,
      ma20,
      dif: ind.dif,
      dea: ind.dea,
      k: kdjValues.k,
      d: kdjValues.d,
      rsi: rsiValues,
    };

    chart.timeScale().fitContent();
  }, [raw, period, indicator]);

  if (!raw.length) {
    return <div className="state-block"><h4>没有 K 线数据</h4><p>该标的当日没有行情数据。</p></div>;
  }

  const hover = (() => {
    if (!tip) return null;
    const data = dataRef.current;
    if (!data) return null;
    const bar = data.candles[tip.index];
    if (!bar) return null;
    const prev = tip.index > 0 ? data.candles[tip.index - 1] : null;
    // 前一根本身不存在时不给涨跌幅，不硬凑 0
    const chg = prev && prev.close ? ((bar.close - prev.close) / prev.close) * 100 : null;
    return { bar, chg, data };
  })();

  return (
    <div className="kline-box">
      <div ref={boxRef} className="kline-canvas" />
      {hover ? (
        <div className="kline-tip" style={{ left: tip!.left, top: tip!.top }} role="tooltip">
          <div className="kt-date">
            {tip!.time}
            {hover.chg === null ? (
              <span className="flat">—</span>
            ) : (
              <span className={hover.chg > 0 ? 'up' : hover.chg < 0 ? 'down' : 'flat'}>{pct(hover.chg)}</span>
            )}
          </div>
          <div className="kt-grid">
            <span>开</span><b>{fmt(hover.bar.open)}</b>
            <span>高</span><b>{fmt(hover.bar.high)}</b>
            <span>低</span><b>{fmt(hover.bar.low)}</b>
            <span>收</span><b className={hover.bar.close >= hover.bar.open ? 'up' : 'down'}>{fmt(hover.bar.close)}</b>
            <span>量</span><b>{hover.bar.volume ? `${(hover.bar.volume / 1e4).toFixed(1)} 万手` : '—'}</b>
            <span>MA5</span><b>{hover.data.ma5[tip!.index] == null ? '—' : fmt(hover.data.ma5[tip!.index]!)}</b>
            <span>MA20</span><b>{hover.data.ma20[tip!.index] == null ? '—' : fmt(hover.data.ma20[tip!.index]!)}</b>
            {indicator === 'macd' ? (
              <>
                <span>DIF</span><b>{fmt(hover.data.dif[tip!.index] ?? NaN, 3)}</b>
                <span>DEA</span><b>{fmt(hover.data.dea[tip!.index] ?? NaN, 3)}</b>
              </>
            ) : indicator === 'kdj' ? (
              <>
                <span>K</span><b>{hover.data.k[tip!.index]?.toFixed(1) ?? '—'}</b>
                <span>D</span><b>{hover.data.d[tip!.index]?.toFixed(1) ?? '—'}</b>
              </>
            ) : (
              <>
                <span>RSI14</span>
                <b>{hover.data.rsi[tip!.index] == null ? '—' : hover.data.rsi[tip!.index]!.toFixed(1)}</b>
                <span />
                <b />
              </>
            )}
          </div>
        </div>
      ) : null}
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
