import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import type { Review } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, ReviewSkeleton, StaleBanner, StatusChip } from '../components/States';
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

/** 万亿/亿展示，只在展示层换算 */
function amountText(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} 万亿`;
  if (value >= 1e8) return `${(value / 1e8).toFixed(0)} 亿`;
  return `${value.toFixed(0)} 元`;
}

function deltaText(delta: number, unit: 'int' | 'pt' = 'int'): string {
  const sign = delta > 0 ? '+' : '';
  return unit === 'pt' ? `${sign}${delta.toFixed(1)}pt` : `${sign}${delta.toFixed(0)}`;
}

export function ReviewPage({ client, date, dateFallback = false, selectedCode = null, onSelectStock, onOpenStock }: Props) {
  const load = useCallback(() => (date ? client.getReview(date) : pending<Review>()), [client, date]);
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
  const { meta, breadth, limit, market, prev } = data;
  const breadthTotal = breadth.up + breadth.flat + breadth.down;
  const share = (value: number) => (breadthTotal ? (value / breadthTotal) * 100 : 0);
  const count = (value: number | null) => (value === null ? '—' : fmt(value, 0));
  const sealPct = limit.seal_rate === null ? null : limit.seal_rate * 100;
  const prevSealPct = prev?.seal_rate == null ? null : prev.seal_rate * 100;
  const redRatio = breadthTotal ? breadth.up / breadthTotal : 0;

  const levels = new Map<number, typeof data.ladder>();
  for (const row of data.ladder) {
    if (!levels.has(row.ladder)) levels.set(row.ladder, []);
    levels.get(row.ladder)!.push(row);
  }
  const levelKeys = [...levels.keys()].sort((a, b) => b - a);

  return (
    <>
      <div className="view-head">
        <div>
          <h2 className="view-title">
            盘后复盘 · {fmtDate(meta.as_of)}
            <StatusChip level={meta.status.level} />
          </h2>
          <div className="view-sub">
            更新 {fmtDateTime(meta.updated_at)} · 覆盖率 {meta.coverage.pct}%
          </div>
        </div>
      </div>

      {dateFallback ? (
        <div className="banner banner-warn" role="status">
          <span aria-hidden="true">△</span>
          <div>
            <strong>交易日未知</strong>：已退回自然日 {date} 请求，结果可能为空或过期。
          </div>
        </div>
      ) : null}
      {meta.status.level === 'stale' ? <StaleBanner meta={meta} /> : null}
      {meta.status.level === 'partial' ? <PartialBanner meta={meta} /> : null}

      {!data.is_trading_day ? (
        <div className="card section">
          <EmptyBlock
            title="当日没有复盘数据"
            description="该日期不是交易日，或数据尚未产出。"
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
                </div>
                <div className="index-value">{fmt(index.close)}</div>
                <div className={`index-chg ${toneOf(index.chg_pct)}`}>{pct(index.chg_pct)}</div>
              </div>
            ))}
          </div>

          <div className="card section market-board">
            <div className="mb-primary">
              <div className="mb-metric">
                <span className="k">涨停</span>
                <span className="v up">{count(limit.sealed_up)}</span>
                {prev ? <span className="d">{deltaText((limit.sealed_up ?? 0) - prev.sealed_up)}</span> : null}
              </div>
              <div className="mb-metric">
                <span className="k">跌停</span>
                <span className="v down">{count(limit.sealed_down)}</span>
                {prev && limit.sealed_down !== null ? <span className="d">{deltaText(limit.sealed_down - prev.sealed_down!)}</span> : null}
              </div>
              <div className="mb-metric">
                <span className="k">炸板</span>
                <span className="v">{count(limit.broken_up)}</span>
                {prev && limit.broken_up !== null ? <span className="d">{deltaText(limit.broken_up - (prev.broken_up ?? 0))}</span> : null}
              </div>
              <div className="mb-metric">
                <span className="k">封板率</span>
                <span className="v">{sealPct === null ? '—' : `${sealPct.toFixed(1)}%`}</span>
                {sealPct !== null && prevSealPct !== null ? <span className="d">{deltaText(sealPct - prevSealPct, 'pt')}</span> : null}
              </div>
              <div className="mb-metric">
                <span className="k">两市成交</span>
                <span className="v">{amountText(market.amount)}</span>
                {prev ? (
                  <span className="d">
                    {(market.amount - prev.amount) >= 0 ? '+' : ''}
                    {((market.amount - prev.amount) / 1e12).toFixed(2)} 万亿
                  </span>
                ) : null}
              </div>
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
              <span className="ms-total">红盘率 {(redRatio * 100).toFixed(0)}%</span>
            </div>

            <div className="mb-secondary">
              <span><b>{market.new_high_63}</b> 新高</span>
              <span><b>{market.new_low_63}</b> 新低</span>
              <span>昨涨停今中位 <b className={toneOf(market.prev_limit.median_pct)}>{pct(market.prev_limit.median_pct, 1)}</b></span>
              <span>翻红率 <b>{(market.prev_limit.up_ratio * 100).toFixed(0)}%</b></span>
              <span className="mb-promo">
                晋级率{' '}
                {data.promotion.map((step) => (
                  <em key={step.level}>
                    {step.level}→{step.level + 1}
                    <b>{step.rate === null ? '—' : `${(step.rate * 100).toFixed(0)}%`}</b>
                  </em>
                ))}
              </span>
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <span className="card-title">连板天梯</span>
              <span className="card-sub">
                最高 {levelKeys[0] ?? 0} 板 · {data.ladder.length} 只
              </span>
            </div>
            {levelKeys.length === 0 ? (
              <div className="small muted">今日没有涨停股</div>
            ) : (
              <div className="ladder-rows">
                {levelKeys.map((level) => {
                  const rows = levels.get(level)!;
                  return (
                    <div className="ladder-row" key={level}>
                      <span className={`lvl ${level >= 4 ? 'lvl-hot' : ''}`}>{level} 板</span>
                      <span className="bar">
                        <i style={{ width: `${(rows.length / Math.max(...levelKeys.map((k) => levels.get(k)!.length))) * 100}%` }} />
                      </span>
                      <span className="names">
                        {rows.map((row) => (
                          <button
                            key={row.code}
                            className={`ladder-chip ${selectedCode === row.code ? 'selected' : ''}`}
                            tabIndex={0}
                            onClick={() => onSelectStock?.(row.code)}
                            onDoubleClick={() => onOpenStock?.(row.code)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onOpenStock?.(row.code);
                              }
                            }}
                          >
                            {row.name}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
