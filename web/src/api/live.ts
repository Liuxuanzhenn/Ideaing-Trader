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

export interface LiveReview {
  meta: LiveMeta;
  is_trading_day: boolean;
  breadth: { up: number; down: number; flat: number };
  limits: LiveLimits;
  ladder: unknown[];
  indices: unknown[];
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

/** Blocks the backend cannot serve yet; the page must say so instead of showing zeros. */
export function liveGaps(review: LiveReview): string[] {
  const gaps: string[] = [];
  if (review.indices.length === 0) gaps.push('指数行情');
  if (review.ladder.length === 0) gaps.push('连板梯队');
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
        pct: review.meta.coverage?.pct ?? 0,
      },
    },
    is_trading_day: review.is_trading_day,
    indices: [],
    breadth: review.breadth,
    limit: {
      sealed_up: review.limits.sealed_up,
      broken_up: review.limits.broken_up,
      sealed_down: review.limits.sealed_down,
      touched_up: review.limits.touched_up,
      no_limit: review.limits.no_limit,
      seal_rate: review.limits.seal_rate,
    },
    market: { limit_up: review.limits.sealed_up, limit_down: review.limits.sealed_down, out_of_band: review.limits.out_of_band, excluded },
    promotion: [],
    prev: null,
    series: { indices: [] },
    sectors: [],
    flows: { inflow: [], outflow: [] },
    ladder: [],
    news: [],
  } as unknown as Review;
}
