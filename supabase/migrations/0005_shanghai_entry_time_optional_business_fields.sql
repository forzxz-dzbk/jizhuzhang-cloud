-- Save transaction instants automatically; UI derives the accounting day in Asia/Shanghai.
-- Business order title and type are descriptive metadata, not prerequisites for recording revenue.
begin;

alter table public.business_orders alter column title drop not null;
alter table public.business_orders drop constraint if exists business_orders_title_check;
alter table public.business_orders add constraint business_orders_title_check
  check (title is null or length(trim(title)) between 1 and 160);
alter table public.business_orders alter column business_type drop not null;
alter table public.business_orders drop constraint if exists business_orders_business_type_check;
alter table public.business_orders add constraint business_orders_business_type_check
  check (business_type is null or length(trim(business_type)) between 1 and 80);

create or replace function public.create_transaction(
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
    if p_business_order_date is null then
      raise exception 'business income requires an order date' using errcode = '22023';
    end if;
    insert into public.business_orders(ledger_id, order_date, title)
      values (p_ledger_id, p_business_order_date, nullif(trim(p_business_order_title), '')) returning id into v_order_id;
  elsif v_kind = 'business' and p_type = 'refund' then
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
        v_title text := nullif(trim(p_business_order_title), '');
        v_type text := nullif(trim(p_business_type), '');
begin
  select l.kind into v_kind from public.ledgers l
    where l.id=p_ledger_id and l.owner_id=(select auth.uid());
  if not found or v_kind <> 'business' then raise exception 'business ledger unavailable' using errcode='42501'; end if;
  if length(v_title)>160 or length(v_type)>80 or p_business_order_date is null then
    raise exception 'invalid optional business order details' using errcode='22023';
  end if;
  select * into v_existing from public.transactions where id=p_request_id;
  if found then
    if v_existing.ledger_id=p_ledger_id and v_existing.type='income' and v_existing.account_id=p_account_id
      and v_existing.amount=p_amount and v_existing.occurred_on=p_occurred_on
      and v_existing.note=coalesce(p_note,'') and v_existing.category_id=p_category_id
      and v_existing.business_order_id is not null then
      select * into v_order from public.business_orders where id=v_existing.business_order_id and ledger_id=p_ledger_id;
      if found and v_order.order_date=p_business_order_date and v_order.title is not distinct from v_title
        and v_order.business_type is not distinct from v_type then return p_request_id; end if;
    end if;
    raise exception 'request id already used with different business income' using errcode='23505';
  end if;

  v_transaction_id := public.create_transaction(
    p_request_id,p_ledger_id,'income',p_account_id,p_amount,p_occurred_on,coalesce(p_note,''),p_category_id,
    null,p_business_order_date,v_title,null
  );
  update public.business_orders o set business_type=v_type
    from public.transactions t
    where t.id=v_transaction_id and t.ledger_id=p_ledger_id and o.id=t.business_order_id and o.ledger_id=p_ledger_id;
  if not found then raise exception 'business order type could not be saved' using errcode='23503'; end if;
  return v_transaction_id;
end;
$$;

revoke all on function public.create_transaction(uuid,uuid,text,uuid,numeric,date,text,uuid,uuid,date,text,uuid) from public, anon;
grant execute on function public.create_transaction(uuid,uuid,text,uuid,numeric,date,text,uuid,uuid,date,text,uuid) to authenticated;
revoke all on function public.create_business_income(uuid,uuid,uuid,numeric,date,text,uuid,date,text,text) from public, anon;
grant execute on function public.create_business_income(uuid,uuid,uuid,numeric,date,text,uuid,date,text,text) to authenticated;

commit;
