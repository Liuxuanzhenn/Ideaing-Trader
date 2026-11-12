import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { BoardList, BoardRow, BoardType } from '../api/types';
import { ApiError } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { pct, toneOf } from '../lib/format';
import { EmptyBlock, ErrorBlock, SkeletonRows } from './States';
import { SortTh, sortRows, useSort } from './TableSort';

const TABS: { id: BoardType; label: string }[] = [
  { id: 'industry', label: '行业' },
  { id: 'concept', label: '概念' },
  { id: 'region', label: '地域' },
  { id: 'style', label: '风格' },
];

/** 板块卡：一次请求取全部类型，切 tab 只做前端过滤，不重复请求 */
export function BoardsCard({ client, date }: { client: ApiClient; date: string }) {
  const load = useCallback(() => client.getBoards(date), [client, date]);
  const boards = useAsync(load);
  const [tab, setTab] = useState<BoardType>('industry');
  // 默认按等权涨跌降序；缺失值恒排最后由 sortRows 保证
  const { sort, toggle } = useSort('pct_chg_ew');

  const level = boards.data?.meta.level ?? 'ok';

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
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <CardStateLine level={level} meta={boards.data?.meta ?? null} />

      {boards.phase === 'loading' ? <SkeletonRows rows={6} /> : null}
      {boards.phase === 'error' ? (
        <ErrorBlock error={boards.error} onRetry={boards.retry} />
      ) : null}
      {boards.data ? <BoardsTable data={boards.data} tab={tab} sort={sort} onSort={toggle} /> : null}
    </div>
  );
}

function BoardsTable({
  data,
  tab,
  sort,
  onSort,
}: {
  data: BoardList;
  tab: BoardType;
  sort: ReturnType<typeof useSort>['sort'];
  onSort: (key: string) => void;
}) {
  const rows = sortRows(
    data.rows.filter((row) => row.type === tab),
    sort,
    (row: BoardRow, key) => {
      switch (key) {
        case 'name': return row.name;
        case 'pct_chg_ew': return row.pct_chg_ew;
        case 'counts': return row.up_count;
        case 'leader_name': return row.leader_name;
        case 'valid_count': return row.valid_count;
        default: return null;
      }
    },
  );

  if (data.status === 'empty' || data.rows.length === 0) {
    return <EmptyBlock title="当日无板块数据" description="后端返回 status=empty：该交易日没有板块聚合结果。" />;
  }
  if (rows.length === 0) {
    return <EmptyBlock title="该类型当日无数据" description={`后端没有返回 ${TABS.find((t) => t.id === tab)?.label} 类板块。`} />;
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

/** stale / partial 用一行文字说明，不占整块横幅 */
function CardStateLine({
  level,
  meta,
}: {
  level: 'ok' | 'empty' | 'partial' | 'stale' | 'error';
  meta: { as_of: string; updated_at: string | null } | null;
}) {
  if (level === 'stale') {
    return <div className="card-sub" style={{ marginBottom: 8 }}>缓存数据 · 已过期（{meta?.as_of ?? '—'}），不能视为当日行情</div>;
  }
  if (level === 'partial') {
    return <div className="card-sub" style={{ marginBottom: 8 }}>部分缺失：部分板块没有有效成员或领涨股</div>;
  }
  return null;
}

export function isNotWired(error?: ApiError): boolean {
  return error?.code === 'NOT_IMPLEMENTED';
}

export { useEffect };
