import type { AsyncState } from '../lib/useAsync';
import type { ServiceStatus } from '../api/types';
import { fmtDateTime, humanGap } from '../lib/format';

interface Props {
  status: AsyncState<ServiceStatus>;
}

export function ContextPanel({ status }: Props) {
  const data = status.data;
  return (
    <aside className="context" aria-label="上下文">
      <div className="context-head">
        <span>上下文</span>
      </div>
      <div className="context-body">
        <div className="ctx-section">
          <div className="ctx-label">当前上下文</div>
          <div className="small muted">尚未选择对象。后续点击表格行会在这里预览个股或任务。</div>
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
