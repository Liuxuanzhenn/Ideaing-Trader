export const ROUTES = [
  { id: 'review', label: '复盘', group: 'workbench' },
  { id: 'stock', label: '个股', group: 'workbench' },
  { id: 'screener', label: '筛选', group: 'workbench' },
  { id: 'backtest', label: '回测', group: 'workbench' },
  { id: 'news', label: '资讯', group: 'workbench' },
  { id: 'tasks', label: '任务', group: 'tool' },
  { id: 'agent', label: 'Agent', group: 'tool' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export const ROUTE_LABEL: Record<RouteId, string> = {
  review: '复盘',
  stock: '个股',
  screener: '筛选',
  backtest: '回测',
  news: '资讯',
  tasks: '任务',
  agent: 'Agent',
};

export interface Nav {
  route: RouteId;
  /** 个股页/预览标的 */
  code: string | null;
  /** 回测结果对应的任务号 */
  taskId: string | null;
  /** 可选：覆盖复盘交易日（?date=YYYY-MM-DD），用于验收非交易日 */
  date: string | null;
  /** 回测页的两个视图 */
  view: 'config' | 'result';
  /** 个股模块子视图：详情 / 观察池 */
  stockView: 'detail' | 'watchlist';
}

const DEFAULT_NAV: Nav = { route: 'review', code: null, taskId: null, date: null, view: 'config', stockView: 'detail' };

/** 便于演示/截图：?route=stock&code=002261、?route=backtest&view=result&task=T-1041 */
export function readNav(): Nav {
  const params = new URLSearchParams(window.location.search);
  const routeParam = params.get('route');
  const route = ROUTES.some((item) => item.id === routeParam) ? (routeParam as RouteId) : DEFAULT_NAV.route;
  return {
    route,
    code: params.get('code'),
    taskId: params.get('task'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : null,
    view: params.get('view') === 'result' ? 'result' : 'config',
    stockView: params.get('sv') === 'watchlist' ? 'watchlist' : 'detail',
  };
}

export function writeNav(nav: Nav): void {
  const url = new URL(window.location.href);
  url.searchParams.set('route', nav.route);
  const setOrDelete = (key: string, value: string | null) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  setOrDelete('code', nav.code);
  setOrDelete('task', nav.taskId);
  setOrDelete('date', nav.date);
  setOrDelete('view', nav.view === 'result' ? 'result' : null);
  setOrDelete('sv', nav.stockView === 'watchlist' ? 'watchlist' : null);
  window.history.replaceState(null, '', url);
}
