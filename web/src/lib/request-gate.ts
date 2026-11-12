/**
 * 过期响应保护：链路一次请求要 12–45 秒，用户快速切 tab 时慢响应会晚到。
 * 按 key（date|type）发号，回包时只有「该 key 的最新一号」才允许写入状态，
 * 其余一律丢弃，避免旧 tab 的数据覆盖当前 tab。
 * 独立成文件便于 scripts/check-adapters.ts 直接断言。
 */
export interface GateToken {
  key: string;
  seq: number;
}

export function createRequestGate() {
  const seqByKey = new Map<string, number>();
  return {
    /** 开始一次请求，返回本次的令牌 */
    begin(key: string): GateToken {
      const seq = (seqByKey.get(key) ?? 0) + 1;
      seqByKey.set(key, seq);
      return { key, seq };
    },
    /** 该令牌是否仍是这个 key 的最新一次请求 */
    isLatest(token: GateToken): boolean {
      return seqByKey.get(token.key) === token.seq;
    },
    /** 主动作废某个 key 的在途请求（例如换日期） */
    invalidate(key: string): void {
      seqByKey.set(key, (seqByKey.get(key) ?? 0) + 1);
    },
    /** 作废全部（换日期时整体清空） */
    invalidateAll(): void {
      seqByKey.clear();
    },
  };
}

export type RequestGate = ReturnType<typeof createRequestGate>;
