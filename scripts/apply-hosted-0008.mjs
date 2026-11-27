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
const migration = await readFile(new URL('../supabase/migrations/0008_edit_delete_transactions.sql', import.meta.url), 'utf8');

async function inspect() {
  const result = await client.query(`
    select
      exists(select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='occurred_at' and is_nullable='NO') as has_occurrence_time,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='update_transaction' and pronargs=7) as has_update_rpc,
      exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='delete_transaction' and pronargs=1) as has_delete_rpc,
      exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='transactions' and c.relrowsecurity) as transactions_rls,
      has_function_privilege('authenticated','public.update_transaction(uuid,numeric,timestamp with time zone,uuid,uuid,uuid,text)','EXECUTE') as update_auth,
      has_function_privilege('anon','public.update_transaction(uuid,numeric,timestamp with time zone,uuid,uuid,uuid,text)','EXECUTE') as update_anon,
      has_function_privilege('authenticated','public.delete_transaction(uuid)','EXECUTE') as delete_auth,
      has_function_privilege('anon','public.delete_transaction(uuid)','EXECUTE') as delete_anon
  `);
  return result.rows[0];
}

try {
  await client.connect();
  console.log(`已连接目标项目 ${projectRef}（${url.hostname}）。仅检查表/视图/安全策略结构，不读取账目。`);
  const before = await inspect();
  if (before.has_occurrence_time && before.has_update_rpc && before.has_delete_rpc && before.transactions_rls && before.update_auth && !before.update_anon && before.delete_auth && !before.delete_anon) {
    console.log('0008 已应用：可编辑发生时间、受控编辑/删除 RPC、RLS 与授权边界均已核实；无需重跑。');
  } else {
    await client.query(migration);
    const after = await inspect();
    if (!(after.has_occurrence_time && after.has_update_rpc && after.has_delete_rpc && after.transactions_rls && after.update_auth && !after.update_anon && after.delete_auth && !after.delete_anon)) {
      throw new Error('执行后结构、RLS 或 RPC 授权核验失败；请勿盲目重跑。');
    }
    console.log('0008 成功：发生时间列、受控编辑/删除 RPC、RLS 与授权边界均已核实；未读取账目数据。');
  }
} catch (error) {
  const message = String(error.message ?? error).replace(connectionString, '[数据库连接已隐藏]');
  console.error(`0008 未确认成功：${error.code ?? 'ERROR'} ${message}`);
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' && !caCertificatePath) {
    console.error('TLS 验证未通过。请为本项目配置受信任的 Supabase 根证书；不要关闭证书校验。');
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
