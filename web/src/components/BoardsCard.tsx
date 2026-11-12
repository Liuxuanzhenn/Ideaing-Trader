import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { BoardList, BoardRow, BoardType } from '../api/types';
import { ApiError } from '../api/types';
import { pct, toneOf } from '../lib/format';
import { EmptyBlock, ErrorBlock, SkeletonRows } from './States';
import { SortTh, sortRows, useSort } from './TableSort';

const TABS: { id: BoardType; label: string }[] = [
  { id: 'industry', label: '行业' },
  { id: 'concept', label: '概念' },
  { id: 'region', label: '地域' },
  { id: 'style', label: '风格' },
];

type Entry =
  | { phase: 'loading' }
  | { phase: 'error'; error: ApiError; retry: () => void }
  | { phase: 'ok'; data: BoardList };

/**
 * 板块卡：**按 tab 懒加载**。
 * 全量响应 240 KB、链路 4–6 KB/s，一次取四类会把首屏压到 40 秒以上，
 * 所以首次只取当前 tab，切 tab 再取，并缓存 date+type 结果；换日期清空缓存。
 */
export function BoardsCard({ client, date }: { client: ApiClient; date: string }) {
  const [tab, setTab] = useState<BoardType>('industry');
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const cache = useRef<Record<string, Entry>>({});
  const { sort, toggle } = useSort('pct_chg_ew');

  const keyOf = (type: BoardType) => `${date}|${type}`;

  const load = useCallback(
    (type: BoardType) => {
      const key = `${date}|${type}`;
      const cached = cache.current[key];
      if (cached && cached.phase === 'ok') {
        setEntries((prev) => ({ ...prev, [key]: cached }));
        return;
      }
      setEntries((prev) => ({ ...prev, [key]: { phase: 'loading' } }));
      client
        .getBoards(date, type)
        .then((data) => {
          cache.current[key] = { phase: 'ok', data };
          setEntries((prev) => ({ ...prev, [key]: { phase: 'ok', data } }));
        })
        .catch((err: unknown) => {
          const entry: Entry = {
            phase: 'error',
            error:
              err instanceof ApiError
                ? err
                : new ApiError('UNKNOWN', err instanceof Error ? err.message : '板块数据读取失败'),
            retry: () => {
              delete cache.current[key];
              load(type);
            },
          };
          setEntries((prev) => ({ ...prev, [key]: entry }));
        });
    },
    [client, date],
  );

  // 换日期：清空缓存并重新取当前 tab
  useEffect(() => {
    cache.current = {};
    setEntries({});
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const selectTab = (next: BoardType) => {
    setTab(next);
    const key = keyOf(next);
    if (!entries[key]) load(next);
  };

  const entry = entries[keyOf(tab)];

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">板块</span>
        <div className="seg" role="tablist" aria-label="板块类型">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={`seg-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {entry?.phase === 'ok' ? <StateLine level={entry.data.meta.level} asOf={entry.data.meta.as_of} /> : null}
      {!entry || entry.phase === 'loading' ? <SkeletonRows rows={6} /> : null}
      {entry?.phase === 'error' ? (
        <ErrorBlock error={entry.error} onRetry={entry.retry} />
      ) : null}
      {entry?.phase === 'ok' ? <BoardsTable data={entry.data} sort={sort} onSort={toggle} /> : null}
    </div>
  );
}

function BoardsTable({
  data,
  sort,
  onSort,
}: {
  data: BoardList;
  sort: ReturnType<typeof useSort>['sort'];
  onSort: (key: string) => void;
}) {
  const rows = sortRows(data.rows, sort, (row: BoardRow, key) => {
    switch (key) {
      case 'name': return row.name;
      case 'pct_chg_ew': return row.pct_chg_ew;
      case 'counts': return row.up_count;
      case 'leader_name': return row.leader_name;
      case 'valid_count': return row.valid_count;
      default: return null;
    }
  });

  if (data.status === 'empty' || data.rows.length === 0) {
    return <EmptyBlock title="该分类当日无数据" description="后端返回 status=empty：该交易日这一类没有板块聚合结果。" />;
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <SortTh label="板块" sortKey="name" sort={sort} onSort={onSort} />
            <SortTh label="等权涨跌" sortKey="pct_chg_ew" sort={sort} onSort={onSort} numeric />
            <SortTh label="涨 / 跌" sortKey="counts" sort={sort} onSort={onSort} numeric />
            <SortTh label="领涨股" sortKey="leader_name" sort={sort} onSort={onSort} />
            <SortTh label="成员 / 有效" sortKey="valid_count" sort={sort} onSort={onSort} numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.type}-${row.code}`}>
              <td>{row.name}</td>
              <td className={`num ${row.pct_chg_ew === null ? 'flat' : toneOf(row.pct_chg_ew)}`}>
                {row.pct_chg_ew === null ? '—' : pct(row.pct_chg_ew)}
              </td>
              <td className="num">
                <span className="up">{row.up_count}</span>
                {' / '}
                <span className="down">{row.down_count}</span>
              </td>
              <td>{row.leader_name ?? <span className="muted">—</span>}</td>
              <td className="num muted">{row.member_count} / {row.valid_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateLine({ level, asOf }: { level: BoardList['meta']['level']; asOf: string }) {
  if (level === 'stale') {
    return <div className="card-sub" style={{ marginBottom: 8 }}>缓存数据 · 已过期（{asOf}），不能视为当日行情</div>;
  }
  if (level === 'partial') {
    return <div className="card-sub" style={{ marginBottom: 8 }}>部分缺失：部分板块没有有效成员或领涨股</div>;
  }
  return null;
}
