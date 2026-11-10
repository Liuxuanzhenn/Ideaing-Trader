import type { Review } from './types';

/**
 * Response of GET /api/review. Kept separate from the page view model on purpose:
 * the backend only serves what it can compute, and the mapper below fills the gaps
 * with explicit "not available yet" markers instead of zeroes.
 */
interface LiveMeta {
  as_of: string;
  updated_at: string;
  snapshot_id: string;
  level: string;
  failed_sources: string[];
  coverage: { instruments: number; expected: number; pct: number | null } | null;
}

interface LiveLimits {
  sealed_up: number;
  broken_up: number;
  sealed_down: number;
  no_limit: number;
  out_of_band: number;
  touched_up: number;
  seal_rate: number | null;
}

interface LiveIndex {
  code: string;
  name: string;
  close: number;
  chg_pct: number;
  amount: number;
}

interface LiveLadderRow {
  symbol: string;
  streak: number;
  is_one_word: boolean;
  name: string | null;
}

export interface LiveReview {
  meta: LiveMeta;
  is_trading_day: boolean;
  breadth: { up: number; down: number; flat: number };
  limits: LiveLimits;
  ladder: LiveLadderRow[];
  indices: LiveIndex[];
  excluded: Record<string, number>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new Error(body.message ?? body.code ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchLiveReview(date: string): Promise<LiveReview> {
  return getJson<LiveReview>(`/api/review?date=${encodeURIComponent(date)}`);
}

export interface LiveStatus {
  snapshot_id: string;
  updated_at: string;
  warning_count: number;
}

function snapshotDate(snapshot: string): string {
  const match = snapshot.match(/\.\.(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

export async function fetchLiveStatus(): Promise<import('./types').ServiceStatus> {
  const status = await getJson<LiveStatus>('/api/data-status');
  return {
    connection: 'online',
    as_of: snapshotDate(status.snapshot_id),
    updated_at: status.updated_at,
    coverage: { total: 0, pct: null },
    level: 'ok',
  };
}


/** Blocks the backend cannot serve yet; the page must say so instead of showing zeros. */
export function liveGaps(review: LiveReview): string[] {
  const gaps: string[] = [];
  if (review.indices.length === 0) gaps.push('指数行情');
  gaps.push('板块表现', '资金流', '资讯');
  return gaps;
}

/** Adapts the live payload to the view model the page already renders. */
export function toPageReview(review: LiveReview): Review {
  const excluded = review.excluded ?? {};
  return {
    meta: {
      as_of: review.meta.as_of,
      updated_at: review.meta.updated_at,
      snapshot: review.meta.snapshot_id,
      status: {
        level: review.meta.level as Review['meta']['status']['level'],
        failed_sources: review.meta.failed_sources,
      },
      coverage: {
        total: review.meta.coverage?.instruments ?? 0,
        pct: review.meta.coverage?.pct ?? null,
      },
    },
    is_trading_day: review.is_trading_day,
    indices: review.indices.map((index) => ({
      code: index.code,
      name: index.name,
      close: index.close,
      chg_pct: index.chg_pct,
      amount: index.amount,
    })),
    breadth: review.breadth,
    limit: {
      sealed_up: review.limits.sealed_up,
      broken_up: review.limits.broken_up,
      sealed_down: review.limits.sealed_down,
      touched_up: review.limits.touched_up,
      no_limit: review.limits.no_limit,
      out_of_band: review.limits.out_of_band,
      seal_rate: review.limits.seal_rate,
    },
    market: {
      amount: null,
      new_high_63: null,
      new_low_63: null,
      prev_limit: null,
    },
    promotion: [],
    prev: null,
    series: {
      dates: [],
      indices: [],
      sealed_up: [],
      sealed_down: [],
      broken_up: [],
      seal_rate: [],
      max_ladder: [],
      ladder_count: [],
      amount: [],
      red_ratio: [],
      new_high_63: [],
      new_low_63: [],
      promotion_rate: [],
    },
    sectors: [],
    flows: { inflow: [], outflow: [] },
    ladder: review.ladder.map((entry) => ({
      code: entry.symbol,
      // Names are not stored yet; showing the code beats showing an empty cell.
      name: entry.name ?? entry.symbol,
      ladder: entry.streak,
      is_one_word: entry.is_one_word,
      industry: null,
      seal_time: null,
    })),
    news: [],
    excluded,
  } as unknown as Review;
}
