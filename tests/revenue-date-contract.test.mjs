import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/RevenueCalendar.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/0003_daily_goal_by_received_date.sql', import.meta.url), 'utf8');
const realtimeMigration = readFileSync(new URL('../supabase/migrations/0007_realtime_goal_settings.sql', import.meta.url), 'utf8');

test('revenue calendar queries, filters, and labels by actual receipt date', () => {
  assert.match(ui, /type RevenueDay = \{ revenue_date:/);
  assert.match(ui, /select\('revenue_date,revenue,goal_enabled,goal_amount,goal_reached,has_revenue_record'\)/);
  assert.match(ui, /gte\('revenue_date', from\)\.lte\('revenue_date', to\)/);
  assert.match(ui, /按实际到账日期|实际到账/);
  assert.match(ui, /business_daily_goal_settings/);
  assert.match(ui, /table:'business_daily_goal_settings',filter:`ledger_id=eq\.\$\{ledgerId\}`/);
  assert.match(ui, /loadGoalSetting\(\);void refresh\(\)/);
  assert.match(ui, /effective_on: today/);
  assert.match(ui, /开启每日目标/);
  assert.match(ui, /过往日期保持原记录/);
  assert.match(migration, /t\.occurred_on as revenue_date/);
  assert.match(migration, /create view public\.business_daily_revenue with \(security_invoker = true\)/);
  assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.business_daily_goal_settings/);
  assert.match(realtimeMigration, /not exists \([\s\S]*tablename = 'business_daily_goal_settings'/);
});
