export const fmt = (value: number, digits = 2) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;

export const toneOf = (value: number) => (value > 0 ? 'up' : value < 0 ? 'down' : 'flat');

/** 「3 天 4 小时前」这类描述，用于 stale 状态。 */
export function humanGap(iso: string, now = Date.now()): string {
  const gap = now - new Date(iso).getTime();
  if (Number.isNaN(gap)) return '未知';
  if (gap < 60_000) return '刚刚';
  const minutes = Math.floor(gap / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} 天 ${restHours} 小时前` : `${days} 天前`;
}

export function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 基础单位「元」→ 展示层亿/万，单位换算只发生在这一层。 */
export function yuan(value: number): string {
  // 用绝对值判断量级：否则负数（如龙虎榜净额 -2.27 亿）会掉进「元」分支显示成一串数字
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)} 万`;
  return `${value.toFixed(0)} 元`;
}

/** 股数缩写（成交量为股）。 */
export function shares(value: number): string {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿股`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万股`;
  return `${value} 股`;
}

/**
 * 回测默认区间：后端按交易日切片，`from === to` 只有 1 个 session 会被 422 拒绝
 * （"need at least 2"），所以默认回看 30 个日历日，保证至少两个交易日。
 * latest 为空或非法时返回空串，交给调用方处理。
 */
export function defaultBacktestRange(latest: string): { from: string; to: string } {
  if (!latest) return { from: '', to: '' };
  const end = new Date(`${latest}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return { from: '', to: '' };
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: latest };
}

/**
 * 行业文案：按后端给的可用性状态显示，不把「没有记录」说成「没有异动」。
 * status 为 null 表示后端还没提供该字段（旧 API）——有 industry 就照用，没有就说未接入。
 */
export function industryLabel(
  industry: string | null,
  status: import('../api/types').IndustryStatus | null,
): string {
  if (status === 'ok') return industry ?? '来源无行业记录';
  if (status === 'empty_for_delisted') return '已退市/无行业分类';
  if (status === 'missing' || status === 'missing_basic') return '来源无行业记录';
  return industry ?? '行业数据未接入';
}

/**
 * 概念文案：null = 数据源未接入，必须说出来；[] = 已查询且确实无概念，不显示任何东西。
 * 不允许把 null 渲染成空串或「暂无概念」。
 */
export function conceptsText(concepts: string[] | null): string | null {
  if (concepts === null) return '概念数据未接入';
  if (concepts.length === 0) return null;
  return concepts.slice(0, 3).join(' · ');
}
