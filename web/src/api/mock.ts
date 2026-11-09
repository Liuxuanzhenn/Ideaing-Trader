import { ApiError } from './types';
import type { ApiClient } from './client';
import type { DataMeta, DataStatusLevel, Review, ServiceStatus, TaskItem, TaskList } from './types';
import type { DemoState } from '../lib/demo';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 示例数据：全部由 mock 生成，界面上必须同时显示「示例数据」横幅。 */
function meta(level: DataStatusLevel, ageMs: number, failed: string[] = []): DataMeta {
  const at = new Date(Date.now() - ageMs).toISOString();
  return {
    as_of: at,
    updated_at: at,
    snapshot: 'snapshot-mock-0001',
    status: { level, failed_sources: failed },
    coverage: { total: 5412, rate: 99.2 },
  };
}

const INDICES = [
  { code: '000001', name: '上证指数', close: 3321.45, chg_pct: 0.82, amount: 4821 },
  { code: '399001', name: '深证成指', close: 10874.32, chg_pct: 1.16, amount: 5634 },
  { code: '399006', name: '创业板指', close: 2183.77, chg_pct: 1.74, amount: 2874 },
  { code: '000300', name: '沪深 300', close: 3946.08, chg_pct: 0.68, amount: 3102 },
];

const LADDER = [
  { code: '002261', name: '拓维信息', ladder: 6 },
  { code: '000977', name: '浪潮信息', ladder: 4 },
  { code: '603083', name: '剑桥科技', ladder: 3 },
  { code: '002230', name: '科大讯飞', ladder: 2 },
];

const NEWS = [
  { id: 'N-1', title: '算力基础设施项目招标结果公示', source: '示例交易所公告', published: '18:40', status: 'full' as const, kind: 'fact' as const },
  { id: 'N-2', title: '多地发布数据要素行动方案', source: '示例政策库', published: '16:10', status: 'full' as const, kind: 'fact' as const },
  { id: 'N-3', title: '市场传闻某光模块厂商获海外大单', source: '示例财经快讯', published: '14:55', status: 'title' as const, kind: 'inferred' as const },
];

function reviewPayload(state: DemoState): Review {
  if (state === 'empty') {
    return {
      meta: meta('empty', DAY),
      is_trading_day: false,
      indices: [],
      breadth: { up: 0, flat: 0, down: 0, total: 0 },
      limit: { up_cnt: 0, down_cnt: 0, broken_cnt: 0, seal_rate: 0, sample: 0 },
      ladder: [],
      news: [],
    };
  }

  const partial = state === 'partial';
  const stale = state === 'stale';

  return {
    meta: partial
      ? meta('partial', 20 * HOUR, ['limit_reason'])
      : stale
        ? meta('stale', 2 * DAY + 6 * HOUR, [])
        : meta('ok', 20 * HOUR),
    is_trading_day: true,
    indices: INDICES,
    breadth: { up: 3120, flat: 460, down: 1832, total: 5412 },
    limit: {
      up_cnt: 68,
      down_cnt: partial ? null : 7,
      broken_cnt: partial ? null : 21,
      seal_rate: partial ? null : 76.4,
      sample: partial ? 68 : 89,
    },
    ladder: LADDER,
    news: NEWS,
  };
}

const TASKS: TaskItem[] = [
  {
    id: 'T-1046', type: '数据质量检查', status: 'running', progress: 62,
    submitted: '15:33', server: 'worker-2', params: '交易日完整性 / 价格异常 / 复权因子',
    cancelable: false,
  },
  {
    id: 'T-1045', type: '批量筛选', status: 'queued', progress: 0,
    submitted: '15:36', server: 'queue', params: '条件：连板 ≥ 2',
    cancelable: true,
  },
  {
    id: 'T-1044', type: '数据更新', status: 'success', progress: 100,
    submitted: '15:30', finished: '15:32', server: 'worker-1', params: '全A 日线 + 复权因子',
    cancelable: false, artifact: '数据集 snapshot-mock-0001（5,412 只）',
  },
  {
    id: 'T-1043', type: '复盘计算', status: 'success', progress: 100,
    submitted: '15:32', finished: '15:32', server: 'worker-1', params: '交易日 2026-11-06',
    cancelable: false, artifact: '复盘数据 2026-11-06',
  },
  {
    id: 'T-1042', type: '筛选', status: 'success', progress: 100,
    submitted: '15:34', finished: '15:34', server: 'worker-1', params: '连板 ≥ 2 · 全A',
    cancelable: false, artifact: '筛选结果 6 只',
  },
  {
    id: 'T-1041', type: '回测', status: 'success', progress: 100,
    submitted: '14:58', finished: '15:07', server: 'backtest-1', params: '首板回封 v0.1.3 · 观察池 3 只',
    cancelable: false, artifact: 'BT-mock-0141 · 净值 / 回撤 / 交易明细',
  },
  {
    id: 'T-1040', type: '回测', status: 'failed', progress: 47,
    submitted: '14:40', finished: '14:44', server: 'backtest-2', params: '首板回封 v0.1.3 · 全A',
    cancelable: false,
    error: '数据快照缺少 2025-03-14 至 2025-03-18 的停牌记录，成交模拟被中止（退出码 3）。',
  },
  {
    id: 'T-1039', type: 'Agent 研究任务', status: 'success', progress: 100,
    submitted: '14:20', finished: '14:25', server: 'worker-1', params: '统计涨停后次日表现',
    cancelable: false, artifact: '研究结果 1 份（样本 32）',
  },
];

function tasksPayload(state: DemoState): TaskList {
  if (state === 'empty') return { meta: meta('empty', DAY), items: [] };
  const items = state === 'stale'
    ? TASKS.map((task) => ({ ...task }))
    : TASKS;
  return {
    meta:
      state === 'partial'
        ? meta('partial', 20 * HOUR, ['task_log'])
        : state === 'stale'
          ? meta('stale', 2 * DAY + 6 * HOUR)
          : meta('ok', 20 * HOUR),
    items,
  };
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 内存实现：六个状态由同一个开关驱动，便于演示与联调前占位。 */
export function createMockClient(state: DemoState): ApiClient {
  const never = <T,>(): Promise<T> => new Promise<T>(() => {});
  const fail = () => new ApiError('UPSTREAM_UNAVAILABLE', '远端计算服务无响应（示例错误，非真实故障）', 503);

  async function guard<T>(make: () => T): Promise<T> {
    await delay(420);
    if (state === 'error') throw fail();
    return make();
  }

  return {
    getReview: (date) => {
      void date;
      if (state === 'loading') return never<Review>();
      return guard(() => reviewPayload(state));
    },
    getTasks: () => {
      if (state === 'loading') return never<TaskList>();
      return guard(() => tasksPayload(state));
    },
    getServiceStatus: () => {
      if (state === 'loading') return never<ServiceStatus>();
      return guard<ServiceStatus>(() => ({
        connection: state === 'stale' || state === 'error' ? 'offline' : 'online',
        as_of: reviewPayload(state).meta.as_of,
        updated_at: reviewPayload(state).meta.updated_at,
        coverage: { total: 5412, rate: 99.2 },
        level: state === 'partial' ? 'partial' : state === 'stale' ? 'stale' : 'ok',
      }));
    },
  };
}
