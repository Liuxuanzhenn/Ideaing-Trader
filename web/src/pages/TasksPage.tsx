import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { TaskStatus } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, StaleBanner, StatusChip, TasksSkeleton } from '../components/States';
import { fmtDateTime } from '../lib/format';

type Filter = 'all' | 'active' | TaskStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '运行 / 排队' },
  { id: 'success', label: '成功' },
  { id: 'failed', label: '失败' },
  { id: 'canceled', label: '已取消' },
];

const STATUS_TEXT: Record<TaskStatus, string> = {
  running: '运行中',
  queued: '排队',
  success: '成功',
  failed: '失败',
  canceled: '已取消',
};

function pillClass(status: TaskStatus): string {
  if (status === 'running' || status === 'queued') return 'pill pill-running';
  if (status === 'success') return 'pill pill-success';
  if (status === 'failed') return 'pill pill-failed';
  return 'pill';
}

export function TasksPage({ client }: { client: ApiClient }) {
  const [filter, setFilter] = useState<Filter>('all');
  const load = useCallback(() => client.getTasks({ limit: 20 }), [client]);
  const tasks = useAsync(load);

  if (tasks.phase === 'loading') {
    return (
      <>
        <div className="view-head">
          <div>
            <h2 className="view-title">任务中心</h2>
            <div className="view-sub">正在读取任务…</div>
          </div>
        </div>
        <TasksSkeleton />
      </>
    );
  }

  if (tasks.phase === 'error') {
    return (
      <>
        <div className="view-head">
          <div>
            <h2 className="view-title">任务中心</h2>
            <div className="view-sub">任务列表请求失败</div>
          </div>
        </div>
        <ErrorBlock error={tasks.error} onRetry={tasks.retry} />
      </>
    );
  }

  const data = tasks.data!;
  const rows = data.items.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'active') return task.status === 'running' || task.status === 'queued';
    return task.status === filter;
  });

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            任务中心
            <StatusChip level={data.meta.status.level} />
          </h2>
          <div className="view-sub">
            覆盖数据更新、筛选、复盘、回测与 Agent 任务 · 数据 as_of {fmtDateTime(data.meta.as_of)}
          </div>
        </div>
      </div>

      {data.meta.status.level === 'stale' ? <StaleBanner meta={data.meta} /> : null}
      {data.meta.status.level === 'partial' ? <PartialBanner meta={data.meta} /> : null}

      <div className="seg" role="tablist" aria-label="任务状态筛选" style={{ marginBottom: 12 }}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            className={`seg-item ${filter === item.id ? 'active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="card">
          <EmptyBlock
            title="暂无任务"
            description="接口返回的 items 为空数组，说明当前没有任务记录，而不是请求失败。"
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyBlock
            title="该分类下暂无任务"
            description="切换上方分类查看其他状态的任务。"
            children={<button className="btn btn-small" onClick={() => setFilter('all')}>查看全部</button>}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>任务</th>
                <th>类型</th>
                <th>状态</th>
                <th>进度</th>
                <th>参数摘要</th>
                <th>提交 / 完成</th>
                <th style={{ textAlign: 'right' }}>产物</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div className="stock-cell">
                      <span className="n num">{task.id}</span>
                      <span className="c">{task.server}</span>
                    </div>
                  </td>
                  <td>{task.type}</td>
                  <td><span className={pillClass(task.status)}>{STATUS_TEXT[task.status]}</span></td>
                  <td>
                    <div className="task-mini">
                      <span className="progress"><i style={{ width: `${task.progress_pct}%` }} /></span>
                      <span className="num">{task.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="muted" title={task.error ?? task.params}>
                    {task.error ? `失败：${task.error}` : task.params}
                  </td>
                  <td className="num muted">
                    {task.submitted}
                    {task.finished ? ` / ${task.finished}` : ''}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {task.artifact ? <span className="small muted">{task.artifact}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-note">任务数据来自 mock；进度为构造值，接真实接口后由后端进度驱动，前端不做插值。</div>
    </>
  );
}
