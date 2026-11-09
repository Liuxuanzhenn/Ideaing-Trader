import { useCallback, useMemo } from 'react';
import type { ApiClient } from '../api/client';
import type { Portfolio } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { Candles } from '../components/charts';
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

function StockDetail({ client, code, portfolio, onAddWatch, onAddBasket }: Props) {
  const load = useCallback(
    () => (code ? client.getStock(code) : new Promise<never>(() => {})),
    [client, code],
  );
  const stock = useAsync(load);

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
  const lowOpen = data.stats.low_open.rate;

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            {data.name} <span className="num muted" style={{ fontSize: 15 }}>{data.code}</span>
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">
            {data.board} · {STATUS_TEXT[data.trade_status]} ·{' '}
            {data.industry ?? '行业未分类（数据源未提供）'} · {data.concepts.join(' · ')}
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

      <div className="card section">
        <div className="card-head">
          <span className="card-title">关键统计</span>
          <span className="card-sub">窗口与样本随值展示</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
          <div>
            <div className="small muted">现价</div>
            <div className={`stat-line ${toneOf(data.chg_pct)}`}>
              {fmt(data.price)} <span className="small">{pct(data.chg_pct)}</span>
            </div>
            <div className="small muted">成交额 {yuan(data.amount)}</div>
          </div>
          <div>
            <div className="small muted">近 20 日涨幅</div>
            <div className={`stat-line ${toneOf(data.stats.chg_20d_pct)}`}>{pct(data.stats.chg_20d_pct)}</div>
            <div className="small muted">窗口 20 个交易日</div>
          </div>
          <div>
            <div className="small muted">低开高走率</div>
            <div className="stat-line">{lowOpen === null ? '—' : `${(lowOpen * 100).toFixed(1)}%`}</div>
            <div className="small muted">
              {data.stats.low_open.hits}/{data.stats.low_open.samples} 笔 ·{' '}
              {data.stats.low_open.samples < 10 ? '样本不足' : '样本满足阈值'}
            </div>
          </div>
          <div>
            <div className="small muted">近 250 日涨停</div>
            <div className="stat-line">{data.stats.limit_250} 次</div>
            <div className="small muted">最高连板 {data.stats.max_ladder} 板</div>
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <span className="card-title">日 K 与成交量</span>
          <span className="card-sub">
            换手 {data.turnover_pct === null ? '—' : `${data.turnover_pct}%`} · 流通市值 {data.mcap === null ? '—' : yuan(data.mcap)}
          </span>
        </div>
        {data.candles.length === 0 ? (
          <EmptyBlock title="没有 K 线数据" description="该标的当日没有行情数据。" />
        ) : (
          <Candles candles={data.candles} />
        )}
      </div>
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
