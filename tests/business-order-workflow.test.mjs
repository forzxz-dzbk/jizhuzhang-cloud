import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('business orders persist business type, link real expenses and expose actual revenue and operating surplus', async () => {
  const migration = await readFile(new URL('../supabase/migrations/0002_business_order_costs_and_types.sql', import.meta.url), 'utf8');
  const home = await readFile(new URL('../src/LedgerHome.tsx', import.meta.url), 'utf8');
  const statistics = await readFile(new URL('../src/BusinessOrderStatistics.tsx', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists business_type text/);
  assert.match(migration, /set business_type='未分类'/);
  assert.match(migration, /add column if not exists cost_order_id uuid/);
  assert.match(migration, /create or replace function public\.create_business_income/);
  assert.match(migration, /create or replace function public\.create_business_cost/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /create or replace view public\.business_order_totals/);
  assert.match(migration, /operating_surplus/);
  assert.match(home, /rpcName = 'create_business_income'/);
  assert.match(home, /rpcName = 'create_business_cost'/);
  assert.match(home, /name="businessType" required/);
  assert.match(home, /name="costOrder"/);
  assert.match(statistics, /business_order_totals/);
  assert.match(statistics, /business_type/);
  assert.match(statistics, /暂不填充示例数据/);
});
