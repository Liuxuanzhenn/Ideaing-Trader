import { useCallback, useEffect, useState } from 'react';
import { nextSort, sortRows, type SortState } from '../lib/sort';

/** 表格排序状态；点击表头按钮在 无排序 → 升 → 降 之间循环。 */
export function useSort(defaultKey: string | null = null) {
  const [sort, setSort] = useState<SortState>(defaultKey ? { key: defaultKey, dir: 'asc' } : null);
  const toggle = (key: string) => setSort((current) => nextSort(current, key));
  return { sort, toggle };
}

/**
 * 给 .table-wrap 加 is-scrolled：只在真正滚动后出现表头阴影，
 * 静止时不出现（不用常驻 border 冒充滚动状态）。
 */
export function useScrollShadow<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  // callback ref：表格是数据到位后才渲染的，useEffect([]) 在首帧拿不到节点
  const ref = useCallback((next: T | null) => setNode(next), []);
  useEffect(() => {
    if (!node) return undefined;
    // 滚动发生在 .main 上（表格自身不是滚动容器），用「表头是否已贴到 .main 顶部」判断阴影
    const scroller = node.closest('.main');
    if (!scroller) return undefined;
    const sync = () => {
      const mainTop = scroller.getBoundingClientRect().top;
      const wrapTop = node.getBoundingClientRect().top;
      node.classList.toggle('is-scrolled', wrapTop <= mainTop + 1 && scroller.scrollTop > 0);
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      scroller.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [node]);
  return ref;
}

/** 表头单元格：整格是一个按钮，点击排序，aria-sort 挂在 th 上。 */
export function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  numeric?: boolean;
}) {
  const active = sort?.key === sortKey;
  const ariaSort = !active ? 'none' : sort!.dir === 'asc' ? 'ascending' : 'descending';
  return (
    <th className={numeric ? 'num' : undefined} aria-sort={ariaSort}>
      <button type="button" className={`th-sort ${active ? 'active' : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true" className="th-caret">
          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export { sortRows };
