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
  assert.match(home, /搜索备注/);
  assert.match(home, /setTransactionPage\(page=>page\+1\)/);
  assert.match(home, /没有找到匹配备注的流水/);
});
