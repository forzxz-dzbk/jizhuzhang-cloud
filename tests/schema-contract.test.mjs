import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/0001_cloud_foundation.sql', import.meta.url), 'utf8').toLowerCase();
test('separate personal and business ledgers', () => { assert.ok(sql.includes("kind in ('personal','business')")); assert.ok(sql.includes('unique (owner_id, kind)')); });
test('owner RLS exists on all data tables', () => { for (const t of ['ledgers','accounts','categories','business_orders','recurring_expenses','recurring_expense_instances','transactions']) assert.ok(sql.includes(`alter table public.${t} enable row level security`), t); assert.ok(sql.includes('auth.uid()')); });
test('exclude transfers and gate recurring expenses on confirmation', () => { assert.ok(sql.includes("where type <> 'transfer'")); assert.ok(sql.includes("i.status = 'confirmed'")); assert.ok(sql.includes("status = 'pending' and transaction_id is null")); });
test('daily target uses order date, refund date, and 500 threshold', () => { assert.ok(sql.includes('o.order_date as day')); assert.ok(sql.includes("where t.type='income'")); assert.ok(sql.includes("where type='refund'")); assert.ok(sql.includes('sum(delta) >= 500')); });
