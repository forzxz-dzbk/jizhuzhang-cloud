-- Additive business-order metadata and expense attribution.
-- Existing orders receive the honest label “未分类”; no historical amount is invented.
begin;

alter table public.business_orders
  add column if not exists business_type text;
update public.business_orders set business_type='未分类' where business_type is null or length(trim(business_type))=0;
alter table public.business_orders alter column business_type set default '未分类';
alter table public.business_orders alter column business_type set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='business_orders_business_type_check' and conrelid='public.business_orders'::regclass) then
    alter table public.business_orders add constraint business_orders_business_type_check
      check (length(trim(business_type)) between 1 and 80);
  end if;
end $$;

alter table public.transactions add column if not exists cost_order_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='transactions_cost_order_same_ledger' and conrelid='public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_cost_order_same_ledger
      foreign key (cost_order_id, ledger_id) references public.business_orders(id, ledger_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='transactions_cost_order_expense_only' and conrelid='public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_cost_order_expense_only
      check (cost_order_id is null or type='expense');
  end if;
end $$;
create index if not exists transactions_cost_order_id_idx
  on public.transactions(cost_order_id) where cost_order_id is not null;

create or replace function public.validate_transaction_cost_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_kind text;
begin
  if new.cost_order_id is null then return new; end if;
  if new.type <> 'expense' then
    raise exception 'only business expenses can be allocated to an order' using errcode='23514';
  end if;
  select l.kind into v_kind from public.ledgers l
    where l.id=new.ledger_id and l.owner_id=(select auth.uid());
  if not found or v_kind <> 'business' then
    raise exception 'order costs require an owned business ledger' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists transactions_cost_order_guard on public.transactions;
create trigger transactions_cost_order_guard before insert or update of cost_order_id, type, ledger_id
  on public.transactions for each row execute function public.validate_transaction_cost_order();

create or replace function public.create_business_income(
  p_request_id uuid,
  p_ledger_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_note text,
  p_category_id uuid,
  p_business_order_date date,
  p_business_order_title text,
  p_business_type text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_kind text; v_existing public.transactions%rowtype; v_order public.business_orders%rowtype; v_transaction_id uuid;
begin
  select l.kind into v_kind from public.ledgers l
    where l.id=p_ledger_id and l.owner_id=(select auth.uid());
  if not found or v_kind <> 'business' then raise exception 'business ledger unavailable' using errcode='42501'; end if;
  if nullif(trim(p_business_type),'') is null or length(trim(p_business_type))>80 then
    raise exception 'business type must contain 1 to 80 characters' using errcode='22023';
  end if;
  select * into v_existing from public.transactions where id=p_request_id;
  if found then
    if v_existing.ledger_id=p_ledger_id and v_existing.type='income' and v_existing.account_id=p_account_id
      and v_existing.amount=p_amount and v_existing.occurred_on=p_occurred_on
      and v_existing.note=coalesce(p_note,'') and v_existing.category_id=p_category_id
      and v_existing.business_order_id is not null then
      select * into v_order from public.business_orders where id=v_existing.business_order_id and ledger_id=p_ledger_id;
      if found and v_order.order_date=p_business_order_date and v_order.title=trim(p_business_order_title)
        and v_order.business_type=trim(p_business_type) then return p_request_id; end if;
    end if;
    raise exception 'request id already used with different business income' using errcode='23505';
  end if;

  v_transaction_id := public.create_transaction(
    p_request_id,p_ledger_id,'income',p_account_id,p_amount,p_occurred_on,coalesce(p_note,''),p_category_id,
    null,p_business_order_date,p_business_order_title,null
  );
  update public.business_orders o set business_type=trim(p_business_type)
    from public.transactions t
    where t.id=v_transaction_id and t.ledger_id=p_ledger_id and o.id=t.business_order_id and o.ledger_id=p_ledger_id;
  if not found then raise exception 'business order type could not be saved' using errcode='23503'; end if;
  return v_transaction_id;
end;
$$;

create or replace function public.create_business_cost(
  p_request_id uuid,
  p_ledger_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_note text,
  p_category_id uuid,
  p_cost_order_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_kind text; v_existing public.transactions%rowtype; v_transaction_id uuid;
begin
  select l.kind into v_kind from public.ledgers l
    where l.id=p_ledger_id and l.owner_id=(select auth.uid());
  if not found or v_kind <> 'business' then raise exception 'business ledger unavailable' using errcode='42501'; end if;
  if p_cost_order_id is not null and not exists (
    select 1 from public.business_orders o where o.id=p_cost_order_id and o.ledger_id=p_ledger_id
  ) then raise exception 'cost order unavailable' using errcode='23503'; end if;
  select * into v_existing from public.transactions where id=p_request_id;
  if found then
    if v_existing.ledger_id=p_ledger_id and v_existing.type='expense' and v_existing.account_id=p_account_id
      and v_existing.amount=p_amount and v_existing.occurred_on=p_occurred_on
      and v_existing.note=coalesce(p_note,'') and v_existing.category_id=p_category_id
      and v_existing.cost_order_id is not distinct from p_cost_order_id then return p_request_id; end if;
    raise exception 'request id already used with different business cost' using errcode='23505';
  end if;
  v_transaction_id := public.create_transaction(
    p_request_id,p_ledger_id,'expense',p_account_id,p_amount,p_occurred_on,coalesce(p_note,''),p_category_id,
    null,null,null,null
  );
  if p_cost_order_id is not null then
    update public.transactions set cost_order_id=p_cost_order_id where id=v_transaction_id and ledger_id=p_ledger_id;
    if not found then raise exception 'business cost order could not be saved' using errcode='23503'; end if;
  end if;
  return v_transaction_id;
end;
$$;

create or replace view public.business_order_totals with (security_invoker = true) as
with income as (
  select business_order_id, sum(amount) as gross_revenue from public.transactions
  where type='income' and business_order_id is not null group by business_order_id
), refunds as (
  select refund_order_id as business_order_id, sum(amount) as refunded from public.transactions
  where type='refund' and refund_order_id is not null group by refund_order_id
), costs as (
  select cost_order_id as business_order_id, sum(amount) as allocated_cost from public.transactions
  where type='expense' and cost_order_id is not null group by cost_order_id
)
select o.id, o.ledger_id, o.order_date, o.title, o.business_type,
  coalesce(i.gross_revenue,0)::numeric(14,2) as gross_revenue,
  coalesce(r.refunded,0)::numeric(14,2) as refunds,
  (coalesce(i.gross_revenue,0)-coalesce(r.refunded,0))::numeric(14,2) as actual_revenue,
  coalesce(c.allocated_cost,0)::numeric(14,2) as allocated_cost,
  (coalesce(i.gross_revenue,0)-coalesce(r.refunded,0)-coalesce(c.allocated_cost,0))::numeric(14,2) as operating_surplus
from public.business_orders o
left join income i on i.business_order_id=o.id
left join refunds r on r.business_order_id=o.id
left join costs c on c.business_order_id=o.id;

revoke all on public.business_order_totals from anon, public;
grant select on public.business_order_totals to authenticated;
revoke all on function public.create_business_income(uuid,uuid,uuid,numeric,date,text,uuid,date,text,text) from public, anon;
revoke all on function public.create_business_cost(uuid,uuid,uuid,numeric,date,text,uuid,uuid) from public, anon;
grant execute on function public.create_business_income(uuid,uuid,uuid,numeric,date,text,uuid,date,text,text) to authenticated;
grant execute on function public.create_business_cost(uuid,uuid,uuid,numeric,date,text,uuid,uuid) to authenticated;

commit;
