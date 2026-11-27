-- Keep occurrence time separate from insertion time; preserve the recorded clock
-- time while aligning legacy rows to their existing Asia/Shanghai accounting day.
alter table public.transactions add column if not exists occurred_at timestamptz;
update public.transactions
set occurred_at = ((occurred_on::text || ' ' || to_char(created_at at time zone 'Asia/Shanghai', 'HH24:MI:SS.US'))::timestamp at time zone 'Asia/Shanghai')
where occurred_at is null;
alter table public.transactions alter column occurred_at set default now();
alter table public.transactions alter column occurred_at set not null;

create or replace function public.update_transaction(
  p_transaction_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_account_id uuid,
  p_category_id uuid,
  p_transfer_account_id uuid,
  p_note text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_tx public.transactions%rowtype; v_original numeric; v_other_refunds numeric;
begin
  select t.* into v_tx
  from public.transactions t
  join public.ledgers l on l.id=t.ledger_id
  where t.id=p_transaction_id and l.owner_id=(select auth.uid())
  for update of t;
  if not found then raise exception 'transaction unavailable' using errcode='42501'; end if;
  if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then
    raise exception 'amount must be positive with at most two decimal places' using errcode='22023';
  end if;
  if p_occurred_at is null or not isfinite(p_occurred_at) then
    raise exception 'transaction time is invalid' using errcode='22023';
  end if;
  if length(coalesce(p_note,''))>500 then raise exception 'note is too long' using errcode='22023'; end if;
  if not exists(select 1 from public.accounts a where a.id=p_account_id and a.ledger_id=v_tx.ledger_id) then
    raise exception 'account unavailable' using errcode='23503';
  end if;
  if v_tx.type in ('income','expense') then
    if not exists(select 1 from public.categories c where c.id=p_category_id and c.ledger_id=v_tx.ledger_id and c.flow=v_tx.type) then
      raise exception 'category unavailable for transaction type' using errcode='23503';
    end if;
    if p_transfer_account_id is not null then raise exception 'non-transfer transaction cannot have a transfer account' using errcode='23514'; end if;
  elsif v_tx.type='transfer' then
    if p_category_id is not null or p_transfer_account_id is null or p_transfer_account_id=p_account_id
       or not exists(select 1 from public.accounts a where a.id=p_transfer_account_id and a.ledger_id=v_tx.ledger_id) then
      raise exception 'transfer accounts are invalid' using errcode='23514';
    end if;
  elsif v_tx.type='refund' then
    if p_category_id is not null or p_transfer_account_id is not null then raise exception 'refund dimensions are invalid' using errcode='23514'; end if;
    select t.amount into v_original from public.transactions t
      where t.ledger_id=v_tx.ledger_id and t.business_order_id=v_tx.refund_order_id and t.type='income' for update;
    if not found then raise exception 'original business income unavailable' using errcode='23503'; end if;
    select coalesce(sum(t.amount),0) into v_other_refunds from public.transactions t
      where t.ledger_id=v_tx.ledger_id and t.refund_order_id=v_tx.refund_order_id and t.type='refund' and t.id<>v_tx.id;
    if v_other_refunds+p_amount>v_original then raise exception 'refund exceeds original received amount' using errcode='23514'; end if;
  end if;
  if v_tx.type='income' and v_tx.business_order_id is not null then
    select coalesce(sum(t.amount),0) into v_other_refunds from public.transactions t
      where t.ledger_id=v_tx.ledger_id and t.refund_order_id=v_tx.business_order_id and t.type='refund';
    if v_other_refunds>p_amount then raise exception 'income amount cannot be lower than existing refunds' using errcode='23514'; end if;
  end if;
  update public.transactions set
    amount=p_amount,
    occurred_at=p_occurred_at,
    occurred_on=(p_occurred_at at time zone 'Asia/Shanghai')::date,
    account_id=p_account_id,
    category_id=p_category_id,
    transfer_account_id=p_transfer_account_id,
    note=coalesce(p_note,'')
  where id=v_tx.id and ledger_id=v_tx.ledger_id;
  return true;
end;
$$;

create or replace function public.delete_transaction(p_transaction_id uuid)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_tx public.transactions%rowtype;
begin
  select t.* into v_tx
  from public.transactions t
  join public.ledgers l on l.id=t.ledger_id
  where t.id=p_transaction_id and l.owner_id=(select auth.uid())
  for update of t;
  if not found then raise exception 'transaction unavailable' using errcode='42501'; end if;
  if v_tx.type='income' and v_tx.business_order_id is not null and exists(
    select 1 from public.transactions t where t.ledger_id=v_tx.ledger_id and t.refund_order_id=v_tx.business_order_id and t.type='refund'
  ) then raise exception 'delete linked refunds before deleting the original business income' using errcode='23514'; end if;

  if v_tx.recurring_instance_id is not null then
    update public.recurring_expense_instances set status='pending',transaction_id=null,confirmed_at=null
      where id=v_tx.recurring_instance_id and ledger_id=v_tx.ledger_id and transaction_id=v_tx.id;
  end if;
  delete from public.transactions where id=v_tx.id and ledger_id=v_tx.ledger_id;
  if v_tx.business_order_id is not null then
    delete from public.business_orders o where o.id=v_tx.business_order_id and o.ledger_id=v_tx.ledger_id
      and not exists(select 1 from public.transactions t where t.ledger_id=o.ledger_id
        and (t.business_order_id=o.id or t.refund_order_id=o.id or t.cost_order_id=o.id));
  end if;
  return true;
end;
$$;

revoke all on function public.update_transaction(uuid,numeric,timestamptz,uuid,uuid,uuid,text) from public,anon;
revoke all on function public.delete_transaction(uuid) from public,anon;
grant execute on function public.update_transaction(uuid,numeric,timestamptz,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.delete_transaction(uuid) to authenticated;
