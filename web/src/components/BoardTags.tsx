import { useState } from 'react';
import type { StockBoard } from '../api/types';

const TYPE_LABEL: Record<string, string> = {
  industry: '行业',
  concept: '概念',
  region: '地域',
  style: '风格',
};

/** 类型权重：行业/概念在前，地域/风格在后且更淡 */
const TYPE_ORDER = ['industry', 'concept', 'region', 'style'];

const LIMIT = 12;

/**
 * 个股板块标签：按 type 分组，行业/概念优先；默认只显示 12 个，其余收进「+N」，
 * 避免 29 个板块把页眉撑成一堵墙。boards=null → 明确说「未接入」，[] → 不显示。
 */
export function BoardTags({ boards }: { boards: StockBoard[] | null }) {
  const [expanded, setExpanded] = useState(false);

  if (boards === null) {
    return <div className="board-tags"><span className="board-tag board-tag--muted">板块数据未接入</span></div>;
  }
  if (boards.length === 0) return null;

  const sorted = [...boards].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  );
  const shown = expanded ? sorted : sorted.slice(0, LIMIT);
  const rest = sorted.length - shown.length;

  return (
    <div className="board-tags">
      {shown.map((board) => (
        <span
          key={`${board.type}-${board.code}`}
          className={`board-tag board-tag--${board.type}`}
          title={TYPE_LABEL[board.type] ?? board.type}
        >
          {board.name}
        </span>
      ))}
      {rest > 0 ? (
        <button type="button" className="board-tag board-tag--more" onClick={() => setExpanded(true)}>
          +{rest}
        </button>
      ) : null}
    </div>
  );
}
