/** 六个可演示状态。只允许通过 URL 参数 ?state= 或开发条切换。 */
export const DEMO_STATES = ['ok', 'loading', 'empty', 'stale', 'partial', 'error'] as const;

export type DemoState = (typeof DEMO_STATES)[number];

export const DEMO_LABELS: Record<DemoState, string> = {
  ok: '正常',
  loading: '加载中',
  empty: '空数据',
  stale: '已过期',
  partial: '部分缺失',
  error: '接口错误',
};

export function readDemoState(): DemoState {
  const value = new URLSearchParams(window.location.search).get('state');
  return (DEMO_STATES as readonly string[]).includes(value ?? '') ? (value as DemoState) : 'ok';
}

export function writeDemoState(state: DemoState): void {
  const url = new URL(window.location.href);
  url.searchParams.set('state', state);
  window.history.replaceState(null, '', url);
}
