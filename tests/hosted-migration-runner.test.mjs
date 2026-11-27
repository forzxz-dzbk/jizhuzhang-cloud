import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runner = await readFile(new URL('../scripts/apply-hosted-0003.mjs', import.meta.url), 'utf8');
const launcher = await readFile(new URL('../scripts/apply-hosted-0003.ps1', import.meta.url), 'utf8');
const savingsRunner = await readFile(new URL('../scripts/apply-hosted-0004.mjs', import.meta.url), 'utf8');
const savingsLauncher = await readFile(new URL('../scripts/apply-hosted-0004.ps1', import.meta.url), 'utf8');
const goalRunner = await readFile(new URL('../scripts/apply-hosted-0006.mjs', import.meta.url), 'utf8');
const goalLauncher = await readFile(new URL('../scripts/apply-hosted-0006.ps1', import.meta.url), 'utf8');
const realtimeGoalRunner = await readFile(new URL('../scripts/apply-hosted-0007.mjs', import.meta.url), 'utf8');
const realtimeGoalLauncher = await readFile(new URL('../scripts/apply-hosted-0007.ps1', import.meta.url), 'utf8');
const transactionRunner = await readFile(new URL('../scripts/apply-hosted-0008.mjs', import.meta.url), 'utf8');
const transactionLauncher = await readFile(new URL('../scripts/apply-hosted-0008.ps1', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

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
  assert.match(savingsRunner, /JZZ_SUPABASE_CA_CERT_PATH/);
  assert.match(savingsRunner, /rejectUnauthorized: true/);
  assert.match(savingsRunner, /SELF_SIGNED_CERT_IN_CHAIN/);
  assert.doesNotMatch(savingsRunner, /0001_cloud_foundation\.sql|0002_business_order_costs_and_types\.sql|0003_daily_goal_by_received_date\.sql/);
});

test('hosted 0004 launcher reads only a copied PostgreSQL URI and clears it afterward', () => {
  assert.equal(savingsLauncher.charCodeAt(0), 0xfeff, 'UTF-8 BOM keeps Windows PowerShell 5.1 Chinese strings parseable');
  assert.match(savingsLauncher, /Get-Clipboard -Raw/);
  assert.match(savingsLauncher, /IsNullOrWhiteSpace\(\$connectionString\)/);
  assert.match(savingsLauncher, /StartsWith\('postgres:\/\/'\)/);
  assert.match(savingsLauncher, /未连接数据库/);
  assert.doesNotMatch(savingsLauncher, /Read-Host/);
  assert.match(savingsLauncher, /Get-Command node\.exe/);
  assert.match(savingsLauncher, /codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node\.exe/);
  assert.match(savingsLauncher, /& \$nodePath --use-system-ca \$runner/);
  assert.doesNotMatch(savingsLauncher, /pnpm/);
  assert.match(savingsLauncher, /JZZ_SUPABASE_POOLER_URL/);
  assert.match(savingsLauncher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
  assert.match(savingsLauncher, /supabase\\server-ca\.crt/);
  assert.match(savingsLauncher, /supabase\\prod-ca-2021\.crt/);
  assert.match(savingsLauncher, /Remove-Item Env:JZZ_SUPABASE_CA_CERT_PATH/);
});

test('hosted 0006 goal migration command targets only the pinned project and verifies RLS/history safety', () => {
  assert.match(packageJson.scripts['db:apply-goal-migration'], /apply-hosted-0006\.ps1/);
  assert.match(goalRunner, /eexsbypxhkfxqazwqgdq/);
  assert.match(goalRunner, /\.pooler\.supabase\.com/);
  assert.match(goalRunner, /0006_optional_custom_daily_revenue_goal\.sql/);
  assert.match(goalRunner, /business_daily_goal_settings_owner_all/);
  assert.match(goalRunner, /business_daily_goal_settings_history_guard/);
  assert.match(goalRunner, /rejectUnauthorized: true/);
  assert.match(goalRunner, /JZZ_SUPABASE_CA_CERT_PATH/);
  assert.match(goalRunner, /has_revenue_date/);
  assert.match(goalRunner, /has_business_type/);
  assert.doesNotMatch(goalRunner, /0001_cloud_foundation\.sql|0002_business_order_costs_and_types\.sql|0003_daily_goal_by_received_date\.sql|0004_savings_goals\.sql|0005_shanghai_entry_time_optional_business_fields\.sql/);
  assert.equal(goalLauncher.charCodeAt(0), 0xfeff, 'UTF-8 BOM keeps Windows PowerShell 5.1 Chinese strings parseable');
  assert.match(goalLauncher, /postgres\.eexsbypxhkfxqazwqgdq/);
  assert.match(goalLauncher, /aws-1-ap-southeast-1\.pooler\.supabase\.com:5432\/postgres/);
  assert.match(goalLauncher, /apply-hosted-0006\.mjs/);
  assert.match(goalLauncher, /当前的 Database Password.*-AsSecureString/);
  assert.match(goalLauncher, /EscapeDataString\(\$plainPassword\)/);
  assert.match(goalLauncher, /ZeroFreeBSTR\(\$passwordPointer\)/);
  assert.doesNotMatch(goalLauncher, /Get-Clipboard|Read-Host .*Pooler URI/);
  assert.match(goalLauncher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
  assert.match(goalLauncher, /Remove-Item Env:JZZ_SUPABASE_CA_CERT_PATH/);
});

test('hosted 0007 command is project-pinned and only enables goal-setting realtime', () => {
  assert.match(packageJson.scripts['db:apply-realtime-goal'], /apply-hosted-0007\.ps1/);
  assert.match(realtimeGoalRunner, /eexsbypxhkfxqazwqgdq/);
  assert.match(realtimeGoalRunner, /0007_realtime_goal_settings\.sql/);
  assert.match(realtimeGoalRunner, /business_daily_goal_settings/);
  assert.match(realtimeGoalRunner, /supabase_realtime/);
  assert.match(realtimeGoalRunner, /rejectUnauthorized: true/);
  assert.match(realtimeGoalLauncher, /apply-hosted-0007\.mjs/);
  assert.match(realtimeGoalLauncher, /Read-Host .* -AsSecureString/);
  assert.match(realtimeGoalLauncher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
});

test('hosted 0008 transaction migration is project-pinned and verifies RLS-bound editing RPCs', () => {
  assert.match(packageJson.scripts['db:apply-transaction-management'], /apply-hosted-0008\.ps1/);
  assert.match(transactionRunner, /eexsbypxhkfxqazwqgdq/);
  assert.match(transactionRunner, /0008_edit_delete_transactions\.sql/);
  assert.match(transactionRunner, /update_transaction/);
  assert.match(transactionRunner, /delete_transaction/);
  assert.match(transactionRunner, /transactions_rls/);
  assert.match(transactionRunner, /has_function_privilege\('anon'/);
  assert.match(transactionRunner, /rejectUnauthorized: true/);
  assert.match(transactionLauncher, /apply-hosted-0008\.mjs/);
  assert.match(transactionLauncher, /Read-Host .* -AsSecureString/);
  assert.match(transactionLauncher, /Remove-Item Env:JZZ_SUPABASE_POOLER_URL/);
});
