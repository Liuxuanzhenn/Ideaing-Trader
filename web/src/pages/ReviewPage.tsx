import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import type { Review } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { EmptyBlock, ErrorBlock, PartialBanner, ReviewSkeleton, StaleBanner, StatusChip } from '../components/States';
import { Spark } from '../components/charts';
import { fmt, fmtDate, fmtDateTime, pct, toneOf, yuan } from '../lib/format';

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

function amountText(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} 万亿`;
  if (value >= 1e8) return `${(value / 1e8).toFixed(0)} 亿`;
  return `${value.toFixed(0)} 元`;
}

function DeltaChip({ value, unit = 'int' }: { value: number | null; unit?: 'int' | 'pt' | 'yi' }) {
  if (value === null || Number.isNaN(value)) return <span className="delta flat">—</span>;
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
  const abs = Math.abs(value);
  const text = unit === 'pt' ? `${abs.toFixed(1)}pt` : unit === 'yi' ? `${abs.toFixed(2)} 万亿` : abs.toFixed(0);
  return <span className={`delta ${tone}`}>{arrow} {text}</span>;
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
  const { meta, breadth, limit, market, prev, series } = data;
  const breadthTotal = breadth.up + breadth.flat + breadth.down;
  const share = (value: number) => (breadthTotal ? (value / breadthTotal) * 100 : 0);
  const sealPct = limit.seal_rate === null ? null : limit.seal_rate * 100;
  const prevSealPct = prev?.seal_rate == null ? null : prev.seal_rate * 100;
  const count = (value: number | null) => (value === null ? '—' : fmt(value, 0));

  const levels = new Map<number, typeof data.ladder>();
  for (const row of data.ladder) {
    if (!levels.has(row.ladder)) levels.set(row.ladder, []);
    levels.get(row.ladder)!.push(row);
  }
  const levelKeys = [...levels.keys()].sort((a, b) => b - a);
  const maxLevelCount = Math.max(1, ...levelKeys.map((k) => levels.get(k)!.length));

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
          <div><strong>交易日未知</strong>：已退回自然日 {date} 请求，结果可能为空或过期。</div>
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
          <div className="tile-grid section">
            {data.indices.map((index, i) => (
              <div className="tile" key={index.code}>
                <div className="k">{index.name}</div>
                <div className={`v ${toneOf(index.chg_pct)}`}>{fmt(index.close)}</div>
                <div className={`s ${toneOf(index.chg_pct)}`}>{pct(index.chg_pct)}</div>
                <Spark values={series.indices[i]?.values ?? []} tone="var(--muted)" />
              </div>
            ))}

            <div className="tile">
              <div className="k">市场宽度</div>
              <div className="v">
                {fmt(breadth.up, 0)}
                <small>/ {fmt(breadth.down, 0)}</small>
              </div>
              <div className="s">红盘率 {breadthTotal ? ((breadth.up / breadthTotal) * 100).toFixed(0) : 0}%</div>
              <div className="breadth-mini" aria-label="上涨 / 平盘 / 下跌家数比例">
                <i style={{ width: `${share(breadth.up)}%`, background: 'var(--up)' }} />
                <i style={{ width: `${share(breadth.flat)}%`, background: '#6e6e6e' }} />
                <i style={{ width: `${share(breadth.down)}%`, background: 'var(--down)' }} />
              </div>
            </div>

            <div className="tile">
              <div className="k">涨停</div>
              <div className="v up">{count(limit.sealed_up)}</div>
              <DeltaChip value={prev ? (limit.sealed_up ?? 0) - prev.sealed_up : null} />
              <Spark values={series.sealed_up} kind="bar" tone="var(--up)" />
            </div>

            <div className="tile">
              <div className="k">跌停</div>
              <div className="v down">{count(limit.sealed_down)}</div>
              <DeltaChip value={prev && limit.sealed_down !== null ? limit.sealed_down - (prev.sealed_down ?? 0) : null} />
              <Spark values={series.sealed_down} kind="bar" tone="var(--down)" />
            </div>

            <div className="tile">
              <div className="k">炸板</div>
              <div className="v">{count(limit.broken_up)}</div>
              <DeltaChip value={prev && limit.broken_up !== null ? limit.broken_up - (prev.broken_up ?? 0) : null} />
              <Spark values={series.broken_up} kind="bar" tone="var(--muted-2)" />
            </div>

            <div className="tile">
              <div className="k">封板率</div>
              <div className="v">{sealPct === null ? '—' : `${sealPct.toFixed(1)}%`}</div>
              <DeltaChip value={sealPct !== null && prevSealPct !== null ? sealPct - prevSealPct : null} unit="pt" />
              <Spark values={series.seal_rate.map((v) => (v === null ? null : v * 100))} tone="var(--muted)" />
            </div>

            <div className="tile">
              <div className="k">最高板</div>
              <div className="v">{levelKeys[0] ?? 0}<small>板</small></div>
              <div className="s">昨日 {series.max_ladder[series.max_ladder.length - 2] ?? '—'} 板</div>
              <Spark values={series.max_ladder} kind="bar" tone="var(--text)" />
            </div>

            <div className="tile">
              <div className="k">连板家数</div>
              <div className="v">{data.ladder.filter((r) => r.ladder >= 2).length}<small>只</small></div>
              <div className="s">含 2 板及以上</div>
              <Spark values={series.ladder_count} kind="bar" tone="var(--muted-2)" />
            </div>

            <div className="tile">
              <div className="k">晋级率</div>
              <div className="v">
                {data.promotion[0]?.rate == null ? '—' : `${(data.promotion[0].rate * 100).toFixed(0)}%`}
              </div>
              <div className="s">首板 → 二板</div>
              <Spark values={series.promotion_rate.map((v) => (v === null ? null : v * 100))} tone="var(--muted)" />
            </div>

            <div className="tile">
              <div className="k">两市成交</div>
              <div className="v">{amountText(market.amount)}</div>
              <DeltaChip value={prev ? (market.amount - prev.amount) / 1e12 : null} unit="yi" />
              <Spark values={series.amount.map((v) => v / 1e12)} tone="var(--muted)" />
            </div>

            <div className="tile">
              <div className="k">新高 / 新低</div>
              <div className="v">
                {market.new_high_63}
                <small>/ {market.new_low_63}</small>
              </div>
              <div className="s">63 日</div>
              <Spark values={series.new_high_63} tone="var(--muted)" />
            </div>
          </div>

          <div className="card section">
            <div className="card-head">
              <span className="card-title">连板天梯</span>
              <span className="card-sub">
                最高 {levelKeys[0] ?? 0} 板 · {data.ladder.length} 只 · 昨涨停今中位{' '}
                <b className={toneOf(market.prev_limit.median_pct)}>{pct(market.prev_limit.median_pct, 1)}</b> · 翻红{' '}
                {(market.prev_limit.up_ratio * 100).toFixed(0)}%
                {data.promotion.length > 0 ? ' · 晋级率 ' : ''}
                {data.promotion.map((step) => (
                  <em key={step.level} style={{ fontStyle: 'normal', marginLeft: 8 }}>
                    {step.level}→{step.level + 1} {step.rate === null ? '—' : `${(step.rate * 100).toFixed(0)}%`}
                  </em>
                ))}
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
                        <i style={{ width: `${(rows.length / maxLevelCount) * 100}%` }} />
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

          <div className="card section">
            <div className="card-head">
              <span className="card-title">板块</span>
              <span className="card-sub">
                按当日涨跌幅排序 · 净流入需分单方向，日线口径暂不提供
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>板块</th>
                    <th className="num">涨跌幅</th>
                    <th className="num">5 日</th>
                    <th className="num">上涨/家数</th>
                    <th className="num">涨停</th>
                    <th className="num">成交额</th>
                    <th>领涨</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.sectors]
                    .sort((a, b) => b.chg_pct - a.chg_pct)
                    .map((sector) => (
                      <tr key={sector.name}>
                        <td>{sector.name}</td>
                        <td className={`num ${toneOf(sector.chg_pct)}`}>{pct(sector.chg_pct)}</td>
                        <td className={`num ${toneOf(sector.chg_5d_pct ?? 0)}`}>
                          {sector.chg_5d_pct === null ? '—' : pct(sector.chg_5d_pct)}
                        </td>
                        <td className="num muted">{sector.up}/{sector.total}</td>
                        <td className="num">{sector.limit_up || '—'}</td>
                        <td className="num muted">{yuan(sector.amount)}</td>
                        <td>
                          <button
                            className="link-chip"
                            onClick={() => onOpenStock?.(sector.leader.code)}
                            tabIndex={0}
                          >
                            {sector.leader.name}
                            <span className={toneOf(sector.leader.chg_pct)} style={{ marginLeft: 6 }}>
                              {pct(sector.leader.chg_pct)}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
