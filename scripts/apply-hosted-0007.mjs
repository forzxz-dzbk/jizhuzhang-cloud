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
const migration = await readFile(new URL('../supabase/migrations/0007_realtime_goal_settings.sql', import.meta.url), 'utf8');

async function inspect() {
  const publicationAvailable = await client.query(`select exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') as available`);
  if (!publicationAvailable.rows[0].available) return { available: false, published: true };
  const membership = await client.query(`select exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='business_daily_goal_settings') as published`);
  return { available: true, ...membership.rows[0] };
}

try {
  await client.connect();
  console.log(`已连接目标项目 ${projectRef}（${url.hostname}）。仅检查表/视图/安全策略结构，不读取账目。`);
  const before = await inspect();
  if (before.published) {
    console.log(before.available ? '0007 已应用：每日目标设置已加入 Realtime publication；无需重跑。' : '0007 无需执行：此项目没有 supabase_realtime publication。');
  } else {
    await client.query(migration);
    const after = await inspect();
    if (!after.published) {
      throw new Error('执行后未发现目标表已加入 Realtime publication；请勿盲目重跑。');
    }
    console.log('0007 成功：每日目标设置已加入 Realtime publication；未读取账目数据。');
  }
} catch (error) {
  const message = String(error.message ?? error).replace(connectionString, '[数据库连接已隐藏]');
  console.error(`0007 未确认成功：${error.code ?? 'ERROR'} ${message}`);
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' && !caCertificatePath) {
    console.error('TLS 验证未通过。请为本项目配置受信任的 Supabase 根证书；不要关闭证书校验。');
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
