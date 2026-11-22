import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cloud backup exports every ledger table through the authenticated client with paging and explicit errors', async () => {
  const backup = await readFile(new URL('../src/CloudBackup.tsx', import.meta.url), 'utf8');
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  for (const table of ['ledgers', 'accounts', 'categories', 'business_orders', 'recurring_expenses', 'transactions', 'recurring_expense_instances']) {
    assert.match(backup, new RegExp(`'${table}'`));
  }
  assert.match(backup, /\.range\(start, start \+ pageSize - 1\)/);
  assert.match(backup, /format: 'jizhuzhang-cloud-backup'/);
  assert.match(backup, /owner_id: session\.user\.id/);
  assert.match(backup, /if \(error\) throw new Error/);
  assert.ok(home.includes('<CloudBackup session={session} />'));
  assert.match(backup, /未确认的固定支出仍保持待确认状态/);
  assert.match(backup, /只能恢复此账号导出的备份/);
  assert.match(backup, /为避免覆盖或混合现有数据，恢复仅允许/);
  assert.match(backup, /window\.confirm/);
  assert.match(backup, /\.insert\(chunk\)/);
  assert.match(backup, /已尝试撤销本次写入/);
  assert.match(backup, /\.delete\(\)\.in\('id', ids\)/);
  assert.match(backup, /stageRecurringInstances\(tables\.recurring_expense_instances\)/);
  assert.match(backup, /insert the transactions, then restore confirmed state/);
  assert.match(backup, /\.upsert\(chunk, \{ onConflict: 'id' \}\)/);
  assert.match(backup, /下载完整云端备份/);
});
