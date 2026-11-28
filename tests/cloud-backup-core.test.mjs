import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TABLES, createCloudBackup, readAllRows, restoreCloudBackup, validateCloudBackup } from '../src/cloud-backup-core.mjs';

function emptyTables() { return Object.fromEntries(BACKUP_TABLES.map(table => [table, []])); }
function mockClient({ pages = {}, existing = null, failInsert = null, failUpsert = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select() { return {
          range: async (start, end) => ({ data: (pages[table] ?? []).slice(start, end + 1), error: null }),
          limit: async () => ({ data: existing === table ? [{ id: 'existing' }] : [], error: null }),
        }; },
        insert: async rows => { calls.push({ op: 'insert', table, rows }); return failInsert === table ? { error: { message: 'injected failure' } } : { error: null }; },
        upsert: async (rows, options) => { calls.push({ op: 'upsert', table, rows, options }); return failUpsert ? { error: { message: 'injected failure' } } : { error: null }; },
        delete() { return { in: async (column, ids) => { calls.push({ op: 'delete', table, column, ids }); return { error: null }; } }; },
      };
    },
  };
}

test('backup export reads all pages and produces a stable owner/timezone envelope', async () => {
  const client = mockClient({ pages: { ledgers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } });
  const rows = await readAllRows(client, 'ledgers', 2);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  const backup = await createCloudBackup(client, 'owner-1', new Date('2026-11-28T00:00:00Z'));
  assert.equal(backup.owner_id, 'owner-1');
  assert.equal(backup.timezone, 'Asia/Shanghai');
  assert.equal(backup.exported_at, '2026-11-28T00:00:00.000Z');
  assert.deepEqual(backup.tables.ledgers, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.deepEqual(Object.keys(backup.tables).sort(), [...BACKUP_TABLES].sort());
});

test('restore validates account ownership, legacy goal-setting omission, and empty-account guard', async () => {
  const legacy = { format: 'jizhuzhang-cloud-backup', version: 1, owner_id: 'owner-1', tables: emptyTables() };
  delete legacy.tables.business_daily_goal_settings;
  assert.deepEqual(validateCloudBackup(legacy, 'owner-1').business_daily_goal_settings, []);
  assert.throws(() => validateCloudBackup(legacy, 'other-owner'), /所属账号不匹配/);
  const wrongLedgerOwner = structuredClone(legacy); wrongLedgerOwner.tables.ledgers = [{ id: 'l1', owner_id: 'other-owner' }];
  assert.throws(() => validateCloudBackup(wrongLedgerOwner, 'owner-1'), /账本所属账号不一致/);
  const client = mockClient({ existing: 'transactions' });
  let asked = false;
  await assert.rejects(restoreCloudBackup(client, 'owner-1', legacy, () => { asked = true; return true; }), /仅允许在此账号所有账本均为空/);
  assert.equal(asked, false);
  assert.equal(client.calls.length, 0);
});

test('restore stages confirmed recurring rows, restores dependencies in order, then finalizes them', async () => {
  const backup = { format: 'jizhuzhang-cloud-backup', version: 1, owner_id: 'owner-1', tables: emptyTables() };
  backup.tables.ledgers = [{ id: 'l1', owner_id: 'owner-1' }];
  backup.tables.recurring_expense_instances = [{ id: 'ri1', status: 'confirmed', transaction_id: 'tx1', confirmed_at: '2026-11-01T00:00:00Z' }];
  backup.tables.transactions = [{ id: 'tx1', recurring_instance_id: 'ri1' }];
  const client = mockClient();
  const count = await restoreCloudBackup(client, 'owner-1', backup, total => total === 3);
  assert.equal(count, 3);
  const writes = client.calls.filter(call => call.op === 'insert' || call.op === 'upsert');
  assert.deepEqual(writes.map(call => `${call.op}:${call.table}`), ['insert:ledgers', 'insert:recurring_expense_instances', 'insert:transactions', 'upsert:recurring_expense_instances']);
  assert.deepEqual(writes[1].rows[0], { id: 'ri1', status: 'pending', transaction_id: null, confirmed_at: null });
  assert.equal(writes[3].rows[0].status, 'confirmed');
});

test('restore compensates successful writes in reverse dependency order after a later table fails', async () => {
  const backup = { format: 'jizhuzhang-cloud-backup', version: 1, owner_id: 'owner-1', tables: emptyTables() };
  backup.tables.ledgers = [{ id: 'l1', owner_id: 'owner-1' }];
  backup.tables.recurring_expense_instances = [{ id: 'ri1', status: 'pending', transaction_id: null }];
  backup.tables.transactions = [{ id: 'tx1', recurring_instance_id: 'ri1' }];
  const client = mockClient({ failInsert: 'transactions' });
  await assert.rejects(restoreCloudBackup(client, 'owner-1', backup, () => true), /已尝试撤销本次写入：transactions写入失败/);
  assert.deepEqual(client.calls.filter(call => call.op === 'delete').map(call => call.table), ['recurring_expense_instances', 'ledgers']);
  assert.deepEqual(client.calls.filter(call => call.op === 'delete').map(call => call.ids), [['ri1'], ['l1']]);
});
