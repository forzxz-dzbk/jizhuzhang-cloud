import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/0008_edit_delete_transactions.sql', import.meta.url), 'utf8');

test('transaction rows expose edit/delete and Shanghai date-time editing', () => {
  assert.match(ui, /onClick=\{\(\)=>\{setError\(''\);setEditingTransaction\(row\);\}\}>修改/);
  assert.match(ui, /onClick=\{\(\)=>void deleteTransaction\(row\)\}>删除/);
  assert.match(ui, /type="datetime-local" step="60"/);
  assert.match(ui, /new Date\(`\$\{shanghaiLocal\}:00\+08:00`\)/);
  assert.match(ui, /rpc\('update_transaction'/);
  assert.match(ui, /rpc\('delete_transaction'/);
  assert.match(ui, /formatShanghaiTimestamp\(row\.occurred_at\)/);
});

test('transaction RPCs enforce owner, type, refund, and recurring invariants', () => {
  assert.match(migration, /add column if not exists occurred_at timestamptz/);
  assert.match(migration, /at time zone 'Asia\/Shanghai'\)::date/);
  assert.match(migration, /l\.owner_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /category unavailable for transaction type/);
  assert.match(migration, /refund exceeds original received amount/);
  assert.match(migration, /income amount cannot be lower than existing refunds/);
  assert.match(migration, /delete linked refunds before deleting the original business income/);
  assert.match(migration, /status='pending',transaction_id=null,confirmed_at=null/);
  assert.match(migration, /revoke all on function public\.update_transaction[\s\S]*from public,anon/);
  assert.match(migration, /grant execute on function public\.delete_transaction\(uuid\) to authenticated/);
});
