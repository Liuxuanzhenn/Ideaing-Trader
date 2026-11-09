import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { Portfolio } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { StockChart, type KIndicator, type KPeriod } from '../components/StockChart';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';
import { fmt, pct, toneOf, yuan } from '../lib/format';

export type StockView = 'detail' | 'watchlist';

interface Props {
  client: ApiClient;
  code: string | null;
  portfolio: Portfolio;
  view: StockView;
  onChangeView: (view: StockView) => void;
  onOpenStock: (code: string) => void;
  onAddWatch: (code: string) => void;
  onAddBasket: (code: string) => void;
  onRemoveWatch: (code: string) => void;
}

const STATUS_TEXT = { normal: '正常交易', suspended: '停牌', st: 'ST' } as const;

export function StockPage(props: Props) {
  const { view, onChangeView, portfolio } = props;
  return (
    <>
      <div className="subtabs" role="tablist" aria-label="个股子视图" style={{ marginBottom: 16 }}>
        <button
          role="tab"
          aria-selected={view === 'detail'}
          className={`subtab ${view === 'detail' ? 'active' : ''}`}
          onClick={() => onChangeView('detail')}
        >
          个股详情
        </button>
        <button
          role="tab"
          aria-selected={view === 'watchlist'}
          className={`subtab ${view === 'watchlist' ? 'active' : ''}`}
          onClick={() => onChangeView('watchlist')}
        >
          观察池 {portfolio.watchlist.length}
        </button>
      </div>
      {view === 'watchlist' ? <WatchlistView {...props} /> : <StockDetail {...props} />}
    </>
  );
}

function rangeStats(candles: { close: number; high: number; low: number; volume: number }[]) {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const ret = (n: number) => {
    const base = candles[candles.length - 1 - n];
    return base ? ((last.close / base.close) - 1) * 100 : null;
  };
  const vols = candles.slice(-6, -1).map((c) => c.volume);
  const avgVol = vols.length ? vols.reduce((sum, v) => sum + v, 0) / vols.length : 0;
  const rets: number[] = [];
  for (let i = Math.max(1, candles.length - 20); i < candles.length; i += 1) {
    rets.push((candles[i].close / candles[i - 1].close - 1) * 100);
  }
  const mean = rets.reduce((sum, v) => sum + v, 0) / (rets.length || 1);
  const variance = rets.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (rets.length || 1);
  return {
    d5: ret(5),
    d10: ret(10),
    d20: ret(20),
    d60: ret(60),
    amplitude: ((last.high - last.low) / prev.close) * 100,
    volRatio: avgVol ? last.volume / avgVol : null,
    volatility: Math.sqrt(variance) * Math.sqrt(252),
  };
}

const PERIODS: { id: KPeriod; label: string }[] = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
];
const INDICATORS: { id: KIndicator; label: string }[] = [
  { id: 'macd', label: 'MACD' },
  { id: 'kdj', label: 'KDJ' },
  { id: 'rsi', label: 'RSI' },
];

function StockDetail({ client, code, portfolio, onAddWatch, onAddBasket }: Props) {
  const [period, setPeriod] = useState<KPeriod>('day');
  const [indicator, setIndicator] = useState<KIndicator>('macd');
  const load = useCallback(
    () => (code ? client.getStock(code) : new Promise<never>(() => {})),
    [client, code],
  );
  const stock = useAsync(load);
  const news = useAsync(useCallback(() => client.getNews(), [client]));

  if (!code) {
    return (
      <div className="card">
        <EmptyBlock
          title="尚未选择股票"
          description="从复盘的涨停表、筛选结果或观察池进入。单击预览，双击打开本页。"
        />
      </div>
    );
  }

  if (stock.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 200, height: 20 }} />
        <div className="sk sk-line" style={{ width: 320 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
        </div>
        <div className="sk sk-card" style={{ height: 280 }} />
      </div>
    );
  }

  if (stock.phase === 'error') return <ErrorBlock error={stock.error} onRetry={stock.retry} />;

  const data = stock.data!;
  const inWatch = portfolio.watchlist.includes(data.code);
  const inBasket = portfolio.basket.includes(data.code);

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            {data.name} <span className="num muted" style={{ fontSize: 15 }}>{data.code}</span>
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">
            {data.board} · {STATUS_TEXT[data.trade_status]} · {data.industry ?? '行业未分类'} ·{' '}
            {data.concepts.slice(0, 3).join(' · ')}
          </div>
          <div className="quote-line">
            <span className={`quote-price ${toneOf(data.chg_pct)}`}>{fmt(data.price)}</span>
            <span className={`quote-chg ${toneOf(data.chg_pct)}`}>{pct(data.chg_pct)}</span>
            <span className="quote-meta">
              成交 {yuan(data.amount)} · 换手 {data.turnover_pct === null ? '—' : `${data.turnover_pct}%`} · 市值{' '}
              {data.mcap === null ? '—' : yuan(data.mcap)}
            </span>
          </div>
        </div>
        <div className="view-actions">
          <button className="btn" onClick={() => onAddWatch(data.code)} disabled={inWatch}>
            {inWatch ? '已在观察池' : '+ 观察池'}
          </button>
          <button className="btn" onClick={() => onAddBasket(data.code)} disabled={inBasket}>
            {inBasket ? '已在选股篮' : '+ 选股篮'}
          </button>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      {(() => {
        const range = rangeStats(data.candles);
        const cell = (
          label: string,
          value: string,
          extra?: { text: string; tone?: string },
          span = false,
        ) => (
          <div className={`mtile ${span ? 'span2' : ''}`} key={label}>
            <span className="k">{label}</span>
            <span className="v">{value}</span>
            {extra ? <span className={`s ${extra.tone ?? ''}`}>{extra.text}</span> : <span className="s" />}
          </div>
        );
        const pctCell = (label: string, value: number | null, span = false) =>
          cell(
            label,
            value === null ? '—' : pct(value),
            undefined,
            span,
          );
        return (
          <div className="card section">
            <div className="card-head">
              <span className="card-title">关键统计与区间表现</span>
              <span className="card-sub">按收盘价计算</span>
            </div>
            <div className="mosaic">
              <div className="mtile span2">
                <span className="k">现价</span>
                <span className={`v ${toneOf(data.chg_pct)}`}>{fmt(data.price)}</span>
                <span className={`s ${toneOf(data.chg_pct)}`}>{pct(data.chg_pct)}</span>
              </div>
              {pctCell('近 20 日', data.stats.chg_20d_pct)}
              {pctCell('5 日', range?.d5 ?? null)}
              {pctCell('10 日', range?.d10 ?? null)}
              {pctCell('60 日', range?.d60 ?? null)}
              <div className="mtile">
                <span className="k">低开高走率</span>
                <span className="v">
                  {data.stats.low_open.rate === null ? '—' : `${(data.stats.low_open.rate * 100).toFixed(1)}%`}
                </span>
                <span className="s">
                  {data.stats.low_open.hits}/{data.stats.low_open.samples} 笔
                </span>
              </div>
              <div className="mtile">
                <span className="k">近 250 日涨停</span>
                <span className="v">{data.stats.limit_250}</span>
                <span className="s">次</span>
              </div>

              <div className="mtile">
                <span className="k">最高连板</span>
                <span className="v">{data.stats.max_ladder}<small>板</small></span>
                <span className="s" />
              </div>
              <div className="mtile">
                <span className="k">振幅</span>
                <span className="v">{range ? `${range.amplitude.toFixed(2)}%` : '—'}</span>
                <span className="s" />
              </div>
              <div className="mtile">
                <span className="k">量比</span>
                <span className="v">{range?.volRatio == null ? '—' : range.volRatio.toFixed(2)}</span>
                <span className="s" />
              </div>
              <div className="mtile">
                <span className="k">20 日波动率</span>
                <span className="v">{range ? `${range.volatility.toFixed(1)}%` : '—'}</span>
                <span className="s" />
              </div>
              <div className="mtile">
                <span className="k">成交额</span>
                <span className="v">{yuan(data.amount)}</span>
                <span className="s">换手 {data.turnover_pct === null ? '—' : `${data.turnover_pct}%`}</span>
              </div>
              <div className="mtile">
                <span className="k">流通市值</span>
                <span className="v">{data.mcap === null ? '—' : yuan(data.mcap)}</span>
                <span className="s">{data.industry ?? '行业未分类'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="card section">
        <div className="card-head">
          <span className="card-title">日 K · 均线 · 成交量 · MACD</span>
          <span className="card-sub">{data.candles.length} 个交易日 · 前复权</span>
        </div>
        <div className="kline-toolbar">
          <div className="seg" role="tablist" aria-label="K 线周期">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={period === item.id}
                className={`seg-item ${period === item.id ? 'active' : ''}`}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="seg" role="tablist" aria-label="副图指标">
            {INDICATORS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={indicator === item.id}
                className={`seg-item ${indicator === item.id ? 'active' : ''}`}
                onClick={() => setIndicator(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {data.candles.length === 0 ? (
          <EmptyBlock title="没有 K 线数据" description="该标的当日没有行情数据。" />
        ) : (
          <StockChart candles={data.candles} period={period} indicator={indicator} />
        )}
      </div>

      {(() => {
        const related = (news.data?.items ?? []).filter((item) => item.codes.includes(data.code)).slice(0, 3);
        if (related.length === 0) return null;
        return (
          <div className="card section">
            <div className="card-head">
              <span className="card-title">相关资讯</span>
              <span className="card-sub">{related.length} 条</span>
            </div>
            {related.map((item) => (
              <div className="news-row2 stock-news" key={item.id}>
                <div className="ntime">{item.published}</div>
                <div className="nmain">
                  <div className="ntitle">{item.title}</div>
                  <div className="nmeta">
                    <span>{item.source}</span>
                    <span className="ndot" aria-hidden="true">·</span>
                    <span>
                      {item.reason_source === 'exchange' ? '交易所公告' : item.reason_source === 'news' ? '媒体资讯' : '规则推断'}
                    </span>
                  </div>
                </div>
                <div />
              </div>
            ))}
          </div>
        );
      })()}
    </>
  );
}

function WatchlistView({ client, portfolio, onOpenStock, onRemoveWatch }: Props) {
  const codes = portfolio.watchlist;
  const key = useMemo(() => codes.join(','), [codes]);
  const load = useCallback(
    () => (codes.length ? client.getStocks(codes) : Promise.resolve([])),
    [client, key, codes],
  );
  const stocks = useAsync(load);

  if (codes.length === 0) {
    return (
      <div className="card">
        <EmptyBlock
          title="观察池为空"
          description="从复盘、筛选或个股页加入观察。"
        />
      </div>
    );
  }

  if (stocks.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row" />
      </div>
    );
  }

  if (stocks.phase === 'error') return <ErrorBlock error={stocks.error} onRetry={stocks.retry} />;

  const rows = stocks.data ?? [];

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">观察池</span>
        <span className="card-sub">{rows.length} 只 · 内存态，刷新后清空</span>
      </div>
      {rows.length === 0 ? (
        <EmptyBlock title="观察池里的标的没有行情" description="这些标的当日没有行情数据。" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>股票</th><th className="num">现价</th><th className="num">涨跌幅</th>
                <th className="num">换手率</th><th className="num">成交额</th>
                <th className="num">连板上限</th><th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stock) => (
                <tr
                  key={stock.code}
                  style={{ cursor: 'pointer' }}
                  tabIndex={0}
                  onDoubleClick={() => onOpenStock(stock.code)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); onOpenStock(stock.code); }
                  }}
                >
                  <td>
                    <div className="stock-cell">
                      <span className="n">{stock.name}</span>
                      <span className="c">{stock.code}</span>
                    </div>
                  </td>
                  <td className="num">{fmt(stock.price)}</td>
                  <td className={`num ${toneOf(stock.chg_pct)}`}>{pct(stock.chg_pct)}</td>
                  <td className="num">{stock.turnover_pct === null ? '—' : `${stock.turnover_pct}%`}</td>
                  <td className="num">{yuan(stock.amount)}</td>
                  <td className="num">{stock.stats.max_ladder} 板</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-small" onClick={() => onOpenStock(stock.code)}>打开</button>{' '}
                    <button className="btn btn-small" onClick={() => onRemoveWatch(stock.code)}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
