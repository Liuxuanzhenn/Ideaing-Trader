import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import type { Review } from '../api/types';
import { useAsync } from '../lib/useAsync';
import {
  EmptyBlock,
  ErrorBlock,
  PartialBanner,
  ReviewSkeleton,
  StaleBanner,
  StatusChip,
} from '../components/States';
import { fmt, fmtDate, fmtDateTime, pct, toneOf } from '../lib/format';

interface Props {
  client: ApiClient;
  /** 由 getServiceStatus().as_of 推出的交易日；null = 状态未就绪，先不发请求 */
  date: string | null;
  /** 状态接口不可用、退回自然日时为 true */
  dateFallback?: boolean;
  selectedCode?: string | null;
  onSelectStock?: (code: string) => void;
  onOpenStock?: (code: string) => void;
}

const pending = <T,>(): Promise<T> => new Promise<T>(() => {});

export function ReviewPage({ client, date, dateFallback = false, selectedCode = null, onSelectStock, onOpenStock }: Props) {
  const load = useCallback(
    () => (date ? client.getReview(date) : pending<Review>()),
    [client, date],
  );
  const review = useAsync(load);

  if (review.phase === 'loading') {
    return (
      <>
        <div className="view-head">
          <div>
            <h2 className="view-title">盘后复盘</h2>
            <div className="view-sub">{date ? '正在读取数据…' : '正在读取当前交易日…'}</div>
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
  const breadthTotal = breadth.up + breadth.flat + breadth.down;
  const share = (value: number) => (breadthTotal ? (value / breadthTotal) * 100 : 0);
  const count = (value: number | null) => (value === null ? '—' : fmt(value, 0));
  const sealRate = limit.seal_rate === null ? '—' : `${(limit.seal_rate * 100).toFixed(1)}%`;

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            盘后复盘 · {fmtDate(meta.as_of)}
            <StatusChip level={meta.status.level} />
          </h2>
          <div className="view-sub">
            更新 {fmtDateTime(meta.updated_at)} · 覆盖率 {meta.coverage.pct}% · 快照 {meta.snapshot}
          </div>
        </div>
      </div>

      {dateFallback ? (
        <div className="banner banner-warn" role="status">
          <span aria-hidden="true">△</span>
          <div>
            <strong>交易日未知</strong>：数据状态接口不可用，已退回自然日 {date} 请求。
            <span className="banner-detail">该日期可能不是交易日，结果会显示为空或过期，不要当作当日复盘。</span>
          </div>
        </div>
      ) : null}

      {meta.status.level === 'stale' ? <StaleBanner meta={meta} /> : null}
      {meta.status.level === 'partial' ? <PartialBanner meta={meta} /> : null}

      {!data.is_trading_day ? (
        <div className="card section">
          <EmptyBlock
            title="当日没有复盘数据"
            description="该日期不是交易日，或数据尚未产出。是否为空由接口的 is_trading_day 与 status.level 决定，前端不靠自然日猜测。"
            children={<button className="btn" onClick={review.retry}>重新加载</button>}
          />
        </div>
      ) : (
        <>
          <div className="index-strip">
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
              <div className="ms-item"><span className="k">涨停</span><span className="v up">{count(limit.sealed_up)}</span></div>
              <div className="ms-item"><span className="k">跌停</span><span className="v down">{count(limit.sealed_down)}</span></div>
              <div className="ms-item"><span className="k">炸板</span><span className="v">{count(limit.broken_up)}</span></div>
              <div className="ms-item"><span className="k">封板率</span><span className="v">{sealRate}</span></div>
              <div className="ms-item"><span className="k">无涨跌幅限制</span><span className="v">{count(limit.no_limit)}</span></div>
            </div>
            <div className="breadth-bar" aria-label="上涨 / 平盘 / 下跌家数比例">
              <i style={{ width: `${share(breadth.up)}%`, background: 'var(--up)' }} />
              <i style={{ width: `${share(breadth.flat)}%`, background: '#6e6e6e' }} />
              <i style={{ width: `${share(breadth.down)}%`, background: 'var(--down)' }} />
            </div>
            <div className="ms-legend">
              <span className="up">涨 {fmt(breadth.up, 0)}</span>
              <span>平 {fmt(breadth.flat, 0)}</span>
              <span className="down">跌 {fmt(breadth.down, 0)}</span>
              <span className="ms-total">全 A {fmt(breadthTotal, 0)}</span>
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <span className="card-title">今日连板</span>
              <span className="card-sub">单击预览 · 双击打开个股</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>股票</th><th className="num">连板</th><th>封板时间</th><th style={{ textAlign: 'right' }}>操作</th></tr>
                </thead>
                <tbody>
                  {data.ladder.map((item) => (
                    <tr
                      key={item.code}
                      className={selectedCode === item.code ? 'selected' : ''}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      onClick={() => onSelectStock?.(item.code)}
                      onDoubleClick={() => onOpenStock?.(item.code)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); onOpenStock?.(item.code); }
                      }}
                    >
                      <td>
                        <div className="stock-cell">
                          <span className="n">{item.name}</span>
                          <span className="c">{item.code}</span>
                        </div>
                      </td>
                      <td className="num">{item.ladder} 板</td>
                      <td className="num muted">{item.seal_time ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-small" onClick={(event) => { event.stopPropagation(); onOpenStock?.(item.code); }}>
                          打开
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-note">封板时间需要分钟线，接口当前返回 null，页面显示「—」。</div>
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
                  <span className="small muted">
                    {item.reason_source === 'exchange' ? '交易所公告' : item.reason_source === 'news' ? '媒体资讯' : '规则推断'}
                  </span>
                </div>
              ))
            )}
            <div className="card-note">来源、发布时间与抓取状态均为 mock；真实接口中 reason_source 需与 reason 文本分开标注。</div>
          </div>
        </>
      )}
    </>
  );
}
