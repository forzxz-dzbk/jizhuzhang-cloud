import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runner = await readFile(new URL('../scripts/apply-hosted-0003.mjs', import.meta.url), 'utf8');
const launcher = await readFile(new URL('../scripts/apply-hosted-0003.ps1', import.meta.url), 'utf8');
const savingsRunner = await readFile(new URL('../scripts/apply-hosted-0004.mjs', import.meta.url), 'utf8');
const savingsLauncher = await readFile(new URL('../scripts/apply-hosted-0004.ps1', import.meta.url), 'utf8');

test('hosted 0003 runner is pinned to the intended project, pooler and one migration', () => {
  assert.match(runner, /eexsbypxhkfxqazwqgdq/);
  assert.match(runner, /\.pooler\.supabase\.com/);
  assert.match(runner, /0003_daily_goal_by_received_date\.sql/);
  assert.doesNotMatch(runner, /0001_cloud_foundation\.sql|0002_business_order_costs_and_types\.sql/);
});

test('hosted 0003 runner preflights schema and verifies receipt-date view/security after apply', () => {
  assert.match(runner, /order_date/);
  assert.match(runner, /revenue_date/);
  assert.match(runner, /security_invoker=true/);
  assert.match(runner, /await client\.query\(migration\)/);
});

test('hosted 0003 PowerShell launcher reads the connection URI without echo or file persistence', () => {
  assert.match(launcher, /Read-Host .* -AsSecureString/);
  assert.match(launcher, /JZZ_SUPABASE_POOLER_URL/);
  assert.match(launcher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
  assert.match(launcher, /ZeroFreeBSTR/);
});

test('hosted 0004 runner is project-pinned, additive, idempotent, and verifies owner RLS protections', () => {
  assert.match(savingsRunner, /eexsbypxhkfxqazwqgdq/);
  assert.match(savingsRunner, /\.pooler\.supabase\.com/);
  assert.match(savingsRunner, /0004_savings_goals\.sql/);
  assert.match(savingsRunner, /relrowsecurity/);
  assert.match(savingsRunner, /savings_goals_owner_all/);
  assert.match(savingsRunner, /savings_goals_personal_ledger_guard/);
  assert.match(savingsRunner, /replace\(connectionString, '\[数据库连接已隐藏\]'\)/);
  assert.doesNotMatch(savingsRunner, /0001_cloud_foundation\.sql|0002_business_order_costs_and_types\.sql|0003_daily_goal_by_received_date\.sql/);
});

test('hosted 0004 launcher accepts the pooler URI only through a hidden prompt and clears it afterward', () => {
  assert.match(savingsLauncher, /Read-Host .* -AsSecureString/);
  assert.match(savingsLauncher, /Get-Command node\.exe/);
  assert.match(savingsLauncher, /& \$node\.Source \$runner/);
  assert.doesNotMatch(savingsLauncher, /pnpm/);
  assert.match(savingsLauncher, /JZZ_SUPABASE_POOLER_URL/);
  assert.match(savingsLauncher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
  assert.match(savingsLauncher, /ZeroFreeBSTR/);
});
