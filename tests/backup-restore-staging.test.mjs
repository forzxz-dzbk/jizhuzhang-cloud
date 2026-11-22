import test from 'node:test';
import assert from 'node:assert/strict';
import { stageRecurringInstances } from '../src/backup-restore.mjs';

test('confirmed recurring instances stage as pending and are finalized only after restoring transactions', () => {
  const confirmed = { id: 'instance-confirmed', status: 'confirmed', transaction_id: 'tx-1', confirmed_at: '2026-11-01T00:00:00Z' };
  const pending = { id: 'instance-pending', status: 'pending', transaction_id: null, confirmed_at: null };
  const staged = stageRecurringInstances([confirmed, pending]);
  assert.deepEqual(staged, [
    { ...confirmed, status: 'pending', transaction_id: null, confirmed_at: null },
    pending,
  ]);
  assert.deepEqual(confirmed, { id: 'instance-confirmed', status: 'confirmed', transaction_id: 'tx-1', confirmed_at: '2026-11-01T00:00:00Z' }, 'staging does not mutate the original backup');
});
