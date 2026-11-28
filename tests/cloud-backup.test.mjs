import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cloud backup exports every ledger table through the authenticated client with paging and explicit errors', async () => {
  const backup = await readFile(new URL('../src/CloudBackup.tsx', import.meta.url), 'utf8');
  const core = await readFile(new URL('../src/cloud-backup-core.mjs', import.meta.url), 'utf8');
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  for (const table of ['ledgers', 'accounts', 'categories', 'business_orders', 'recurring_expenses', 'transactions', 'recurring_expense_instances', 'savings_goals', 'business_daily_goal_settings']) {
    assert.match(core, new RegExp(`'${table}'`));
  }
  assert.match(core, /\.range\(start, start \+ pageSize - 1\)/);
  assert.match(core, /format: 'jizhuzhang-cloud-backup'/);
  assert.match(backup, /createCloudBackup\(supabase, session\.user\.id\)/);
  assert.match(backup, /restoreCloudBackup\(client, session\.user\.id/);
  assert.ok(home.includes('<CloudBackup session={session} />'));
  assert.match(backup, /未确认的固定支出仍保持待确认状态/);
  assert.match(core, /只能恢复此账号导出的备份/);
  assert.match(core, /为避免覆盖或混合现有数据，恢复仅允许/);
  assert.match(backup, /window\.confirm/);
  assert.match(core, /\.insert\(chunk\)/);
  assert.match(core, /已尝试撤销本次写入/);
  assert.match(core, /\.delete\(\)\.in\('id', ids\)/);
  assert.match(core, /stageRecurringInstances\(tables\.recurring_expense_instances\)/);
  assert.match(core, /stage instances, insert transactions, then finalize confirmation state/);
  assert.match(core, /\.upsert\(chunk, \{ onConflict: 'id' \}\)/);
  assert.match(backup, /下载完整云端备份/);
  assert.match(backup, /存钱目标/);
  assert.match(core, /Backward-compatible with version-1 exports/);
});
