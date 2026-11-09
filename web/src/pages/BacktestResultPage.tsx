import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { BacktestResult } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { AreaChart, LineChart } from '../components/charts';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';
import { fmt, pct, toneOf, yuan } from '../lib/format';

interface Props {
  client: ApiClient;
  taskId: string | null;
  onGoTasks: () => void;
}

const TRADE_PAGE = 5;

export function BacktestResultPage({ client, taskId, onGoTasks }: Props) {
  const load = useCallback(
    () => (taskId ? client.getBacktestResult(taskId) : new Promise<never>(() => {})),
    [client, taskId],
  );
  const result = useAsync(load);
  const [tradePage, setTradePage] = useState(1);

  if (!taskId) {
    return (
      <div className="card">
        <EmptyBlock
          title="尚未选择回测任务"
          description="回测结果按任务号打开。可以从任务中心选择一条已完成（success）的回测任务。"
          children={<button className="btn btn-primary" onClick={onGoTasks}>去任务中心</button>}
        />
      </div>
    );
  }

  if (result.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 220, height: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
        </div>
        <div className="sk sk-card" style={{ height: 260 }} />
      </div>
    );
  }

  if (result.phase === 'error') {
    return (
      <>
        <ErrorBlock error={result.error} onRetry={result.retry} />
        <div className="section"><button className="btn" onClick={onGoTasks}>返回任务中心</button></div>
      </>
    );
  }

  const data: BacktestResult = result.data!;
  const metrics = data.metrics;
  const pages = Math.max(1, Math.ceil(data.trades.length / TRADE_PAGE));
  const current = Math.min(tradePage, pages);
  const trades = data.trades.slice((current - 1) * TRADE_PAGE, current * TRADE_PAGE);

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            回测结果 · {data.task_id}
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">{data.run_meta.strategy} · {data.run_meta.range} · 快照 {data.run_meta.snapshot}</div>
        </div>
        <div className="view-actions">
          <button className="btn" onClick={onGoTasks}>任务中心</button>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="metric-row section">
        <div className="card metric-card">
          <div className="k">累计收益</div>
          <div className={`v ${toneOf(metrics.total_pct)}`}>{pct(metrics.total_pct)}</div>
          <div className="s">区间 {data.run_meta.range}</div>
        </div>
        <div className="card metric-card">
          <div className="k">年化收益</div>
          <div className={`v ${toneOf(metrics.annual_pct)}`}>{pct(metrics.annual_pct)}</div>
          <div className="s">基准 {pct(metrics.bench_pct)}</div>
        </div>
        <div className="card metric-card">
          <div className="k">最大回撤</div>
          <div className="v down">{metrics.max_dd_pct.toFixed(1)}%</div>
          <div className="s">净值峰值到谷底</div>
        </div>
        <div className="card metric-card">
          <div className="k">超额收益</div>
          <div className={`v ${toneOf(metrics.excess_pct)}`}>{pct(metrics.excess_pct)}</div>
          <div className="s">策略 − 沪深 300</div>
        </div>
        <div className="card metric-card">
          <div className="k">交易数</div>
          <div className="v">{metrics.trades}</div>
          <div className="s">样例展示 {data.trades.length} 笔</div>
        </div>
        <div className="card metric-card">
          <div className="k">胜率</div>
          <div className="v">{metrics.win_rate === null ? '—' : `${(metrics.win_rate * 100).toFixed(1)}%`}</div>
          <div className="s">无样本时为 —</div>
        </div>
        <div className="card metric-card">
          <div className="k">费用合计</div>
          <div className="v">{yuan(metrics.fees)}</div>
          <div className="s">佣金 + 印花税 + 滑点</div>
        </div>
        <div className="card metric-card">
          <div className="k">参数哈希</div>
          <div className="v" style={{ fontSize: 15 }}>{data.run_meta.params_hash}</div>
          <div className="s">seed {data.run_meta.seed}</div>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <span className="card-title">累计净值与基准</span>
          <span className="card-sub">起点 100</span>
        </div>
        <LineChart
          labels={data.labels}
          series={[
            { values: data.equity, color: 'var(--text)', label: '策略' },
            { values: data.benchmark, color: 'var(--muted-2)', label: '沪深 300', dashed: true },
          ]}
        />
      </div>

      <div className="card section">
        <div className="card-head">
          <span className="card-title">回撤</span>
          <span className="card-sub">最大回撤 {metrics.max_dd_pct.toFixed(1)}%</span>
        </div>
        <AreaChart values={data.drawdown} />
      </div>

      <div className="card section">
        <div className="card-head"><span className="card-title">分年统计</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>年份</th><th className="num">策略</th><th className="num">基准</th><th className="num">回撤</th><th className="num">交易</th><th className="num">胜率</th></tr>
            </thead>
            <tbody>
              {data.yearly.map((year) => (
                <tr key={year.year}>
                  <td>{year.year}</td>
                  <td className={`num ${toneOf(year.ret_pct)}`}>{pct(year.ret_pct)}</td>
                  <td className={`num ${toneOf(year.bench_pct)}`}>{pct(year.bench_pct)}</td>
                  <td className="num down">{year.max_dd_pct.toFixed(1)}%</td>
                  <td className="num">{year.trades}</td>
                  <td className="num">{year.win_rate === null ? '—' : `${(year.win_rate * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid section" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">交易明细</span>
            <span className="card-sub">{data.trades.length} 笔样例 · 第 {current}/{pages} 页</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>开仓</th><th>平仓</th><th>股票</th><th className="num">数量</th><th className="num">成交价</th><th className="num">盈亏</th><th className="num">费用</th></tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={`${trade.code}-${trade.open}`}>
                    <td className="num">{trade.open}</td>
                    <td className="num">{trade.close}</td>
                    <td>{trade.name} <span className="num muted">{trade.code}</span></td>
                    <td className="num">{fmt(trade.qty, 0)}</td>
                    <td className="num">{fmt(trade.price)}</td>
                    <td className={`num ${toneOf(trade.pnl)}`}>{trade.pnl > 0 ? '+' : ''}{fmt(trade.pnl, 0)}</td>
                    <td className="num muted">{fmt(trade.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="page-info">共 {data.trades.length} 笔样例</span>
            <button className="page-btn" onClick={() => setTradePage(current - 1)} disabled={current <= 1}>上一页</button>
            <button className="page-btn" onClick={() => setTradePage(current + 1)} disabled={current >= pages}>下一页</button>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">交易假设</span></div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted-2)', lineHeight: 1.85 }}>
            {data.assumptions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="card section">
        <div className="card-head"><span className="card-title">可复现信息</span></div>
        <dl className="ctx-kv" style={{ fontSize: 13.5 }}>
          <dt>数据快照</dt><dd className="num">{data.run_meta.snapshot}</dd>
          <dt>策略</dt><dd className="num">{data.run_meta.strategy}</dd>
          <dt>股票池</dt><dd>{data.run_meta.pool}</dd>
          <dt>基准</dt><dd>{data.run_meta.benchmark}</dd>
          <dt>成交时点</dt><dd>{data.run_meta.timing}</dd>
        </dl>
      </div>
    </>
  );
}
