import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateAccountBalances } from '../src/account-balance.mjs';

test('account balances apply signed opening amounts, refunds, expenses and neutral internal transfers in exact cents', () => {
  const balances = calculateAccountBalances([
    { id: 'cash', opening_balance: '100.10' },
    { id: 'credit', opening_balance: '-25.00' },
  ], [
    { type: 'income', amount: '20.00', account_id: 'cash', transfer_account_id: null },
    { type: 'expense', amount: '10.05', account_id: 'cash', transfer_account_id: null },
    { type: 'refund', amount: '2.00', account_id: 'cash', transfer_account_id: null },
    { type: 'transfer', amount: '15.00', account_id: 'cash', transfer_account_id: 'credit' },
    { type: 'expense', amount: '5.00', account_id: 'credit', transfer_account_id: null },
  ]);
  assert.equal(balances.get('cash'), 9305);
  assert.equal(balances.get('credit'), -1500);
  assert.equal([...balances.values()].reduce((sum, cents) => sum + cents, 0), 7805, 'transfers do not change total net worth');
  assert.throws(() => calculateAccountBalances([{ id: 'bad', opening_balance: 'NaN' }], []), /不是有效数字/);
});

test('balance UI reads the complete ledger with stable keyset pagination and reports failures', async () => {
  const component = await readFile(new URL('../src/AccountBalances.tsx', import.meta.url), 'utf8');
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  const calculator = await readFile(new URL('../src/account-balance.mjs', import.meta.url), 'utf8');
  assert.match(component, /\.order\('id'\)\.limit\(PAGE_SIZE\)/);
  assert.match(component, /query\.gt\('id', afterId\)/);
  assert.match(component, /账户余额读取失败/);
  assert.match(calculator, /transaction\.type === 'refund'/);
  assert.match(calculator, /transaction\.transfer_account_id/);
  assert.match(home, /opening_balance: openingBalance/);
  assert.match(home, /<AccountBalances ledgerId=\{active\.id\} accounts=\{accounts\}\/?>/);
});
