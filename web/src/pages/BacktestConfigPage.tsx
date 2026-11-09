import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { BacktestForm, BacktestOptions } from '../api/types';
import { ApiError } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip } from '../components/States';
import { yuan } from '../lib/format';

interface Props {
  client: ApiClient;
  onSubmitted: (taskId: string) => void;
}

export function BacktestConfigPage({ client, onSubmitted }: Props) {
  const load = useCallback(() => client.getBacktestOptions(), [client]);
  const options = useAsync(load);
  const [form, setForm] = useState<BacktestForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (options.data && !form) setForm(options.data.defaults);
  }, [options.data, form]);

  if (options.phase === 'loading') {
    return (
      <div className="skeleton" aria-busy="true">
        <div className="sk sk-line" style={{ width: 200, height: 20 }} />
        <div className="sk sk-card" style={{ height: 220 }} />
      </div>
    );
  }
  if (options.phase === 'error') return <ErrorBlock error={options.error} onRetry={options.retry} />;

  const data: BacktestOptions = options.data!;
  if (data.meta.status.level === 'empty') {
    return (
      <div className="card">
        <EmptyBlock
          title="当日没有可回测的数据"
          description="数据快照为空（status.level = empty），策略与股票池都不可用，提交按钮不会出现，避免发出必然失败的任务。"
          children={<button className="btn" onClick={options.retry}>重新加载</button>}
        />
      </div>
    );
  }
  if (!form) return null;

  const patch = (next: Partial<BacktestForm>) => setForm({ ...form, ...next });
  const offline = data.meta.status.level === 'stale';

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const task = await client.submitBacktest(form);
      onSubmitted(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('UNKNOWN', '提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            日频回测
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">单策略基础回测 · 信号与成交分离 · 基准沪深 300（示例）</div>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="card section">
        <div className="card-head">
          <span className="card-title">回测配置</span>
          <span className="card-sub">参数变更会写入任务记录</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="bt-strategy">策略</label>
            <select id="bt-strategy" value={form.strategy_id} onChange={(e) => patch({ strategy_id: e.target.value })}>
              {data.strategies.map((item) => (
                <option key={item.id} value={item.id}>{item.label} {item.version}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bt-pool">股票池</label>
            <select id="bt-pool" value={form.pool} onChange={(e) => patch({ pool: e.target.value as BacktestForm['pool'] })}>
              {data.pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.label}{pool.count === null ? '' : `（${pool.count}）`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bt-maxpos">最大持仓数</label>
            <input id="bt-maxpos" type="number" min={1} max={20} value={form.max_pos} onChange={(e) => patch({ max_pos: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="bt-from">开始日期</label>
            <input id="bt-from" type="date" value={form.from} onChange={(e) => patch({ from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="bt-to">结束日期</label>
            <input id="bt-to" type="date" value={form.to} onChange={(e) => patch({ to: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="bt-capital">初始资金（元）</label>
            <input id="bt-capital" type="number" step={10000} value={form.capital} onChange={(e) => patch({ capital: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="bt-fee">佣金费率</label>
            <input id="bt-fee" type="number" step={0.0001} value={form.fee_rate} onChange={(e) => patch({ fee_rate: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="bt-stamp">印花税率（卖出）</label>
            <input id="bt-stamp" type="number" step={0.0001} value={form.stamp_rate} onChange={(e) => patch({ stamp_rate: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="bt-slip">滑点</label>
            <input id="bt-slip" type="number" step={0.0001} value={form.slip_rate} onChange={(e) => patch({ slip_rate: Number(e.target.value) })} />
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={submit} disabled={submitting || offline}>
            {submitting ? '提交中…' : '提交回测'}
          </button>
          <span className="small muted">提交后进入任务中心，不阻塞页面查询 · 初始资金 {yuan(form.capital)}</span>
        </div>

        {error ? (
          <div className="banner banner-bad section" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>{error.message}</strong>
              <span className="banner-detail">错误码 {error.code}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card section">
        <div className="card-head"><span className="card-title">交易假设</span></div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--muted-2)', lineHeight: 1.9 }}>
          {data.assumptions.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="card-note">假设文本由接口返回，报告页与配置页共用同一份，避免两处不一致。</div>
      </div>
    </>
  );
}
