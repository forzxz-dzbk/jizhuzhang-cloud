import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon;
    create role authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const migration = await readFile(new URL('../supabase/migrations/0001_cloud_foundation.sql', import.meta.url), 'utf8');
  await db.exec(migration.replace('create extension if not exists pgcrypto;', ''));
  const businessMigration = await readFile(new URL('../supabase/migrations/0002_business_order_costs_and_types.sql', import.meta.url), 'utf8');
  await db.exec(businessMigration);
  await db.exec(`insert into auth.users values ('${userA}'),('${userB}');`);
  await db.exec(`select set_config('request.jwt.claim.sub','${userA}',false); set role authenticated;
    insert into public.ledgers(owner_id,kind,name) values (auth.uid(),'personal','生活');`);
  const aCount = await db.query('select count(*)::int as n from public.ledgers');
  assert.equal(aCount.rows[0].n, 1, 'user A can see own ledger');
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${userB}',false); set role authenticated;`);
  const bCount = await db.query('select count(*)::int as n from public.ledgers');
  assert.equal(bCount.rows[0].n, 0, 'user B cannot see user A ledger');
  let denied = false;
  try { await db.exec(`insert into public.ledgers(owner_id,kind,name) values ('${userA}','business','越权');`); }
  catch { denied = true; }
  assert.ok(denied, 'RLS rejects cross-account write');
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${userA}',false); set role authenticated;
    insert into public.ledgers(owner_id,kind,name) values (auth.uid(),'business','业务') returning id;`);
  const business = (await db.query("select id from public.ledgers where kind='business'")).rows[0].id;
  const account = (await db.query(`insert into public.accounts(ledger_id,name) values ('${business}','收款账户') returning id`)).rows[0].id;
  const category = (await db.query(`insert into public.categories(ledger_id,name,flow) values ('${business}','服务收入','income') returning id`)).rows[0].id;
  const requestId = '33333333-3333-4333-8333-333333333333';
  const request = `select public.create_transaction('${requestId}','${business}','income','${account}',500,'2026-11-18','', '${category}',null,'2026-11-17','订单')`;
  await db.exec(`${request}; ${request};`);
  const orderCount = await db.query("select count(*)::int as n from public.business_orders where title='订单'");
  assert.equal(orderCount.rows[0].n, 1, 'retry uses same idempotency key and does not duplicate order');
  const target = await db.query(`select revenue,goal_reached from public.business_daily_revenue where ledger_id='${business}'`);
  assert.equal(Number(target.rows[0].revenue), 500);
  assert.equal(target.rows[0].goal_reached, true, 'order-date goal at 500 is achieved');
  const orderId = (await db.query("select id from public.business_orders where title='订单'")).rows[0].id;
  const refundId='55555555-5555-4555-8555-555555555555';
  const refundRequest=`select public.create_transaction('${refundId}','${business}','refund','${account}',100,'2026-11-19','',null,null,null,null,'${orderId}')`;
  await db.exec(`${refundRequest}; ${refundRequest};`);
  let refundTooLarge=false;
  try{await db.exec(`select public.create_transaction('66666666-6666-4666-8666-666666666666','${business}','refund','${account}',401,'2026-11-20','',null,null,null,null,'${orderId}')`)}catch{refundTooLarge=true;}
  assert.ok(refundTooLarge,'refund cannot exceed original received amount');
  const refundDay = await db.query(`select revenue,has_revenue_record from public.business_daily_revenue where ledger_id='${business}' and order_date='2026-11-19'`);
  assert.equal(Number(refundDay.rows[0].revenue), -100, 'refund reduces revenue on refund occurrence date');
  assert.equal(refundDay.rows[0].has_revenue_record, false, 'refund-only date is not counted as a revenue day');
  let invalid = false;
  try { await db.exec(`insert into public.business_orders(ledger_id,order_date,title) values ('${(await db.query("select id from public.ledgers where kind='personal'")).rows[0].id}','2026-11-18','bad');`); }
  catch { invalid = true; }
  assert.ok(invalid, 'business orders cannot enter the personal ledger');
  const recurring = (await db.query(`insert into public.recurring_expenses(ledger_id,name,amount,due_day)
    values ('${business}','场地固定费',100,31) returning id`)).rows[0].id;
  const expenseCategory=(await db.query(`insert into public.categories(ledger_id,name,flow) values ('${business}','经营成本','expense') returning id`)).rows[0].id;
  const generated1 = await db.query(`select public.generate_recurring_instances('${business}','2026-02-01') as n`);
  const generated2 = await db.query(`select public.generate_recurring_instances('${business}','2026-02-01') as n`);
  assert.equal(generated1.rows[0].n, 1, 'monthly pending instance generated once');
  assert.equal(generated2.rows[0].n, 0, 'repeat generation is idempotent');
  const instance = (await db.query(`select id from public.recurring_expense_instances where recurring_expense_id='${recurring}'`)).rows[0].id;
  assert.equal((await db.query(`select due_on::text from public.recurring_expense_instances where id='${instance}'`)).rows[0].due_on, '2026-02-28', 'day 31 clamps to February end');
  assert.equal((await db.query(`select count(*)::int as n from public.transaction_totals where ledger_id='${business}' and occurred_on='2026-02-28'`)).rows[0].n, 0, 'pending plan is not actual expense');
  const expenseRequest='44444444-4444-4444-8444-444444444444';
  const confirm=`select public.confirm_recurring_instance('${instance}','${expenseRequest}','${account}','${expenseCategory}',105,'2026-02-28','confirmed bill')`;
  await db.exec(`${confirm}; ${confirm};`);
  const actual=(await db.query(`select expense from public.transaction_totals where ledger_id='${business}' and occurred_on='2026-02-28'`)).rows[0];
  assert.equal(Number(actual.expense),105,'only confirmed actual amount is counted once');

  const orderIncomeRequest='99999999-9999-4999-8999-999999999991';
  const orderIncome=`select public.create_business_income('${orderIncomeRequest}','${business}','${account}',400,'2026-11-20','','${category}','2026-11-20','代运营项目','内容服务')`;
  await db.exec(`${orderIncome}; ${orderIncome};`);
  const trackedOrder=(await db.query(`select id from public.business_orders where title='代运营项目'`)).rows[0].id;
  const costRequest='99999999-9999-4999-8999-999999999992';
  const cost=`select public.create_business_cost('${costRequest}','${business}','${account}',150,'2026-11-20','外包成本','${expenseCategory}','${trackedOrder}')`;
  await db.exec(`${cost}; ${cost};`);
  let mismatchedCostRetryRejected=false;
  try { await db.exec(`select public.create_business_cost('${costRequest}','${business}','${account}',151,'2026-11-20','外包成本','${expenseCategory}','${trackedOrder}')`); }
  catch { mismatchedCostRetryRejected=true; }
  assert.ok(mismatchedCostRetryRejected,'business cost retry with changed amount cannot overwrite the original request');
  const refundTracked=`select public.create_transaction('99999999-9999-4999-8999-999999999993','${business}','refund','${account}',100,'2026-11-21','',null,null,null,null,'${trackedOrder}')`;
  await db.exec(refundTracked);
  const orderStats=(await db.query(`select business_type,gross_revenue,refunds,actual_revenue,allocated_cost,operating_surplus from public.business_order_totals where id='${trackedOrder}'`)).rows[0];
  assert.equal(orderStats.business_type,'内容服务','each order retains its business type');
  assert.equal(Number(orderStats.gross_revenue),400);
  assert.equal(Number(orderStats.refunds),100);
  assert.equal(Number(orderStats.actual_revenue),300);
  assert.equal(Number(orderStats.allocated_cost),150);
  assert.equal(Number(orderStats.operating_surplus),150,'order surplus = actual receipts less refunds and allocated costs');
  const personalLedger=(await db.query(`select id from public.ledgers where kind='personal'`)).rows[0].id;
  let businessTypeInPersonalRejected=false;
  try { await db.exec(`select public.create_business_income('99999999-9999-4999-8999-999999999994','${personalLedger}','${account}',10,'2026-11-20','','${category}','2026-11-20','非法订单','非法')`); }
  catch { businessTypeInPersonalRejected=true; }
  assert.ok(businessTypeInPersonalRejected,'business orders cannot enter personal ledgers');

  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false); set role authenticated;`);
  const recoveryLedger=(await db.query(`insert into public.ledgers(owner_id,kind,name) values (auth.uid(),'business','恢复验证账本') returning id`)).rows[0].id;
  const recoveryAccount=(await db.query(`insert into public.accounts(ledger_id,name) values ('${recoveryLedger}','恢复验证账户') returning id`)).rows[0].id;
  const recoveryCategory=(await db.query(`insert into public.categories(ledger_id,name,flow) values ('${recoveryLedger}','恢复验证支出','expense') returning id`)).rows[0].id;
  const recoveryTemplate=(await db.query(`insert into public.recurring_expenses(ledger_id,name,amount,due_day) values ('${recoveryLedger}','恢复验证固定费',105,1) returning id`)).rows[0].id;
  const recoveryInstance='77777777-7777-4777-8777-777777777777';
  const recoveryTransaction='88888888-8888-4888-8888-888888888888';
  await db.exec(`insert into public.recurring_expense_instances(id,ledger_id,recurring_expense_id,due_on,status) values ('${recoveryInstance}','${recoveryLedger}','${recoveryTemplate}','2026-11-01','pending');
    insert into public.transactions(id,ledger_id,account_id,category_id,recurring_instance_id,type,amount,occurred_on,note) values ('${recoveryTransaction}','${recoveryLedger}','${recoveryAccount}','${recoveryCategory}','${recoveryInstance}','expense',105,'2026-11-01','restored expense');
    update public.recurring_expense_instances set status='confirmed',transaction_id='${recoveryTransaction}',confirmed_at=now() where id='${recoveryInstance}';`);
  const restored=(await db.query(`select i.status,t.recurring_instance_id from public.recurring_expense_instances i join public.transactions t on t.id=i.transaction_id where i.id='${recoveryInstance}'`)).rows[0];
  assert.equal(restored.status,'confirmed','restored recurring instance returns to its confirmed state after transaction insertion');
  assert.equal(restored.recurring_instance_id,recoveryInstance,'restored transaction and instance preserve their reciprocal references');
  console.log('PASS migrations 0001-0002/RLS; split ledgers; order-date revenue/refund; idempotent income/cost; business-type isolation; order actual revenue/cost/surplus; monthly pending generation; pending exclusion; confirmed expense retry; cycle-safe restore.');
} finally { await db.close(); }
