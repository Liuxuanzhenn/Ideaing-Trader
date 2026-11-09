import type { RouteId } from '../routes';

const PATHS: Record<RouteId, React.ReactNode> = {
  review: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
  stock: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="M7 15l4-4 3 3 4-6" />
    </>
  ),
  screener: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  backtest: <path d="M8 5.5l10 6.5-10 6.5z" />,
  news: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  tasks: (
    <>
      <path d="M4 6l1.6 1.6L8 5M4 12l1.6 1.6L8 11M4 18l1.6 1.6L8 17" />
      <path d="M11 6h9M11 12h9M11 18h9" />
    </>
  ),
  agent: <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9z" />,
};

/** 左栏图标：统一 16px 描边，不使用首字占位。 */
export function RouteIcon({ name }: { name: RouteId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
