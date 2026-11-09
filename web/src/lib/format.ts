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
