import type { AsyncState } from '../lib/useAsync';
import type { TaskList } from '../api/types';

interface Props {
  tasks: AsyncState<TaskList>;
}

export function BottomBar({ tasks }: Props) {
  const active = (tasks.data?.items ?? []).filter((item) => item.status === 'running' || item.status === 'queued');

  return (
    <footer className="bottombar">
      {tasks.phase === 'loading' ? (
        <span className="muted">任务状态读取中…</span>
      ) : tasks.phase === 'error' ? (
        <span className="muted">任务状态不可用（{tasks.error?.code}）</span>
      ) : active.length === 0 ? (
        <span className="muted">无运行中任务</span>
      ) : (
        active.slice(0, 2).map((task) => (
          <span className="task-mini" key={task.id}>
            <span className={`pill ${task.status === 'running' ? 'pill-running' : ''}`}>
              {task.status === 'running' ? '运行中' : '排队'}
            </span>
            <span className="num">{task.id}</span>
            <span>{task.type}</span>
            <span className="progress"><i style={{ width: `${task.progress}%` }} /></span>
            <span className="num">{task.progress}%</span>
          </span>
        ))
      )}
      <span className="spacer" />
      <span className="muted">示例数据 · 开发态</span>
    </footer>
  );
}
