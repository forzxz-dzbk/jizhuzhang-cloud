import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const projectRef = 'eexsbypxhkfxqazwqgdq';
const connectionString = process.env.JZZ_SUPABASE_POOLER_URL;
const caCertificatePath = process.env.JZZ_SUPABASE_CA_CERT_PATH;
if (!connectionString) {
  console.error('未提供临时数据库连接。请通过配套 PowerShell 启动脚本运行。');
  process.exit(2);
}

const url = new URL(connectionString);
const username = decodeURIComponent(url.username);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname.endsWith('.pooler.supabase.com') ||
    !username.includes(projectRef) || url.pathname !== '/postgres') {
  console.error('目标校验失败：必须使用「记祝账」项目的 Session Pooler URI；未连接任何数据库。');
  process.exit(2);
}

const ssl = { rejectUnauthorized: true };
if (caCertificatePath) ssl.ca = await readFile(caCertificatePath);
const client = new Client({ connectionString, ssl });
const migration = await readFile(new URL('../supabase/migrations/0006_optional_custom_daily_revenue_goal.sql', import.meta.url), 'utf8');

async function inspect() {
  const prereq = await client.query(`
    select
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_daily_revenue' and column_name='revenue_date') as has_revenue_date,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_orders' and column_name='business_type') as has_business_type,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='business_order_id') as has_order_link,
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='occurred_on') as has_occurred_on,
      exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='business_daily_revenue' and c.relkind='v' and coalesce(c.reloptions::text,'') like '%security_invoker=true%') as security_invoker
  `);
  const p = prereq.rows[0];
  if (!p.has_revenue_date || !p.has_business_type || !p.has_order_link || !p.has_occurred_on || !p.security_invoker) {
    throw new Error('基础前置结构未通过检查（需要 0003 与 0005）；未执行 0006。');
  }

  const result = await client.query(`
    select
      exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='business_daily_goal_settings' and c.relkind='r' and c.relrowsecurity) as table_rls,
      exists(select 1 from pg_policies where schemaname='public' and tablename='business_daily_goal_settings' and policyname='business_daily_goal_settings_owner_all') as owner_policy,
      exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='business_daily_goal_settings' and t.tgname='business_daily_goal_settings_history_guard' and not t.tgisinternal) as history_guard,
      (select count(*)=7 from information_schema.columns where table_schema='public' and table_name='business_daily_revenue' and column_name in ('ledger_id','revenue_date','revenue','goal_enabled','goal_amount','goal_reached','has_revenue_record')) as expected_view_columns,
      exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='business_daily_revenue' and c.relkind='v' and coalesce(c.reloptions::text,'') like '%security_invoker=true%') as view_security_invoker
  `);
  return result.rows[0];
}

try {
  await client.connect();
  console.log(`已连接目标项目 ${projectRef}（${url.hostname}）。仅检查表/视图/安全策略结构，不读取账目。`);
  const before = await inspect();
  if (before.table_rls && before.owner_policy && before.history_guard && before.expected_view_columns && before.view_security_invoker) {
    console.log('0006 已应用：目标设置表 RLS/所有者策略/历史保护及视图字段均已核实；无需重跑。');
  } else {
    await client.query(migration);
    const after = await inspect();
    if (!after.table_rls || !after.owner_policy || !after.history_guard || !after.expected_view_columns || !after.view_security_invoker) {
      throw new Error('执行后结构核验失败；请勿盲目重跑，先检查数据库结构。');
    }
    console.log('0006 成功：可选每日目标、RLS、所有者策略、历史保护和安全视图均已核实；未读取账目数据。');
  }
} catch (error) {
  const message = String(error.message ?? error).replace(connectionString, '[数据库连接已隐藏]');
  console.error(`0006 未确认成功：${error.code ?? 'ERROR'} ${message}`);
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' && !caCertificatePath) {
    console.error('TLS 验证未通过。请为本项目配置受信任的 Supabase 根证书；不要关闭证书校验。');
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
