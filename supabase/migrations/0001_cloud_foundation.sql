-- Candidate cloud foundation schema. Draft only: NOT applied to any database.
begin;
create extension if not exists pgcrypto;

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('personal','business')),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (owner_id, kind),
  unique (id, owner_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  opening_balance numeric(14,2) not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, ledger_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  flow text not null check (flow in ('income','expense')),
  parent_id uuid,
  is_archived boolean not null default false,
  unique (id, ledger_id),
  foreign key (parent_id, ledger_id) references public.categories(id, ledger_id)
);

create table public.business_orders (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  order_date date not null,
  title text not null check (length(trim(title)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (id, ledger_id)
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  amount numeric(14,2) not null check (amount > 0),
  due_day smallint not null default 1 check (due_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, ledger_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  account_id uuid not null,
  transfer_account_id uuid,
  category_id uuid,
  business_order_id uuid,
  refund_order_id uuid,
  type text not null check (type in ('income','expense','transfer','refund')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (id, ledger_id),
  foreign key (account_id, ledger_id) references public.accounts(id, ledger_id),
  foreign key (transfer_account_id, ledger_id) references public.accounts(id, ledger_id),
  foreign key (category_id, ledger_id) references public.categories(id, ledger_id),
  foreign key (business_order_id, ledger_id) references public.business_orders(id, ledger_id),
  foreign key (refund_order_id, ledger_id) references public.business_orders(id, ledger_id),
  check ((type = 'transfer' and transfer_account_id is not null and transfer_account_id <> account_id)
      or (type <> 'transfer' and transfer_account_id is null)),
  check ((type in ('income','expense') and category_id is not null)
      or (type in ('transfer','refund') and category_id is null)),
  check ((business_order_id is null or type = 'income') and (refund_order_id is null or type = 'refund'))
);
create unique index one_income_transaction_per_order
  on public.transactions(business_order_id) where business_order_id is not null;
create index refunds_by_order_date on public.transactions(refund_order_id, occurred_on) where type = 'refund';

-- Prevent business dimensions from being attached to a personal ledger, and require
-- every business income/refund to retain its order reference.
create function public.validate_transaction_ledger_context()
returns trigger language plpgsql set search_path = '' as $$
declare v_kind text;
begin
  select l.kind into v_kind from public.ledgers l where l.id = new.ledger_id;
  if v_kind = 'personal' and (new.business_order_id is not null or new.refund_order_id is not null or new.type = 'refund') then
    raise exception 'business order/refund is not allowed in a personal ledger' using errcode = '23514';
  end if;
  if v_kind = 'business' and new.type = 'income' and new.business_order_id is null then
    raise exception 'business income must reference an order' using errcode = '23514';
  end if;
  if v_kind = 'business' and new.type = 'refund' and new.refund_order_id is null then
    raise exception 'business refund must reference its original order' using errcode = '23514';
  end if;
  if new.recurring_instance_id is not null and new.type <> 'expense' then
    raise exception 'recurring expense instance must link an expense transaction' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger transactions_context_guard before insert or update on public.transactions
for each row execute function public.validate_transaction_ledger_context();

create function public.validate_business_order_ledger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.ledgers l where l.id = new.ledger_id and l.kind = 'business') then
    raise exception 'business order requires a business ledger' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger business_orders_ledger_guard before insert or update on public.business_orders
for each row execute function public.validate_business_order_ledger();

create table public.recurring_expense_instances (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  recurring_expense_id uuid not null,
  due_on date not null,
  status text not null default 'pending' check (status in ('pending','confirmed')),
  transaction_id uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, ledger_id),
  unique (recurring_expense_id, due_on),
  foreign key (recurring_expense_id, ledger_id) references public.recurring_expenses(id, ledger_id),
  foreign key (transaction_id, ledger_id) references public.transactions(id, ledger_id),
  check ((status = 'pending' and transaction_id is null and confirmed_at is null)
      or (status = 'confirmed' and transaction_id is not null and confirmed_at is not null))
);
create unique index one_instance_per_transaction
  on public.recurring_expense_instances(transaction_id) where transaction_id is not null;

alter table public.transactions add column recurring_instance_id uuid;
alter table public.transactions add constraint tx_recurring_instance_same_ledger
  foreign key (recurring_instance_id, ledger_id)
  references public.recurring_expense_instances(id, ledger_id);
create unique index one_transaction_per_recurring_instance
  on public.transactions(recurring_instance_id) where recurring_instance_id is not null;
alter table public.recurring_expense_instances add constraint recurring_tx_must_be_expense
  check (transaction_id is null or status = 'confirmed');

create function public.validate_confirmed_recurring_instance()
returns trigger language plpgsql set search_path = '' as $$
declare v_type text; v_instance uuid;
begin
  if new.status = 'confirmed' then
    select t.type, t.recurring_instance_id into v_type, v_instance
    from public.transactions t where t.id = new.transaction_id and t.ledger_id = new.ledger_id;
    if not found or v_type <> 'expense' or v_instance <> new.id then
      raise exception 'confirmed recurring instance must point to its linked expense transaction' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger recurring_instance_confirm_guard before insert or update on public.recurring_expense_instances
for each row execute function public.validate_confirmed_recurring_instance();

-- Statistics contract: transfers never affect income/expense totals. Pending recurring
-- instances are intentionally absent; only their linked confirmed expense enters totals.
create view public.transaction_totals with (security_invoker = true) as
select ledger_id, occurred_on,
       coalesce(sum(amount) filter (where type = 'income'), 0)::numeric(14,2) as income,
       coalesce(sum(amount) filter (where type in ('expense','refund')), 0)::numeric(14,2) as expense
from public.transactions
where type <> 'transfer'
  and (recurring_instance_id is null or exists (
    select 1 from public.recurring_expense_instances i
    where i.id = recurring_instance_id and i.status = 'confirmed'
  ))
group by ledger_id, occurred_on;

-- Daily target follows the confirmed product rule: business income is attributed to
-- order_date; this view intentionally returns recorded days only (A-02/A-08).
create view public.business_daily_revenue with (security_invoker = true) as
with daily as (
  select o.ledger_id, o.order_date as day, sum(t.amount) as delta, true as has_revenue_record
  from public.business_orders o join public.transactions t
    on t.business_order_id=o.id and t.ledger_id=o.ledger_id
  where t.type='income' group by o.ledger_id,o.order_date
  union all
  select ledger_id, occurred_on as day, -sum(amount) as delta, false as has_revenue_record
  from public.transactions where type='refund' group by ledger_id,occurred_on
)
select ledger_id, day as order_date, sum(delta)::numeric(14,2) as revenue,
       (sum(delta) >= 500)::boolean as goal_reached,
       bool_or(has_revenue_record) as has_revenue_record
from daily group by ledger_id,day;

alter table public.ledgers enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.business_orders enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.recurring_expense_instances enable row level security;
alter table public.transactions enable row level security;

create policy ledger_owner_all on public.ledgers for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy accounts_owner_all on public.accounts for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy categories_owner_all on public.categories for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy business_orders_owner_all on public.business_orders for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy recurring_expenses_owner_all on public.recurring_expenses for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy recurring_instances_owner_all on public.recurring_expense_instances for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));
create policy transactions_owner_all on public.transactions for all using (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid()))) with check (exists(select 1 from public.ledgers l where l.id=ledger_id and l.owner_id=(select auth.uid())));

revoke all on public.ledgers, public.accounts, public.categories, public.business_orders,
  public.recurring_expenses, public.recurring_expense_instances, public.transactions,
  public.transaction_totals, public.business_daily_revenue from anon, public;
grant select, insert, update, delete on public.ledgers, public.accounts, public.categories,
  public.business_orders, public.recurring_expenses, public.recurring_expense_instances,
  public.transactions to authenticated;
grant select on public.transaction_totals, public.business_daily_revenue to authenticated;

-- One atomic write path: a business order and its canonical income transaction
-- are committed together. The client submits a stable transaction UUID so retries
-- cannot create a second financial entry.
create function public.create_transaction(
  p_request_id uuid,
  p_ledger_id uuid,
  p_type text,
  p_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_note text default '',
  p_category_id uuid default null,
  p_transfer_account_id uuid default null,
  p_business_order_date date default null,
  p_business_order_title text default null,
  p_refund_order_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_kind text; v_order_id uuid; v_original numeric; v_refunded numeric; v_existing public.transactions%rowtype;
begin
  select l.kind into v_kind from public.ledgers l
  where l.id = p_ledger_id and l.owner_id = (select auth.uid());
  if not found then raise exception 'ledger unavailable' using errcode = '42501'; end if;
  if p_request_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid transaction request' using errcode = '22023';
  end if;
  select * into v_existing from public.transactions where id = p_request_id;
  if found then
    if v_existing.ledger_id = p_ledger_id and v_existing.type = p_type
      and v_existing.account_id = p_account_id and v_existing.amount = p_amount
      and v_existing.occurred_on = p_occurred_on then return p_request_id;
    end if;
    raise exception 'request id already used' using errcode = '23505';
  end if;
  if v_kind = 'business' and p_type = 'income' then
    if nullif(trim(p_business_order_title), '') is null or p_business_order_date is null then
      raise exception 'business income requires order title and date' using errcode = '22023';
    end if;
    insert into public.business_orders(ledger_id, order_date, title)
      values (p_ledger_id, p_business_order_date, trim(p_business_order_title)) returning id into v_order_id;
  elsif v_kind='business' and p_type='refund' then
    if p_refund_order_id is null then raise exception 'refund must reference its original order' using errcode='22023'; end if;
    select t.amount into v_original from public.transactions t
      where t.business_order_id=p_refund_order_id and t.ledger_id=p_ledger_id and t.type='income' for update;
    if not found then raise exception 'original business income unavailable' using errcode='23503'; end if;
    select coalesce(sum(t.amount),0) into v_refunded from public.transactions t
      where t.refund_order_id=p_refund_order_id and t.ledger_id=p_ledger_id and t.type='refund';
    if v_refunded + p_amount > v_original then raise exception 'refund exceeds original received amount' using errcode='23514'; end if;
  elsif p_business_order_title is not null or p_business_order_date is not null or p_refund_order_id is not null then
    raise exception 'order details are only valid for business income' using errcode = '22023';
  end if;
  insert into public.transactions(id, ledger_id, account_id, transfer_account_id,
    category_id, business_order_id, refund_order_id, type, amount, occurred_on, note)
  values (p_request_id, p_ledger_id, p_account_id, p_transfer_account_id,
    p_category_id, v_order_id, p_refund_order_id, p_type, p_amount, p_occurred_on, coalesce(p_note, ''));
  return p_request_id;
end;
$$;
revoke all on function public.create_transaction(uuid,uuid,text,uuid,numeric,date,text,uuid,uuid,date,text,uuid) from public, anon;
grant execute on function public.create_transaction(uuid,uuid,text,uuid,numeric,date,text,uuid,uuid,date,text,uuid) to authenticated;

-- Monthly generation is idempotent; a template due on the 29th-31st falls on
-- the month's last calendar day where that day does not exist.
create function public.generate_recurring_instances(p_ledger_id uuid, p_month date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_kind text; v_first date; v_last date; v_created integer;
begin
  select l.kind into v_kind from public.ledgers l where l.id=p_ledger_id and l.owner_id=(select auth.uid());
  if not found then raise exception 'ledger unavailable' using errcode='42501'; end if;
  v_first := date_trunc('month', p_month)::date;
  v_last := (v_first + interval '1 month - 1 day')::date;
  insert into public.recurring_expense_instances(ledger_id, recurring_expense_id, due_on)
  select r.ledger_id, r.id, least(v_first + (least(r.due_day, extract(day from v_last)::integer)-1), v_last)
  from public.recurring_expenses r where r.ledger_id=p_ledger_id and r.active
  on conflict (recurring_expense_id,due_on) do nothing;
  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create function public.confirm_recurring_instance(
  p_instance_id uuid,
  p_request_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_actual_amount numeric,
  p_confirmed_on date,
  p_note text default ''
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_instance public.recurring_expense_instances%rowtype; v_tx uuid;
begin
  select i.* into v_instance from public.recurring_expense_instances i
    join public.ledgers l on l.id=i.ledger_id
    where i.id=p_instance_id and l.owner_id=(select auth.uid()) for update of i;
  if not found then raise exception 'instance unavailable' using errcode='42501'; end if;
  if v_instance.status='confirmed' then
    if v_instance.transaction_id=p_request_id then return p_request_id; end if;
    raise exception 'instance already confirmed' using errcode='23505';
  end if;
  if p_actual_amount is null or p_actual_amount <= 0 then raise exception 'actual amount must be positive' using errcode='22023'; end if;
  if not exists(select 1 from public.categories c where c.id=p_category_id and c.ledger_id=v_instance.ledger_id and c.flow='expense') then
    raise exception 'expense category unavailable' using errcode='23503';
  end if;
  insert into public.transactions(id,ledger_id,account_id,category_id,type,amount,occurred_on,note,recurring_instance_id)
    values(p_request_id,v_instance.ledger_id,p_account_id,p_category_id,'expense',p_actual_amount,p_confirmed_on,coalesce(p_note,''),v_instance.id);
  update public.recurring_expense_instances set status='confirmed',transaction_id=p_request_id,confirmed_at=now()
    where id=v_instance.id;
  return p_request_id;
end;
$$;
revoke all on function public.generate_recurring_instances(uuid,date) from public,anon;
revoke all on function public.confirm_recurring_instance(uuid,uuid,uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.generate_recurring_instances(uuid,date) to authenticated;
grant execute on function public.confirm_recurring_instance(uuid,uuid,uuid,uuid,numeric,date,text) to authenticated;
commit;




