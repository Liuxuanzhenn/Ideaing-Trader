/**
 * 批量取数的失败语义：部分失败只丢那一行（停牌/退市/未知代码），
 * **全部失败必须抛错**——否则断网、401、500 会被页面说成「这些标的当日没有行情」。
 * 独立成文件是为了能被 scripts/check-adapters.ts 直接 import 验证。
 */
export function settleStocks<T>(results: PromiseSettledResult<T>[]): T[] {
  const rows = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (rows.length === 0 && results.length > 0) {
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw failed?.reason ?? new Error('全部标的取数失败');
  }
  return rows;
}
