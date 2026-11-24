import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatCents, summarizeDay, sumMonthlyRows, summarizeYear } from '../src/daily-finance.mjs';

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

test('annual report is ledger-year scoped, month-by-month, and sums exact cents', () => {
  const rows = [
    { occurred_on: '2026-01-03', income: '0.10', expense: '0.03' },
    { occurred_on: '2026-01-29', income: '0.20', expense: '0.01' },
    { occurred_on: '2026-02-02', income: '5.00', expense: '8.00' },
    { occurred_on: '2025-12-31', income: '999.00', expense: '0.00' },
  ];
  const summary = summarizeYear(rows, 2026);
  assert.deepEqual({ income: summary.income, expense: summary.expense, surplus: summary.surplus }, { income: 530, expense: 804, surplus: -274 });
  assert.equal(summary.months.length, 12);
  assert.deepEqual(summary.months[0], { month: '2026-01', income: 30, expense: 4, surplus: 26 });
  assert.deepEqual(summary.months[1], { month: '2026-02', income: 500, expense: 800, surplus: -300 });
  assert.deepEqual(summary.months[11], { month: '2026-12', income: 0, expense: 0, surplus: 0 });
});

test('annual report reads only the selected ledger and labels empty years honestly', async () => {
  const component = await readFile(new URL('../src/AnnualReport.tsx', import.meta.url), 'utf8');
  assert.match(component, /eq\('ledger_id', ledgerId\)/);
  assert.match(component, /gte\('occurred_on', from\)\.lte\('occurred_on', to\)/);
  assert.match(component, /该年度暂无真实流水/);
  assert.match(component, /timeZone: 'Asia\/Shanghai'/);
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
