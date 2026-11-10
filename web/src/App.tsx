import { useCallback, useEffect, useMemo, useState } from 'react';
import { createMockClient } from './api/mock';
import {
  fetchLiveReview,
  fetchLiveScreenOptions,
  fetchLiveStatus,
  fetchLiveStock,
  runLiveScreen,
  submitLiveBacktest,
  fetchLiveBacktestOptions,
  fetchLiveBacktestResult,
  toPageReview,
  type LiveReview,
} from './api/live';
import type { ApiClient } from './api/client';
import type { Portfolio } from './api/types';
import { BottomBar } from './components/BottomBar';
import { ContextPanel } from './components/ContextPanel';
import { DevBar, Ribbon } from './components/Chrome';
import { Rail } from './components/Rail';
import { Topbar } from './components/Topbar';
import { ReviewPage } from './pages/ReviewPage';
import { TasksPage } from './pages/TasksPage';
import { StockPage } from './pages/StockPage';
import { ScreenerPage } from './pages/ScreenerPage';
import { BacktestConfigPage } from './pages/BacktestConfigPage';
import { BacktestResultPage } from './pages/BacktestResultPage';
import { NewsPage } from './pages/NewsPage';
import { AgentPage } from './pages/AgentPage';
import { readNav, writeNav, type Nav, type RouteId } from './routes';
import { readDemoState, writeDemoState, type DemoState } from './lib/demo';
import { useAsync } from './lib/useAsync';
import { fmtDate } from './lib/format';

/** 兜底：数据状态接口不可用时才用自然日，且必须在页面上显式提示。 */
function naturalDay(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const EMPTY_PORTFOLIO: Portfolio = { watchlist: [], basket: [] };

export default function App() {
  const [demo, setDemo] = useState<DemoState>(readDemoState);
  const [nav, setNav] = useState<Nav>(readNav);
  const [selectedCode, setSelectedCode] = useState<string | null>(() => readNav().code);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);

  // 阶段 1 只有 mock；createHttpClient() 是同一接口的真实实现
  // Live data serves the normal state; the state switcher still drives mock so every
  // loading/empty/stale/partial/error branch stays demonstrable.
  const client: ApiClient = useMemo(() => {
    const mock = createMockClient(demo);
    if (demo !== 'ok') return mock;
    return {
      ...mock,
      getServiceStatus: fetchLiveStatus,
      getStock: fetchLiveStock,
      getScreenOptions: fetchLiveScreenOptions,
      runScreen: runLiveScreen,
      getBacktestOptions: fetchLiveBacktestOptions,
      submitBacktest: submitLiveBacktest,
      getBacktestResult: fetchLiveBacktestResult,
      getReview: async (date: string) => {
        const live: LiveReview = await fetchLiveReview(date);
        return toPageReview(live);
      },
    };
  }, [demo]);

  const loadStatus = useCallback(() => client.getServiceStatus(), [client]);
  const loadTasks = useCallback(() => client.getTasks({ limit: 20 }), [client]);
  const loadPortfolio = useCallback(() => client.getPortfolio(), [client]);
  const status = useAsync(loadStatus);
  const tasks = useAsync(loadTasks);
  const portfolioState = useAsync(loadPortfolio);

  useEffect(() => {
    if (portfolioState.data) setPortfolio(portfolioState.data);
  }, [portfolioState.data]);

  // 任务进度由后端推进，前端只做轮询
  const hasActiveTask = (tasks.data?.items ?? []).some(
    (task) => task.status === 'running' || task.status === 'queued',
  );
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => tasks.retry(), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, tasks.retry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCtxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const open = Boolean(selectedCode) || Boolean(selectedTaskId) || nav.route === 'tasks' || nav.route === 'agent' || nav.route === 'backtest';
    setCtxOpen(open);
  }, [nav.route, selectedCode, selectedTaskId]);

  const go = (route: RouteId, patch: Partial<Nav> = {}) => {
    const next: Nav = { route, code: null, taskId: null, view: 'config', stockView: 'detail', ...patch };
    writeNav(next);
    setNav(next);
    if (next.code) setSelectedCode(next.code);
    if (next.route !== 'tasks') setSelectedTaskId(null);
  };

  const openStock = (code: string) => go('stock', { code });

  const addWatch = async (code: string) => {
    const next = await client.addWatchlist(code);
    setPortfolio(next);
  };
  const addBasket = async (code: string) => {
    const next = await client.addBasket(code);
    setPortfolio(next);
  };
  const removeWatch = async (code: string) => {
    const next = await client.removeWatchlist(code);
    setPortfolio(next);
  };

  const changeDemo = (next: DemoState) => {
    writeDemoState(next);
    setDemo(next);
  };

  const tradeDate = status.phase === 'ok' && status.data ? fmtDate(status.data.as_of) : null;
  const reviewDate = tradeDate ?? (status.phase === 'error' ? naturalDay() : null);
  const dateFallback = status.phase === 'error';

  const runningCount = (tasks.data?.items ?? []).filter(
    (task) => task.status === 'running' || task.status === 'queued',
  ).length;

  return (
    <>
      <Ribbon />
      <Topbar status={status} ctxOpen={ctxOpen} onToggleContext={() => setCtxOpen((open) => !open)} />
      <DevBar state={demo} onChange={changeDemo} />

      <div className={`shell ${ctxOpen ? '' : 'ctx-collapsed'}`}>
        <Rail
          active={nav.route}
          onChange={(route) => go(route)}
          runningCount={runningCount}
        />

        <main className="main">
          {nav.route === 'review' ? (
            <ReviewPage
              client={client}
              date={reviewDate}
              dateFallback={dateFallback}
              selectedCode={selectedCode}
              onSelectStock={setSelectedCode}
              onOpenStock={openStock}
            />
          ) : null}

          {nav.route === 'stock' ? (
            <StockPage
              client={client}
              code={nav.code}
              portfolio={portfolio}
              view={nav.stockView}
              onChangeView={(stockView) => go('stock', { code: nav.code, stockView })}
              onOpenStock={openStock}
              onAddWatch={addWatch}
              onAddBasket={addBasket}
              onRemoveWatch={removeWatch}
            />
          ) : null}

          {nav.route === 'screener' ? (
            <ScreenerPage
              client={client}
              portfolio={portfolio}
              onAddWatch={addWatch}
              onAddBasket={addBasket}
              onOpenStock={openStock}
            />
          ) : null}

          {nav.route === 'backtest' && nav.view === 'config' ? (
            <BacktestConfigPage client={client} onSubmitted={() => go('tasks')} />
          ) : null}

          {nav.route === 'backtest' && nav.view === 'result' ? (
            <BacktestResultPage
              client={client}
              taskId={nav.taskId}
              onGoTasks={() => go('tasks')}
            />
          ) : null}

          {nav.route === 'news' ? <NewsPage client={client} onOpenStock={openStock} /> : null}

          {nav.route === 'tasks' ? (
            <TasksPage
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={(taskId) => setSelectedTaskId(taskId)}
              onOpenResult={(taskId) => go('backtest', { view: 'result', taskId })}
            />
          ) : null}

          {nav.route === 'agent' ? <AgentPage client={client} onGoTasks={() => go('tasks')} /> : null}
        </main>

        <ContextPanel
          status={status}
          client={client}
          selectedCode={selectedTaskId ? null : selectedCode}
          selectedTask={
            nav.route === 'tasks' && selectedTaskId
              ? (tasks.data?.items.find((task) => task.id === selectedTaskId) ?? null)
              : null
          }
          onOpenStock={openStock}
          onAddWatch={addWatch}
          isWatched={selectedCode ? portfolio.watchlist.includes(selectedCode) : false}
          onOpenResult={(taskId) => go('backtest', { view: 'result', taskId })}
          onOpenNews={() => go('news')}
        />
      </div>

      <BottomBar tasks={tasks} />
    </>
  );
}
