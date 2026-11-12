/**
 * 适配层语义检查：观察池批量取数的失败语义。
 * 部分失败 → 只丢那一行；全部失败 → 必须抛错（否则取数故障会被页面说成「当日没有行情」）。
 * 用法：npm run check:adapters
 */
import { settleStocks } from '../src/lib/settle.ts';
import { conceptsText, industryLabel } from '../src/lib/format.ts';
import { isBlank, nextSort, sortRows } from '../src/lib/sort.ts';

let failed = 0;
const fail = (message: string) => {
  failed += 1;
  console.error('FAIL', message);
};

const fulfilled = (value: string): PromiseSettledResult<string> => ({ status: 'fulfilled', value });
const rejected = (reason: string): PromiseSettledResult<string> => ({ status: 'rejected', reason: new Error(reason) });

// 全部成功
const allOk = settleStocks([fulfilled('SZ002261'), fulfilled('SZ000001')]);
if (allOk.length !== 2) fail(`全成功应返回 2 行，实际 ${allOk.length}`);

// 部分失败：只丢失败行
const partial = settleStocks([fulfilled('SZ002261'), rejected('退市')]);
if (partial.length !== 1 || partial[0] !== 'SZ002261') fail(`部分失败应只保留成功行，实际 ${JSON.stringify(partial)}`);

// 全部失败：必须抛首个错误，不能悄悄返回空数组
let threw: unknown = null;
try {
  settleStocks([rejected('该回测结果只存在于当前会话'), rejected('第二个失败')]);
} catch (error) {
  threw = error;
}
if (!(threw instanceof Error)) fail('全部失败必须抛错，实际没有抛');
else if (!/只存在于当前会话/.test(threw.message)) fail(`应抛第一个错误，实际 ${threw.message}`);

// 空输入：不是失败，返回空
const empty = settleStocks([]);
if (empty.length !== 0) fail('空输入应返回空数组');

// 行业文案：四种状态 + 旧 API 缺字段，都不许把 null 说成「没有异动」
const industryCases: [string | null, string | null, string][] = [
  ['软件', 'ok', '软件'],
  [null, 'ok', '来源无行业记录'],
  [null, 'empty_for_delisted', '已退市/无行业分类'],
  [null, 'missing', '来源无行业记录'],
  [null, 'missing_basic', '来源无行业记录'],
  [null, null, '行业数据未接入'],
  ['软件', null, '软件'],
];
for (const [industry, status, expected] of industryCases) {
  const actual = industryLabel(industry, status as never);
  if (actual !== expected) fail(`industryLabel(${industry}, ${status}) 应为「${expected}」，实际「${actual}」`);
  if (actual.includes('异动')) fail('行业文案不得出现「异动」类措辞');
}

// 概念文案：null 必须说「未接入」，不能被渲染成空串/空列表/「暂无概念」
if (conceptsText(null) !== '概念数据未接入') fail(`concepts=null 应显示「概念数据未接入」，实际「${conceptsText(null)}」`);
if (!conceptsText(null)) fail('concepts=null 不得渲染成空串');
if (conceptsText([]) !== null) fail(`concepts=[] 是「确实无概念」，应不显示任何文案，实际「${conceptsText([])}」`);
const shown = conceptsText(['AI 应用', '华为链']);
if (shown !== 'AI 应用 · 华为链') fail(`concepts 有值应正常拼接，实际「${shown}」`);
const longList = conceptsText(['a', 'b', 'c', 'd']);
if (longList !== 'a · b · c') fail(`最多展示 3 个，实际「${longList}」`);
for (const label of [conceptsText(null), conceptsText([])]) {
  if (label && /暂无|没有概念|无概念/.test(label)) fail(`概念文案不得出现「确实没有」类措辞：${label}`);
  if (label === '') fail('概念文案不得是空串');
}

// 表格排序：空值恒末尾（升降序都一样）、数值按数值、日期按日期、三态循环
const rows = [
  { id: 'a', v: 3, d: '2026-11-02' },
  { id: 'b', v: null, d: null },
  { id: 'c', v: 1, d: '2026-11-01' },
  { id: 'd', v: 10, d: '2026-11-03' },
];
const asc = sortRows(rows, { key: 'v', dir: 'asc' }, (r, k) => (k === 'v' ? r.v : r.d)).map((r) => r.id);
const desc = sortRows(rows, { key: 'v', dir: 'desc' }, (r, k) => (k === 'v' ? r.v : r.d)).map((r) => r.id);
if (asc.join('') !== 'cadb') fail(`数值升序应为 c,a,d,b（空值恒末尾），实际 ${asc.join(',')}`);
if (desc.join('') !== 'dacb') fail(`数值降序应为 d,a,c,b（空值仍末尾），实际 ${desc.join(',')}`);
if (asc.indexOf('b') !== asc.length - 1) fail('空值必须排在最后');
if (desc.indexOf('b') !== desc.length - 1) fail('降序时空值也必须在最后');
const byDate = sortRows(rows, { key: 'd', dir: 'asc' }, (r, k) => (k === 'd' ? r.d : r.v)).map((r) => r.id);
if (byDate.join('') !== 'cadb') fail(`日期升序应为 c,a,d,b，实际 ${byDate.join(',')}`);
if (sortRows(rows, null, (r) => r.v).map((r) => r.id).join('') !== 'abcd') fail('无排序时必须保持接口原顺序');
// 三态循环：无 → 升 → 降 → 无
let st = nextSort(null, 'v');
if (!st || st.dir !== 'asc') fail('首次点击应为升序');
st = nextSort(st, 'v');
if (!st || st.dir !== 'desc') fail('第二次点击应为降序');
st = nextSort(st, 'v');
if (st !== null) fail('第三次点击应取消排序');
for (const blank of [null, undefined, '', '—']) if (!isBlank(blank)) fail(`isBlank 应判为真空值: ${String(blank)}`);
if (isBlank(0) || isBlank('0')) fail('0 不是空值，不能被当成缺失');

if (failed) {
  console.error(`适配层语义检查失败，${failed} 项`);
  process.exit(1);
}
console.log('适配层语义检查通过：批量取数四态 + 行业七态 + 概念四态 + 排序语义（空值恒末尾 / 数值 / 日期 / 三态循环 / 无排序保序）');
