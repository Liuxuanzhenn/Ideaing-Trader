/**
 * 缺失值专项检查：契约字段缺值时必须是 null，不能用 0 / '' / [] 冒充。
 * 只扫适配层（src/api/live.ts），因为页面不接触传输层字段。
 * 用法：npm run check:missing（发现可疑写法时退出码 1）
 */
import { readFileSync } from 'node:fs';

const file = new URL('../src/api/live.ts', import.meta.url);
const source = readFileSync(file, 'utf8').split('\n');

const PATTERNS = [
  { re: /\?\?\s*0\b/, why: '用 0 冒充缺失' },
  { re: /\|\|\s*0\b/, why: '用 0 冒充缺失' },
  { re: /:\s*0\s*[,;)]/, why: '常量 0 兜底，确认是否为缺失值' },
  { re: /\?\?\s*''/, why: '用空串冒充缺失' },
  // 序列数组（sparkline 用的 number[]）用 [] 表示"后端没有这条序列"，
  // 图上就是一条空线，不会凭空造点，所以不算冒充缺失，这里不拦。

];

const findings = [];
source.forEach((line, index) => {
  if (line.includes('missing-ok')) return; // 显式豁免，必须写理由
  const code = line.split('//')[0];
  if (code.trim().length === 0) return;
  for (const { re, why } of PATTERNS) {
    if (re.test(code)) findings.push(`${index + 1}: ${why} → ${line.trim()}`);
  }
});

if (findings.length) {
  console.error(`缺失值检查失败，${findings.length} 处可疑：`);
  for (const finding of findings) console.error('  ' + finding);
  process.exit(1);
}
console.log('缺失值检查通过：适配层没有 0 / 空串 / 空数组冒充缺失');
