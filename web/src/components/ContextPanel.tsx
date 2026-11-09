import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import type { ServiceStatus } from '../api/types';
import type { AsyncState } from '../lib/useAsync';
import { useAsync } from '../lib/useAsync';
import { fmt, fmtDateTime, humanGap, pct, toneOf, yuan } from '../lib/format';

interface Props {
  status: AsyncState<ServiceStatus>;
  client: ApiClient;
  selectedCode: string | null;
  onOpenStock: (code: string) => void;
  onAddWatch: (code: string) => void;
  isWatched: boolean;
}

export function ContextPanel({ status, client, selectedCode, onOpenStock, onAddWatch, isWatched }: Props) {
  const load = useCallback(
    () => (selectedCode ? client.getStock(selectedCode) : new Promise<never>(() => {})),
    [client, selectedCode],
  );
  const stock = useAsync(load);
  const data = status.data;

  return (
    <aside className="context" aria-label="上下文">
      <div className="context-head">
        <span>上下文</span>
      </div>
      <div className="context-body">
        <div className="ctx-section">
          <div className="ctx-label">当前对象</div>
          {!selectedCode ? (
            <div className="small muted">尚未选择对象。单击复盘表格行或筛选结果可在此预览。</div>
          ) : stock.phase === 'loading' ? (
            <div className="small muted">读取中…</div>
          ) : stock.phase === 'error' ? (
            <div className="small muted">预览失败：{stock.error?.code}</div>
          ) : (
            (() => {
              const item = stock.data!;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ fontSize: 16 }}>{item.name}</strong>
                    <span className="num muted small">{item.code}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, margin: '6px 0 2px' }}>
                    <span className={`num ${toneOf(item.chg_pct)}`} style={{ fontSize: 24 }}>{fmt(item.price)}</span>
                    <span className={toneOf(item.chg_pct)}>{pct(item.chg_pct)}</span>
                  </div>
                  <dl className="ctx-kv" style={{ fontSize: 13, marginTop: 10 }}>
                    <dt>成交额</dt><dd className="num">{yuan(item.amount)}</dd>
                    <dt>换手率</dt><dd className="num">{item.turnover_pct === null ? '—' : `${item.turnover_pct}%`}</dd>
                    <dt>连板上限</dt><dd className="num">{item.stats.max_ladder} 板</dd>
                    <dt>近 250 日涨停</dt><dd className="num">{item.stats.limit_250} 次</dd>
                  </dl>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-small btn-primary" onClick={() => onOpenStock(item.code)}>打开个股页</button>
                    <button className="btn btn-small" onClick={() => onAddWatch(item.code)} disabled={isWatched}>
                      {isWatched ? '已在观察池' : '+ 观察池'}
                    </button>
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>双击表格行可直接打开个股页。</div>
                </>
              );
            })()
          )}
        </div>

        <div className="ctx-section">
          <div className="ctx-label">当前数据</div>
          {status.phase === 'loading' ? (
            <div className="small muted">读取中…</div>
          ) : status.phase === 'error' ? (
            <div className="small muted">数据状态不可用</div>
          ) : (
            <dl className="ctx-kv">
              <dt>数据 as_of</dt>
              <dd className="num">{data ? fmtDateTime(data.as_of) : '—'}</dd>
              <dt>最后更新</dt>
              <dd className="num">{data ? fmtDateTime(data.updated_at) : '—'}</dd>
              <dt>距当前</dt>
              <dd>{data ? humanGap(data.as_of) : '—'}</dd>
              <dt>覆盖率</dt>
              <dd className="num">{data ? `${data.coverage.pct}%` : '—'}</dd>
              <dt>连接</dt>
              <dd>{data ? (data.connection === 'online' ? '已连接' : '已断连') : '—'}</dd>
            </dl>
          )}
        </div>
      </div>
    </aside>
  );
}
