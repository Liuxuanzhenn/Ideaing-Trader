import { DEMO_LABELS, DEMO_STATES } from '../lib/demo';
import type { DemoState } from '../lib/demo';

export function Ribbon({ real }: { real: boolean }) {
  if (real) {
    return (
      <div className="ribbon" role="note">
        <strong>真实接口数据 · 开发环境</strong>
        行情、复盘、筛选、回测来自后端快照；资讯、任务、Agent 尚未接入
      </div>
    );
  }
  return (
    <div className="ribbon" role="note">
      <strong>示例数据 · 开发态</strong>
      本页面所有行情、指标与任务均来自 mock，非真实数据，不构成产品承诺
    </div>
  );
}

export function DevBar({ state, onChange }: { state: DemoState; onChange: (next: DemoState) => void }) {
  return (
    <div className="devbar">
      <span className="devbar-label">状态演示</span>
      <div className="seg" role="group" aria-label="切换演示状态">
        {DEMO_STATES.map((item) => (
          <button
            key={item}
            type="button"
            className={`seg-item ${state === item ? 'active' : ''}`}
            aria-pressed={state === item}
            tabIndex={-1}
            onClick={() => onChange(item)}
          >
            {DEMO_LABELS[item]}
          </button>
        ))}
      </div>
      <span className="muted">也可用 URL 参数 ?state=（ok/loading/empty/stale/partial/error）</span>
      <span className="muted" style={{ marginLeft: 'auto' }}>mock 数据，接入真实 API 后本栏移除</span>
    </div>
  );
}
