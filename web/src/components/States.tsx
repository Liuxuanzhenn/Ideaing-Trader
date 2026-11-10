import type { DataMeta, DataStatusLevel } from '../api/types';
import type { ApiError } from '../api/types';
import { fmtDateTime, humanGap } from '../lib/format';

export function StatusChip({ level }: { level: DataStatusLevel }) {
  const map: Record<DataStatusLevel, { cls: string; text: string }> = {
    ok: { cls: '', text: '数据完整' },
    partial: { cls: 'status-warn', text: '部分缺失' },
    stale: { cls: 'status-bad', text: '缓存 · 已过期' },
    error: { cls: 'status-bad', text: '数据不可用' },
    empty: { cls: '', text: '无数据' },
  };
  const { cls, text } = map[level];
  const dot = level === 'ok' ? 'dot dot-ok' : level === 'partial' ? 'dot' : 'dot';
  return (
    <span className={`status-chip ${cls}`.trim()}>
      <span className={dot} />
      {text}
    </span>
  );
}

export function StaleBanner({ meta }: { meta: DataMeta }) {
  return (
    <div className="banner banner-warn" role="status">
      <span aria-hidden="true">△</span>
      <div>
        <strong>数据已过期</strong>：以下为缓存结果，不能视为实时行情。
        <span className="banner-detail">
          数据 as_of {fmtDateTime(meta.as_of)} · 最后成功更新 {fmtDateTime(meta.updated_at)} · 距当前 {humanGap(meta.as_of)}
        </span>
      </div>
    </div>
  );
}

export function PartialBanner({ meta }: { meta: DataMeta }) {
  if (meta.status.level !== 'partial') return null;
  return (
    <div className="banner banner-warn" role="status">
      <span aria-hidden="true">△</span>
      <div>
        <strong>数据部分缺失</strong>：{meta.status.failed_sources.join('、') || '未知来源'} 不可用，相关指标显示为「—」。
        <span className="banner-detail">
          覆盖率 {meta.coverage.pct === null ? '—' : `${meta.coverage.pct}%`} · 数据 as_of {fmtDateTime(meta.as_of)} · 快照 {meta.snapshot}
        </span>
      </div>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error?: ApiError; onRetry: () => void }) {
  return (
    <div className="error-block">
      <strong>数据请求失败</strong>
      <p className="small" style={{ marginTop: 6, color: 'var(--muted)' }}>
        {error?.message ?? '未知错误'}
      </p>
      <p className="error-code" style={{ marginTop: 6 }}>
        {error?.code ?? 'UNKNOWN'}
        {error?.status ? ` · HTTP ${error.status}` : ''}
      </p>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-small" onClick={onRetry}>重试</button>
      </div>
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="state-block">
      <h4>{title}</h4>
      <p>{description}</p>
      {children ? <div className="state-actions">{children}</div> : null}
    </div>
  );
}

export function ReviewSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="加载复盘数据">
      <div className="sk sk-line" style={{ width: 220, height: 20 }} />
      <div className="sk sk-line" style={{ width: 320 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
      <div className="sk sk-card" style={{ height: 120 }} />
      <div className="sk sk-row" />
      <p className="small muted" role="status">正在加载复盘数据…</p>
    </div>
  );
}

export function TasksSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="加载任务">
      <div className="sk sk-line" style={{ width: 200, height: 20 }} />
      <div className="sk sk-line" style={{ width: 300 }} />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <p className="small muted" role="status">正在加载任务列表…</p>
    </div>
  );
}
