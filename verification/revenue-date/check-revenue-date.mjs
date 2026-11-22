import { PGlite } from '@electric-sql/pglite';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const candidate = process.argv[2];
const applyCandidate = Boolean(candidate && existsSync(candidate));
const db = new PGlite();
const uid = '11111111-1111-4111-8111-111111111111';

try {
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create role anon;
    create role authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const core = await readFile(new URL('../../supabase/migrations/0001_cloud_foundation.sql', import.meta.url), 'utf8');
  await db.exec(core.replace('create extension if not exists pgcrypto;', ''));
  const business = await readFile(new URL('../../supabase/migrations/0002_business_order_costs_and_types.sql', import.meta.url), 'utf8');
  await db.exec(business);
  if (applyCandidate) await db.exec(await readFile(candidate, 'utf8'));

  await db.exec(`insert into auth.users values ('${uid}');
    select set_config('request.jwt.claim.sub','${uid}',false);
    set role authenticated;
    insert into public.ledgers(owner_id,kind,name) values(auth.uid(),'business','业务');`);
  const ledger = (await db.query("select id from public.ledgers where kind='business'")).rows[0].id;
  const account = (await db.query(`insert into public.accounts(ledger_id,name) values('${ledger}','收款') returning id`)).rows[0].id;
  const category = (await db.query(`insert into public.categories(ledger_id,name,flow) values('${ledger}','收入','income') returning id`)).rows[0].id;
  await db.exec(`select public.create_transaction('33333333-3333-4333-8333-333333333333','${ledger}','income','${account}',500,'2026-11-18','', '${category}',null,'2026-11-17','延迟到账订单',null);`);
  const rows = (await db.query(`select ${applyCandidate ? 'revenue_date::text' : 'order_date::text'} as revenue_date,revenue,goal_reached from public.business_daily_revenue where ledger_id='${ledger}' order by 1`)).rows;
  console.log(JSON.stringify({ input: { receivedOn: '2026-11-18', orderDate: '2026-11-17', amount: 500 }, revenueDays: rows }));
} finally {
  await db.close();
}
