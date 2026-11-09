import type { RouteId } from '../routes';
import { ROUTES } from '../routes';

interface Props {
  active: RouteId;
  onChange: (next: RouteId) => void;
  runningCount: number;
}

export function Rail({ active, onChange, runningCount }: Props) {
  return (
    <nav className="rail" aria-label="主导航">
      <div className="rail-scroll">
        <div className="rail-group">
          <span className="rail-label">工作台</span>
          {ROUTES.filter((route) => route.group === 'workbench').map((route) => (
            <button
              key={route.id}
              type="button"
              className={`nav-item ${active === route.id ? 'active' : ''}`}
              aria-current={active === route.id ? 'page' : undefined}
              onClick={() => onChange(route.id)}
            >
              <span className="nav-mark" aria-hidden="true">{route.mark}</span>
              <span>{route.label}</span>
            </button>
          ))}
        </div>

        <div className="rail-group">
          <span className="rail-label">工具</span>
          {ROUTES.filter((route) => route.group === 'tool').map((route) => (
            <button
              key={route.id}
              type="button"
              className={`nav-item ${active === route.id ? 'active' : ''}`}
              aria-current={active === route.id ? 'page' : undefined}
              onClick={() => onChange(route.id)}
            >
              <span className="nav-mark" aria-hidden="true">{route.mark}</span>
              <span>{route.label}</span>
              {route.id === 'tasks' && runningCount > 0 ? <span className="nav-badge">{runningCount}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="rail-footer">
        <span className="dot dot-ok" />
        <span>开发态 · mock 数据</span>
      </div>
    </nav>
  );
}
