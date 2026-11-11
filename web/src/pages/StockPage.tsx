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

/**
 * 区间表现（展示层派生）：全部由日线收盘价计算，不来自后端。
 * 历史不足时返回 null 而不是 0——5/10/20/60 日涨幅、量比、波动率都遵循这条。
 */
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
            {data.name ?? data.code}{' '}
            <span className="num muted" style={{ fontSize: 15 }}>{data.name ? data.code : ''}</span>
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">
            {data.board} · {STATUS_TEXT[data.trade_status]} · {data.industry ?? '行业未分类'} ·{' '}
            {data.concepts.slice(0, 3).join(' · ')}
          </div>
          <div className="quote-line">
            <span className={`quote-price ${data.chg_pct === null ? 'flat' : toneOf(data.chg_pct)}`}>
              {data.price === null ? '—' : fmt(data.price)}
            </span>
            <span className={`quote-chg ${data.chg_pct === null ? 'flat' : toneOf(data.chg_pct)}`}>
              {data.chg_pct === null ? '—' : pct(data.chg_pct)}
            </span>
            <span className="quote-meta">
              成交 {data.amount === null ? '—' : yuan(data.amount)} · 换手{' '}
              {data.turnover_pct === null ? '—' : `${data.turnover_pct}%`} · 市值{' '}
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
        const relationText =
          data.context.relation === 'resonance'
            ? '共振'
            : data.context.relation === 'contrarian'
              ? '逆势'
              : data.context.relation === 'flat'
                ? '同步'
                : '—';
        return (
          <div className="card section">
            <div className="card-head">
              <span className="card-title">关键统计</span>
              <span className="card-sub">展示层计算</span>
            </div>

            <div className="stat4">
              <div className="stat">
                <div className="k">现价</div>
                <div className={`v ${data.chg_pct === null ? 'flat' : toneOf(data.chg_pct)}`}>
                  {data.price === null ? '—' : fmt(data.price)}{' '}
                  <span className="small">{data.chg_pct === null ? '' : pct(data.chg_pct)}</span>
                </div>
                <div className="s">
                  成交 {data.amount === null ? '—' : yuan(data.amount)} · 换手{' '}
                  {data.turnover_pct === null ? '—' : `${data.turnover_pct}%`}
                </div>
              </div>

              <div className="stat">
                <div className="k">低开高走率</div>
                <div className="v">
                  {data.stats.low_open.rate == null ? '—' : `${(data.stats.low_open.rate * 100).toFixed(1)}%`}
                </div>
                <div className="s">
                  {data.stats.low_open.hits}/{data.stats.low_open.samples} 笔 · {data.stats.low_open.window} 日窗口
                </div>
                <div className="s ctx">
                  今日 大盘 {data.context.market === null ? '—' : pct(data.context.market.chg_pct)}
                  {data.context.sector ? ` · ${data.context.sector.name} ${pct(data.context.sector.chg_pct)}` : ''}
                  <b className={data.context.relation === 'resonance' ? 'up' : data.context.relation === 'contrarian' ? 'down' : 'flat'}>
                    {relationText}
                  </b>
                </div>
              </div>

              <div className="stat">
                <div className="k">近 250 日涨停</div>
                <div className="v">{data.stats.limit_250} <span className="small">次</span></div>
                <div className="s">最高连板 {data.stats.max_ladder} 板</div>
              </div>

              <div className="stat">
                <div className="k">近 20 日涨幅</div>
                <div className={`v ${data.stats.chg_20d_pct === null ? 'flat' : toneOf(data.stats.chg_20d_pct)}`}>
                  {data.stats.chg_20d_pct === null ? '—' : pct(data.stats.chg_20d_pct)}
                </div>
                <div className="s">流通市值 {data.mcap === null ? '—' : yuan(data.mcap)}</div>
              </div>
            </div>

            <div className="range-row">
              {[
                ['5 日', range?.d5 ?? null],
                ['10 日', range?.d10 ?? null],
                ['20 日', range?.d20 ?? null],
                ['60 日', range?.d60 ?? null],
              ].map(([label, value]) => (
                <div className="range-cell" key={label as string}>
                  <span className="k">{label}</span>
                  <span className={`v ${value === null ? '' : toneOf(value as number)}`}>
                    {value === null ? '—' : pct(value as number)}
                  </span>
                </div>
              ))}
              <div className="range-cell">
                <span className="k">振幅</span>
                <span className="v">{range ? `${range.amplitude.toFixed(2)}%` : '—'}</span>
              </div>
              <div className="range-cell">
                <span className="k">量比</span>
                <span className="v">{range?.volRatio == null ? '—' : range.volRatio.toFixed(2)}</span>
              </div>
              <div className="range-cell">
                <span className="k">20 日波动率</span>
                <span className="v">{range ? `${range.volatility.toFixed(1)}%` : '—'}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="card section">
        <div className="card-head">
          <span className="card-title">日 K · 均线 · 成交量 · MACD</span>
          <span className="card-sub">
            {data.candles.length} 个交易日 · {data.price_adjustment === 'adj' ? '前复权' : '不复权'}
          </span>
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
        if (news.phase === 'error') {
          return (
            <div className="card section">
              <div className="card-head">
                <span className="card-title">相关资讯</span>
                <span className="card-sub">尚未接入</span>
              </div>
              <div className="card-note">{news.error?.message ?? '资讯尚未接入真实接口'}</div>
            </div>
          );
        }
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
        <span className="card-sub">{rows.length} 只 · 已保存到服务端</span>
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
                      <span className="n">{stock.name ?? '—'}</span>
                      <span className="c">{stock.code}</span>
                    </div>
                  </td>
                  <td className="num">{stock.price === null ? '—' : fmt(stock.price)}</td>
                  <td className={`num ${stock.chg_pct === null ? 'flat' : toneOf(stock.chg_pct)}`}>
                    {stock.chg_pct === null ? '—' : pct(stock.chg_pct)}
                  </td>
                  <td className="num">{stock.turnover_pct === null ? '—' : `${stock.turnover_pct}%`}</td>
                  <td className="num">{stock.amount === null ? '—' : yuan(stock.amount)}</td>
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
