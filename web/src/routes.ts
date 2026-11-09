export const ROUTES = [
  { id: 'review', label: '复盘', mark: '复', group: 'workbench' },
  { id: 'stock', label: '个股', mark: '股', group: 'workbench' },
  { id: 'screener', label: '筛选', mark: '筛', group: 'workbench' },
  { id: 'backtest', label: '回测', mark: '测', group: 'workbench' },
  { id: 'news', label: '资讯', mark: '讯', group: 'workbench' },
  { id: 'tasks', label: '任务', mark: '任', group: 'tool' },
  { id: 'agent', label: 'Agent', mark: 'A', group: 'tool' },
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

/** 阶段 1 只有这两个页面接入了 mock。 */
export const IMPLEMENTED: RouteId[] = ['review', 'tasks'];

/** 便于演示/截图：?route=tasks 直接打开指定页面。 */
export function readRoute(): RouteId {
  const value = new URLSearchParams(window.location.search).get('route');
  return ROUTES.some((route) => route.id === value) ? (value as RouteId) : 'review';
}

export function writeRoute(route: RouteId): void {
  const url = new URL(window.location.href);
  url.searchParams.set('route', route);
  window.history.replaceState(null, '', url);
}
