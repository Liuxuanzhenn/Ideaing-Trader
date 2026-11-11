/**
 * 适配层语义检查：观察池批量取数的失败语义。
 * 部分失败 → 只丢那一行；全部失败 → 必须抛错（否则取数故障会被页面说成「当日没有行情」）。
 * 用法：npm run check:adapters
 */
import { settleStocks } from '../src/lib/settle.ts';

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

if (failed) {
  console.error(`适配层语义检查失败，${failed} 项`);
  process.exit(1);
}
console.log('适配层语义检查通过：全成功 / 部分失败丢行 / 全部失败抛首个错误 / 空输入');
