import { useCallback, useEffect, useMemo, useState } from 'react';
import { createMockClient } from './api/mock';
import type { ApiClient } from './api/client';
import { BottomBar } from './components/BottomBar';
import { ContextPanel } from './components/ContextPanel';
import { DevBar, Ribbon } from './components/Chrome';
import { Rail } from './components/Rail';
import { Topbar } from './components/Topbar';
import { EmptyBlock } from './components/States';
import { ReviewPage } from './pages/ReviewPage';
import { TasksPage } from './pages/TasksPage';
import { ROUTE_LABEL, readRoute, writeRoute, type RouteId } from './routes';
import { readDemoState, writeDemoState, type DemoState } from './lib/demo';
import { useAsync } from './lib/useAsync';

function todayParam(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function App() {
  const [demo, setDemo] = useState<DemoState>(readDemoState);
  const [route, setRoute] = useState<RouteId>(readRoute);
  const [ctxOpen, setCtxOpen] = useState(false);

  // 阶段 1 只有 mock；createHttpClient() 是同一接口的真实实现
  const client: ApiClient = useMemo(() => createMockClient(demo), [demo]);

  const loadStatus = useCallback(() => client.getServiceStatus(), [client]);
  const loadTasks = useCallback(() => client.getTasks({ limit: 20 }), [client]);
  const status = useAsync(loadStatus);
  const tasks = useAsync(loadTasks);

  useEffect(() => {
    setCtxOpen(route === 'tasks');
  }, [route]);

  const runningCount = (tasks.data?.items ?? []).filter(
    (task) => task.status === 'running' || task.status === 'queued',
  ).length;

  function changeRoute(next: RouteId) {
    writeRoute(next);
    setRoute(next);
  }

  function changeDemo(next: DemoState) {
    writeDemoState(next);
    setDemo(next);
  }

  return (
    <>
      <Ribbon />
      <Topbar status={status} ctxOpen={ctxOpen} onToggleContext={() => setCtxOpen((open) => !open)} />
      <DevBar state={demo} onChange={changeDemo} />

      <div className={`shell ${ctxOpen ? '' : 'ctx-collapsed'}`}>
        <Rail active={route} onChange={changeRoute} runningCount={runningCount} />

        <main className="main">
          {route === 'review' ? <ReviewPage client={client} date={todayParam()} /> : null}
          {route === 'tasks' ? <TasksPage client={client} /> : null}
          {route !== 'review' && route !== 'tasks' ? (
            <div className="card">
              <EmptyBlock
                title={`${ROUTE_LABEL[route]} 页面尚未实现`}
                description="阶段 1 只交付复盘与任务中心两页。左栏其余入口保留，用于确认信息架构与布局，未接任何数据。"
                children={
                  <button className="btn btn-small" onClick={() => changeRoute('review')}>返回复盘</button>
                }
              />
            </div>
          ) : null}
        </main>

        <ContextPanel status={status} />
      </div>

      <BottomBar tasks={tasks} />
    </>
  );
}
