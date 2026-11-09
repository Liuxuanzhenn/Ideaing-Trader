import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, ReviewSkeleton, StaleBanner, StatusChip } from '../components/States';
import { fmt, fmtDate, fmtDateTime, pct, toneOf } from '../lib/format';

interface Props {
  client: ApiClient;
  /** 请求参数，不是展示值；展示一律取响应里的 as_of/updated_at */
  date: string;
}

export function ReviewPage({ client, date }: Props) {
  const load = useCallback(() => client.getReview(date), [client, date]);
  const review = useAsync(load);

  if (review.phase === 'loading') {
    return (
      <>
        <div className="view-head">
          <div>
            <h2 className="view-title">盘后复盘</h2>
            <div className="view-sub">正在读取数据…</div>
          </div>
        </div>
        <ReviewSkeleton />
      </>
    );
  }

  if (review.phase === 'error') {
    return (
      <>
        <div className="view-head">
          <div>
            <h2 className="view-title">盘后复盘</h2>
            <div className="view-sub">数据请求失败</div>
          </div>
        </div>
        <ErrorBlock error={review.error} onRetry={review.retry} />
      </>
    );
  }

  const data = review.data!;
  const { meta, breadth, limit } = data;
  const upW = breadth.total ? (breadth.up / breadth.total) * 100 : 0;
  const flatW = breadth.total ? (breadth.flat / breadth.total) * 100 : 0;
  const downW = breadth.total ? (breadth.down / breadth.total) * 100 : 0;
  const missing = (value: number | null, suffix = '') =>
    value === null ? '—' : `${fmt(value, 0)}${suffix}`;

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            盘后复盘 · {fmtDate(meta.as_of)}
            <StatusChip level={meta.status.level} />
          </h2>
          <div className="view-sub">
            更新 {fmtDateTime(meta.updated_at)} · 覆盖率 {meta.coverage.rate}% · 快照 {meta.snapshot}
          </div>
        </div>
      </div>

      {meta.status.level === 'stale' ? <StaleBanner meta={meta} /> : null}
      {meta.status.level === 'partial' ? <PartialBanner meta={meta} /> : null}

      {!data.is_trading_day ? (
        <div className="card section">
          <EmptyBlock
            title="当日没有复盘数据"
            description="该日期不是交易日，或数据尚未产出。数据是否为空由接口的 is_trading_day 与 status.level 决定，不靠前端猜测。"
            children={<button className="btn" onClick={review.retry}>重新加载</button>}
          />
        </div>
      ) : (
        <>
          <div className="index-strip section">
            {data.indices.map((index) => (
              <div className="index-item" key={index.code}>
                <div className="index-name">
                  <span>{index.name}</span>
                  <span className="num">{index.code}</span>
                </div>
                <div className="index-value">{fmt(index.close)}</div>
                <div className={`index-chg ${toneOf(index.chg_pct)}`}>{pct(index.chg_pct)}</div>
              </div>
            ))}
          </div>

          <div className="card section market-state">
            <div className="ms-row">
              <div className="ms-item"><span className="k">涨停</span><span className="v up">{limit.up_cnt}</span></div>
              <div className="ms-item"><span className="k">跌停</span><span className="v down">{missing(limit.down_cnt)}</span></div>
              <div className="ms-item"><span className="k">炸板</span><span className="v">{missing(limit.broken_cnt)}</span></div>
              <div className="ms-item">
                <span className="k">封板率</span>
                <span className="v">{limit.seal_rate === null ? '—' : `${limit.seal_rate}%`}</span>
              </div>
            </div>
            <div className="breadth-bar" aria-label="上涨 / 平盘 / 下跌家数比例">
              <i style={{ width: `${upW}%`, background: 'var(--up)' }} />
              <i style={{ width: `${flatW}%`, background: '#6e6e6e' }} />
              <i style={{ width: `${downW}%`, background: 'var(--down)' }} />
            </div>
            <div className="ms-legend">
              <span className="up">涨 {fmt(breadth.up, 0)}</span>
              <span>平 {fmt(breadth.flat, 0)}</span>
              <span className="down">跌 {fmt(breadth.down, 0)}</span>
              <span className="ms-total">全 A {fmt(breadth.total, 0)}</span>
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <span className="card-title">今日连板</span>
              <span className="card-sub">示例 · 单击可预览（预览面板为后续阶段）</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.ladder.map((item) => (
                <span className="chip" key={item.code}>
                  <b>{item.ladder} 板</b>
                  {item.name}
                </span>
              ))}
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <span className="card-title">资讯 / 事件</span>
              <span className="card-sub">示例 · 尚未按交易日过滤（已知限制）</span>
            </div>
            {data.news.length === 0 ? (
              <div className="small muted">暂无资讯</div>
            ) : (
              data.news.map((item) => (
                <div key={item.id} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <span className="num muted" style={{ flex: '0 0 auto' }}>{item.published}</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  <span className="small muted">{item.status === 'full' ? '已抓取全文' : item.status === 'title' ? '仅标题' : '源不可用'}</span>
                </div>
              ))
            )}
            <div className="card-note">来源、发布时间与抓取状态均为 mock；事实与规则推断在真实接口中分开标注。</div>
          </div>
        </>
      )}
    </>
  );
}
