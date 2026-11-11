import type { AsyncState } from '../lib/useAsync';
import type { ServiceStatus } from '../api/types';
import { fmtDateTime, fmtDate } from '../lib/format';

interface Props {
  status: AsyncState<ServiceStatus>;
  ctxOpen: boolean;
  onToggleContext: () => void;
}

export function Topbar({ status, ctxOpen, onToggleContext }: Props) {
  const data = status.data;
  const level = data?.level;
  const dotClass =
    status.phase === 'error' ? 'dot dot-bad' : level === 'ok' ? 'dot dot-ok' : level === 'partial' ? 'dot dot-warn' : 'dot';
  const text =
    status.phase === 'loading'
      ? '状态读取中'
      : status.phase === 'error'
        ? '状态不可用'
        : level === 'partial'
          ? '部分缺失'
          : level === 'stale'
            ? `缓存 · ${data ? fmtDateTime(data.as_of) : ''}`
            : `完整 · ${data ? fmtDateTime(data.updated_at).slice(6) : ''}`;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">QW</span>
        <span className="brand-name">Quant Workbench</span>
      </div>

      <div className="topbar-mid">
        <span className="chip" title="数据对应的交易日">
          <span className="dot" />
          <b>{data ? fmtDate(data.as_of) : '—'}</b>
        </span>
        <span className="chip" title="数据状态与质量">
          <span className={dotClass} />
          <span>{text}</span>
        </span>
      </div>

      <div className="topbar-actions">
        <button className="btn btn-small" onClick={onToggleContext} aria-pressed={ctxOpen}>
          {ctxOpen ? '收起上下文' : '上下文'}
        </button>
      </div>
    </header>
  );
}
