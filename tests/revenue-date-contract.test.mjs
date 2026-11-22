import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/RevenueCalendar.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/0003_daily_goal_by_received_date.sql', import.meta.url), 'utf8');

test('revenue calendar queries, filters, and labels by actual receipt date', () => {
  assert.match(ui, /type RevenueDay = \{ revenue_date:/);
  assert.match(ui, /select\('revenue_date,revenue,goal_reached,has_revenue_record'\)/);
  assert.match(ui, /gte\('revenue_date', from\)\.lte\('revenue_date', to\)/);
  assert.match(ui, /按实际到账日期/);
  assert.match(migration, /t\.occurred_on as revenue_date/);
  assert.match(migration, /create view public\.business_daily_revenue with \(security_invoker = true\)/);
});
