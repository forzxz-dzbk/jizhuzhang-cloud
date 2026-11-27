import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escapeLikePattern } from '../src/transaction-search.mjs';

test('transaction search escapes LIKE wildcards and queries the complete remote ledger by pages', async () => {
  assert.equal(escapeLikePattern('meal_50%\\cash'), 'meal\\_50\\%\\\\cash');
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  assert.match(home, /request\.ilike\('note',`%\$\{escapeLikePattern\(filter\)\}%`\)/);
  assert.match(home, /request\.range\(start,start\+TRANSACTION_PAGE_SIZE\)/);
  assert.match(home, /rows\.length>TRANSACTION_PAGE_SIZE/);
  assert.match(home, /transactionRequest\.current/);
  assert.match(home, /requestVersion!==transactionRequest\.current/);
  assert.match(home, /正在加载云端流水/);
  assert.match(home, /搜索备注/);
  assert.match(home, /setTransactionPage\(page=>page\+1\)/);
  assert.match(home, /没有找到匹配备注的流水/);
  assert.match(home, /account_id,transfer_account_id,category_id,business_order_id,refund_order_id,cost_order_id/);
  assert.match(home, /转出：\$\{account\(row\.account_id\)\}/);
  assert.match(home, /已归档分类/);
  assert.match(home, /订单：\$\{order\.title \|\| '未填写订单名称'\}/);
});
