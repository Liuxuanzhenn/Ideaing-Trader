/**
 * 客户端表格排序：只处理展示层，不改后端参数、不做分页。
 * 约定：空值（null / undefined / '' / '—'）恒排最后，不参与比较、也不当 0；
 * 数值按数值比、日期按时间比、其余按本地化字符串比。
 * 独立成文件便于 scripts/check-sort.ts 直接 import 断言。
 */

export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir } | null;

/** 空值判定：null/undefined/空串/占位破折号 */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '' || value === '—';
}

function toComparable(value: unknown): { kind: 'number' | 'date' | 'string'; v: number | string } {
  if (typeof value === 'number') return { kind: 'number', v: value };
  const text = String(value).trim();
  // 2026-11-06 / 2026-11-06T12:00:00Z
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const t = Date.parse(text);
    if (!Number.isNaN(t)) return { kind: 'date', v: t };
  }
  return { kind: 'string', v: text };
}

/** 空值恒排最后（升序降序都一样），返回 null 表示「这一对由空值规则决定」 */
export function compareForSort(a: unknown, b: unknown): number | null {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank && bBlank) return null;
  if (aBlank) return 1;
  if (bBlank) return -1;
  const ca = toComparable(a);
  const cb = toComparable(b);
  if (ca.kind === 'number' && cb.kind === 'number') return (ca.v as number) - (cb.v as number);
  if (ca.kind === 'date' && cb.kind === 'date') return (ca.v as number) - (cb.v as number);
  return String(ca.v).localeCompare(String(cb.v), 'zh-Hans-CN');
}

/**
 * 排序：sort=null 时原样返回（保持接口顺序，这是默认态）。
 * 空值始终在末尾，不受 asc/desc 影响。
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState,
  get: (row: T, key: string) => unknown,
): T[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = get(left, sort.key);
    const b = get(right, sort.key);
    const aBlank = isBlank(a);
    const bBlank = isBlank(b);
    if (aBlank || bBlank) {
      if (aBlank && bBlank) return 0;
      return aBlank ? 1 : -1;
    }
    const base = compareForSort(a, b) ?? 0;
    return base * sign;
  });
}

/** 表头点击循环：无排序 → asc → desc → 无排序 */
export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}
