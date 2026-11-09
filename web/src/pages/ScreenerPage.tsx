import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { Portfolio, ScreenCondition, ScreenResult, ScreenField, ScreenOp } from '../api/types';
import { ApiError } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';
import { fmt, pct, toneOf, yuan } from '../lib/format';

interface Props {
  client: ApiClient;
  portfolio: Portfolio;
  onAddWatch: (code: string) => void;
  onAddBasket: (code: string) => void;
  onOpenStock: (code: string) => void;
}

const PAGE_SIZE = 8;

export function ScreenerPage({ client, portfolio, onAddWatch, onAddBasket, onOpenStock }: Props) {
  const loadOptions = useCallback(() => client.getScreenOptions(), [client]);
  const options = useAsync(loadOptions);

  const [conditions, setConditions] = useState<ScreenCondition[]>([]);
  const [draft, setDraft] = useState<{ field: ScreenField; op: ScreenOp; value: string }>({
    field: 'chg_pct',
    op: 'gte',
    value: '',
  });
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<ApiError | null>(null);
  const [page, setPage] = useState(1);

  if (options.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 180, height: 20 }} />
        <div className="sk sk-card" style={{ height: 140 }} />
        <div className="sk sk-row" /><div className="sk sk-row" />
      </div>
    );
  }
  if (options.phase === 'error') return <ErrorBlock error={options.error} onRetry={options.retry} />;

  const opt = options.data!;
  if (opt.meta.status.level === 'empty') {
    return (
      <div className="card">
        <EmptyBlock
          title="当日没有可筛选的数据"
          description="数据快照为空（status.level = empty），筛选无法运行；这与「运行后 0 命中」是两种不同状态。"
          children={<button className="btn" onClick={options.retry}>重新加载</button>}
        />
      </div>
    );
  }
  const fieldLabel = (id: ScreenField) => opt.fields.find((field) => field.id === id)?.label ?? id;
  const opLabel = (id: ScreenOp) => opt.ops.find((op) => op.id === id)?.label ?? id;

  const addCondition = () => {
    const value = Number(draft.value);
    if (!Number.isFinite(value)) return;
    if (conditions.length >= opt.max_conditions) return;
    setConditions([...conditions, { field: draft.field, op: draft.op, value }]);
    setDraft({ ...draft, value: '' });
  };

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const data = await client.runScreen(conditions);
      setResult(data);
      setPage(1);
    } catch (error) {
      setRunError(error instanceof ApiError ? error : new ApiError('UNKNOWN', '筛选失败'));
    } finally {
      setRunning(false);
    }
  };

  const rows = result?.rows ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const disabled = opt.meta.status.level === 'stale';

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            条件筛选
            <StatusChip level={opt.meta.status.level} />
          </h2>
          <div className="view-sub">AND 组合 · 数据 as_of {opt.meta.as_of.slice(0, 10)}</div>
        </div>
      </div>

      {opt.meta.status.level === 'stale' ? <StaleBanner meta={opt.meta} /> : null}
      {opt.meta.status.level === 'partial' ? <PartialBanner meta={opt.meta} /> : null}

      <div className="card section">
        <div className="card-head">
          <span className="card-title">筛选条件</span>
          <span className="card-sub">{conditions.length}/{opt.max_conditions} 个条件</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="scr-field">字段</label>
            <select id="scr-field" value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value as ScreenField })}>
              {opt.fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scr-op">运算符</label>
            <select id="scr-op" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as ScreenOp })}>
              {opt.ops.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="scr-value">数值</label>
            <input id="scr-value" type="number" step="0.1" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" onClick={addCondition} disabled={conditions.length >= opt.max_conditions}>添加条件</button>
          <button className="btn btn-primary" onClick={run} disabled={running || disabled || conditions.length === 0}>
            {running ? '运行中…' : '运行筛选'}
          </button>
          <button className="btn" onClick={() => { setConditions([]); setResult(null); }}>清空</button>
        </div>
        <div className="cond-list">
          {conditions.length === 0 ? (
            <span className="small muted">尚未设置条件</span>
          ) : (
            conditions.map((cond, index) => (
              <span className="cond-chip" key={`${cond.field}-${index}`}>
                {index > 0 ? 'AND' : '条件'} {fieldLabel(cond.field)} {opLabel(cond.op)} {cond.value}
                <button onClick={() => setConditions(conditions.filter((_, i) => i !== index))} aria-label="移除条件">✕</button>
              </span>
            ))
          )}
        </div>
      </div>

      {runError ? <div className="section"><ErrorBlock error={runError} onRetry={run} /></div> : null}

      <div className="card section">
        <div className="card-head">
          <span className="card-title">筛选结果</span>
          <span className="card-sub">
            {result ? `命中 ${rows.length} 只 · 运行 ${result.ran_at} · ${result.elapsed_ms}ms` : '尚未运行'}
          </span>
        </div>

        {running ? (
          <div className="skeleton" aria-busy="true">
            <div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row" />
          </div>
        ) : !result ? (
          <div className="state-block">
            <h4>还没有结果</h4>
            <p>添加条件后点击「运行筛选」。</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="state-block">
            <h4>没有股票满足当前条件</h4>
            <p>接口返回 rows 为空数组，与「尚未运行」是两种不同状态。</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>股票</th><th>行业</th>
                    <th className="num">现价</th><th className="num">涨跌幅</th>
                    <th className="num">换手率</th><th className="num">连板</th>
                    <th className="num">近 20 日涨停</th><th className="num">成交额</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.code}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      onDoubleClick={() => onOpenStock(row.code)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); onOpenStock(row.code); }
                      }}
                    >
                      <td>
                        <div className="stock-cell">
                          <span className="n">{row.name}</span>
                          <span className="c">{row.code}</span>
                        </div>
                      </td>
                      <td className="muted">{row.industry ?? '—'}</td>
                      <td className="num">{fmt(row.price)}</td>
                      <td className={`num ${toneOf(row.chg_pct)}`}>{pct(row.chg_pct)}</td>
                      <td className="num">{row.turnover_pct === null ? '—' : `${row.turnover_pct}%`}</td>
                      <td className="num">{row.ladder || '—'}</td>
                      <td className="num">{row.limit_20}</td>
                      <td className="num">{yuan(row.amount)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-small" onClick={() => onAddWatch(row.code)} disabled={portfolio.watchlist.includes(row.code)}>
                          {portfolio.watchlist.includes(row.code) ? '已观察' : '观察'}
                        </button>{' '}
                        <button className="btn btn-small" onClick={() => onAddBasket(row.code)} disabled={portfolio.basket.includes(row.code)}>
                          {portfolio.basket.includes(row.code) ? '已选' : '选股篮'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span className="page-info">共 {rows.length} 只 · 第 {current}/{pages} 页 · {PAGE_SIZE} 只/页</span>
              <button className="page-btn" onClick={() => setPage(current - 1)} disabled={current <= 1}>上一页</button>
              <button className="page-btn" onClick={() => setPage(current + 1)} disabled={current >= pages}>下一页</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
