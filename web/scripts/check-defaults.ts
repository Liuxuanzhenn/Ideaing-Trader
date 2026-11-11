/**
 * 回测默认区间检查：`from === to` 会被后端 422 拒绝（need at least 2 sessions），
 * 这里守住「默认区间至少跨 30 个日历日」这条约束。
 * 用法：npm run check:defaults
 */
import { defaultBacktestRange } from '../src/lib/format.ts';

let failed = 0;
const fail = (message: string) => {
  failed += 1;
  console.error('FAIL', message);
};

const normal = defaultBacktestRange('2026-11-06');
if (normal.to !== '2026-11-06') fail(`to 应为最新交易日，实际 ${normal.to}`);
if (normal.from !== '2026-10-07') fail(`from 应为往前 30 个日历日，实际 ${normal.from}`);
if (normal.from >= normal.to) fail(`默认区间必须是 from < to，实际 ${normal.from}..${normal.to}`);

// 跨月/跨年边界
const crossMonth = defaultBacktestRange('2026-03-05');
if (crossMonth.from !== '2026-02-03') fail(`跨月计算错误，实际 ${crossMonth.from}`);
const crossYear = defaultBacktestRange('2026-01-10');
if (crossYear.from !== '2025-12-11') fail(`跨年计算错误，实际 ${crossYear.from}`);

// 缺失/非法返回值不能让表单变成 "Invalid Date"
for (const bad of ['', 'not-a-date']) {
  const range = defaultBacktestRange(bad);
  if (range.from !== '' || range.to !== '') fail(`非法输入 ${JSON.stringify(bad)} 应返回空串，实际 ${JSON.stringify(range)}`);
}

if (failed) {
  console.error(`回测默认区间检查失败，${failed} 项`);
  process.exit(1);
}
console.log('默认区间检查通过：30 日回看、from<to、跨月/跨年、非法输入返回空串');
