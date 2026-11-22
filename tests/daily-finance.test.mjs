import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatCents, summarizeDay, sumMonthlyRows } from '../src/daily-finance.mjs';

test('daily and monthly summaries use Shanghai ledger dates and exact cents', () => {
  const rows = [
    { occurred_on: '2026-11-22', income: '0.10', expense: '0.03' },
    { occurred_on: '2026-11-22', income: '0.20', expense: '0.01' },
    { occurred_on: '2026-11-21', income: '80.00', expense: '12.34' },
  ];
  assert.deepEqual(summarizeDay(rows, '2026-11-22'), { income: 30, expense: 4, surplus: 26 });
  assert.deepEqual(sumMonthlyRows(rows), { income: 8030, expense: 1238, surplus: 6792 });
  assert.equal(formatCents(26), '¥0.26');
});

test('daily summary is rendered per selected ledger and queries only actual transaction totals', async () => {
  const component = await readFile(new URL('../src/LedgerOverview.tsx', import.meta.url), 'utf8');
  assert.match(component, /timeZone:'Asia\/Shanghai'/);
  assert.match(component, /eq\('ledger_id',ledgerId\)/);
  assert.match(component, /今日财务小结/);
  assert.match(component, /本月支出 \/ 退款/);
  assert.match(component, /当前所选账本统计/);
  assert.match(component, /transaction_totals/);
});
