import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import type { DragonTigerList, DragonTigerRow } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { fmt, pct, toneOf, yuan } from '../lib/format';
import { EmptyBlock, ErrorBlock, SkeletonRows } from './States';
import { SortTh, sortRows, useSort } from './TableSort';

/** 龙虎榜卡：excluded_bj 直接来自后端 meta，前端不自己数 */
export function DragonTigerCard({ client, date }: { client: ApiClient; date: string }) {
  const load = useCallback(() => client.getDragonTiger(date), [client, date]);
  const list = useAsync(load);
  const { sort, toggle } = useSort();
  const level = list.data?.meta.level ?? 'ok';

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">龙虎榜</span>
        <span className="card-sub">
          {list.data ? `${list.data.rows.length} 条 · ${list.data.meta.as_of}` : ''}
        </span>
      </div>

      {level === 'stale' ? (
        <div className="card-sub" style={{ marginBottom: 8 }}>缓存数据 · 已过期，不能视为当日行情</div>
      ) : null}
      {level === 'partial' ? (
        <div className="card-sub" style={{ marginBottom: 8 }}>部分缺失：个别条目缺代码或名称</div>
      ) : null}

      {list.phase === 'loading' ? <SkeletonRows rows={5} /> : null}
      {list.phase === 'error' ? <ErrorBlock error={list.error} onRetry={list.retry} /> : null}
      {list.data ? <DragonTigerTable data={list.data} sort={sort} onSort={toggle} /> : null}
    </div>
  );
}

function DragonTigerTable({
  data,
  sort,
  onSort,
}: {
  data: DragonTigerList;
  sort: ReturnType<typeof useSort>['sort'];
  onSort: (key: string) => void;
}) {
  const rows = sortRows(data.rows, sort, (row: DragonTigerRow, key) => {
    switch (key) {
      case 'secucode': return row.secucode;
      case 'name': return row.name;
      case 'close': return row.close;
      case 'chg_pct': return row.chg_pct;
      case 'billboard_amt': return row.billboard_amt;
      case 'net_amt': return row.net_amt;
      case 'deal_amt_ratio': return row.deal_amt_ratio;
      case 'reason_text': return row.reason_text;
      default: return null;
    }
  });

  if (data.status === 'empty' || data.rows.length === 0) {
    return <EmptyBlock title="当日无龙虎榜数据" description="后端返回 status=empty：该交易日没有龙虎榜记录。" />;
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <SortTh label="代码" sortKey="secucode" sort={sort} onSort={onSort} />
              <SortTh label="名称" sortKey="name" sort={sort} onSort={onSort} />
              <SortTh label="收盘" sortKey="close" sort={sort} onSort={onSort} numeric />
              <SortTh label="涨跌" sortKey="chg_pct" sort={sort} onSort={onSort} numeric />
              <SortTh label="上榜金额" sortKey="billboard_amt" sort={sort} onSort={onSort} numeric />
              <SortTh label="净额" sortKey="net_amt" sort={sort} onSort={onSort} numeric />
              <SortTh label="占比" sortKey="deal_amt_ratio" sort={sort} onSort={onSort} numeric />
              <SortTh label="原因" sortKey="reason_text" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.trade_id}>
                <td className="num">{row.secucode}</td>
                <td>{row.name ?? <span className="muted">—</span>}</td>
                <td className="num">{row.close === null ? '—' : fmt(row.close)}</td>
                <td className={`num ${row.chg_pct === null ? 'flat' : toneOf(row.chg_pct)}`}>
                  {row.chg_pct === null ? '—' : pct(row.chg_pct)}
                </td>
                <td className="num">{row.billboard_amt === null ? '—' : yuan(row.billboard_amt)}</td>
                <td className={`num ${row.net_amt === null ? 'flat' : toneOf(row.net_amt)}`}>
                  {row.net_amt === null ? '—' : yuan(row.net_amt)}
                </td>
                <td className="num muted">{row.deal_amt_ratio === null ? '—' : `${row.deal_amt_ratio}%`}</td>
                <td className="muted">{row.reason_text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.excluded_bj > 0 ? (
        <div className="card-sub" style={{ marginTop: 8 }}>已排除北交所 {data.excluded_bj} 条</div>
      ) : null}
    </>
  );
}
