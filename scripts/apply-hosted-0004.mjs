import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const projectRef = 'eexsbypxhkfxqazwqgdq';
const connectionString = process.env.JZZ_SUPABASE_POOLER_URL;
const caCertificatePath = process.env.JZZ_SUPABASE_CA_CERT_PATH;
if (!connectionString) { console.error('未提供临时数据库连接。请通过配套 PowerShell 启动脚本输入。'); process.exit(2); }
const url = new URL(connectionString);
const username = decodeURIComponent(url.username);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.pooler.supabase.com') || !username.includes(projectRef) || url.pathname !== '/postgres') {
  console.error('目标校验失败：必须使用「记祝账」项目的 Session Pooler URI；未连接任何数据库。'); process.exit(2);
}
const ssl = { rejectUnauthorized: true };
if (caCertificatePath) ssl.ca = await readFile(caCertificatePath);
const client = new Client({ connectionString, ssl });
const sql = await readFile(new URL('../supabase/migrations/0004_savings_goals.sql', import.meta.url), 'utf8');
async function inspect() {
  const result = await client.query(`select c.relrowsecurity, exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename='savings_goals' and p.policyname='savings_goals_owner_all') as policy, exists(select 1 from pg_trigger t join pg_class c2 on c2.oid=t.tgrelid join pg_namespace n on n.oid=c2.relnamespace where n.nspname='public' and c2.relname='savings_goals' and t.tgname='savings_goals_personal_ledger_guard' and not t.tgisinternal) as trigger from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='savings_goals' and c.relkind='r'`);
  return result.rows[0] ?? null;
}
try {
  await client.connect();
  console.log(`已连接目标项目 ${projectRef}（${url.hostname}）。仅核验结构，不读取账目。`);
  const before = await inspect();
  if (before) {
    if (!before.relrowsecurity || !before.policy || !before.trigger) throw new Error('表已存在但 RLS/策略/触发器不完整；停止自动处理。');
    console.log('0004 已应用：储蓄目标表、RLS、所有者策略和个人账本触发器均已核实；无需重跑。');
  } else {
    await client.query(sql);
    const after = await inspect();
    if (!after?.relrowsecurity || !after.policy || !after.trigger) throw new Error('执行后结构核验失败，请勿重复运行；先检查数据库状态。');
    console.log('0004 成功：表、RLS、所有者策略和个人账本触发器已核实；未读取账目数据。');
  }
} catch (error) {
  console.error(`0004 未确认成功：${error.code ?? 'ERROR'} ${String(error.message ?? error).replace(connectionString, '[数据库连接已隐藏]')}`);
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' && !caCertificatePath) console.error('TLS 未验证通过。请从「记祝账」项目 Database Settings > SSL Configuration 下载服务器根证书到 supabase/server-ca.crt，再重试；请勿关闭证书校验。');
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
