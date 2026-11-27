import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CATEGORIES, missingDefaultCategories } from '../src/ledger-default-categories.mjs';

test('default expense categories cover the quick-entry reference without manual setup', () => {
  const names = DEFAULT_CATEGORIES.expense.map(item => item.name);
  for (const name of ['三餐','零食','衣服','交通','旅行','孩子','宠物','话费网费','烟酒','学习','日用品','住房','美妆','医疗','红包','汽车/加油','娱乐','请客送礼','电器数码','运动','其它','水电煤']) assert.ok(names.includes(name), name);
  assert.ok(DEFAULT_CATEGORIES.income.length >= 5);
  assert.ok(DEFAULT_CATEGORIES.expense.every(item => item.icon));
});

test('existing accounts seed only missing defaults and retain custom categories', () => {
  const existing = [{ name: '三餐', flow: 'expense' }, { name: '自定义', flow: 'expense' }];
  const missing = missingDefaultCategories(existing, 'expense');
  assert.ok(!missing.some(item => item.name === '三餐'));
  assert.ok(missing.some(item => item.name === '水电煤'));
  assert.equal(missingDefaultCategories([...existing, ...missing.map(item => ({ ...item, flow: 'expense' }))], 'expense').length, 0);
  assert.equal(missingDefaultCategories(existing, 'income').length, DEFAULT_CATEGORIES.income.length);
});

test('dashboard provides immediate ledger surface, category quick entry, and renamed ledger labels', async () => {
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /LedgerMonthCard ledgerId=\{active\.id\}/);
  assert.match(home, /className="floating-add"/);
  assert.match(home, /className="category-grid"/);
  assert.match(home, /创建支出账本/);
  assert.match(home, /创建收入账本/);
  assert.match(home, /row\.kind === 'personal' \? '支出' : '收入'/);
});
