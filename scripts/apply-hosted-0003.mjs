import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const projectRef = 'eexsbypxhkfxqazwqgdq';
const connectionString = process.env.JZZ_SUPABASE_POOLER_URL;
if (!connectionString) {
  console.error('未提供临时数据库连接。请通过配套 PowerShell 启动脚本输入。');
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

const client = new Client({ connectionString, ssl: { rejectUnauthorized: true } });
const migrationPath = new URL('../supabase/migrations/0003_daily_goal_by_received_date.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');

async function inspect() {
  const columns = await client.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='business_daily_revenue'
  `);
  const options = await client.query(`
    select coalesce(reloptions::text, '') as options
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='business_daily_revenue' and c.relkind='v'
  `);
  const names = new Set(columns.rows.map(row => row.column_name));
  return { names, securityInvoker: options.rows[0]?.options.includes('security_invoker=true') ?? false };
}

try {
  await client.connect();
  console.log(`已连接目标项目 ${projectRef}（${url.hostname}）。只检查结构，不读取账目。`);
  const before = await inspect();
  if (before.names.has('revenue_date')) {
    if (!before.securityInvoker) throw new Error('revenue_date 已存在，但视图缺少 security_invoker=true；停止自动处理。');
    console.log('0003 已应用：revenue_date 与 security_invoker=true 均已核实；无需重跑。');
    process.exitCode = 0;
  } else {
    if (!before.names.has('order_date') || !before.securityInvoker) {
      throw new Error('现有视图结构与预期不符；未执行迁移。');
    }
    await client.query(migration);
    const after = await inspect();
    if (!after.names.has('revenue_date') || after.names.has('order_date') || !after.securityInvoker) {
      throw new Error('执行后结构核验失败，请勿重复运行；检查后端数据库日志。');
    }
    console.log('0003 成功：视图已按实际到账日输出 revenue_date；security_invoker=true；未读取或写入账目数据。');
  }
} catch (error) {
  console.error(`0003 未确认成功：${error.code ?? 'ERROR'} ${String(error.message ?? error).replace(connectionString, '[数据库连接已隐藏]')}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
