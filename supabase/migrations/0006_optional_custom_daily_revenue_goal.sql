-- Optional per-business-ledger target. Each setting is effective from its date;
-- the current UI writes today's date only, preserving every completed past day.
begin;

create table if not exists public.business_daily_goal_settings (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  effective_on date not null,
  enabled boolean not null default false,
  target_amount numeric(14,2) not null check (target_amount > 0 and target_amount < 1000000000000),
  created_at timestamptz not null default now(),
  unique (ledger_id, effective_on)
);

alter table public.business_daily_goal_settings enable row level security;
drop policy if exists business_daily_goal_settings_owner_all on public.business_daily_goal_settings;
create policy business_daily_goal_settings_owner_all on public.business_daily_goal_settings
  for all using (exists (
    select 1 from public.ledgers l
    where l.id = ledger_id and l.kind = 'business' and l.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.ledgers l
    where l.id = ledger_id and l.kind = 'business' and l.owner_id = (select auth.uid())
  ));
create or replace function public.protect_historical_daily_goal_setting()
returns trigger language plpgsql set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if tg_op = 'DELETE' then
    if old.effective_on < v_today then
      raise exception 'historical daily goal settings are immutable' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.effective_on < v_today or (tg_op = 'UPDATE' and old.effective_on < v_today) then
    raise exception 'historical daily goal settings are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists business_daily_goal_settings_history_guard on public.business_daily_goal_settings;
create trigger business_daily_goal_settings_history_guard
  before insert or update or delete on public.business_daily_goal_settings
  for each row execute function public.protect_historical_daily_goal_setting();
revoke all on function public.protect_historical_daily_goal_setting() from public, anon;
grant execute on function public.protect_historical_daily_goal_setting() to authenticated;
revoke all on public.business_daily_goal_settings from anon, public;
grant select, insert, update, delete on public.business_daily_goal_settings to authenticated;

drop view public.business_daily_revenue;
create view public.business_daily_revenue with (security_invoker = true) as
with daily as (
  select o.ledger_id, t.occurred_on as revenue_date, sum(t.amount) as delta,
         true as has_revenue_record
  from public.business_orders o
  join public.transactions t
    on t.business_order_id = o.id and t.ledger_id = o.ledger_id
  where t.type = 'income'
  group by o.ledger_id, t.occurred_on
  union all
  select ledger_id, occurred_on as revenue_date, -sum(amount) as delta,
         false as has_revenue_record
  from public.transactions
  where type = 'refund'
  group by ledger_id, occurred_on
), totals as (
  select ledger_id, revenue_date, sum(delta)::numeric(14,2) as revenue,
         bool_or(has_revenue_record) as has_revenue_record
  from daily group by ledger_id, revenue_date
)
select totals.ledger_id, totals.revenue_date, totals.revenue,
       coalesce(goal.enabled, false) as goal_enabled,
       goal.target_amount as goal_amount,
       (coalesce(goal.enabled, false) and totals.revenue >= goal.target_amount)::boolean as goal_reached,
       totals.has_revenue_record
from totals
left join lateral (
  select setting.enabled, setting.target_amount
  from public.business_daily_goal_settings setting
  where setting.ledger_id = totals.ledger_id and setting.effective_on <= totals.revenue_date
  order by setting.effective_on desc limit 1
) goal on true;

revoke all on public.business_daily_revenue from anon, public;
grant select on public.business_daily_revenue to authenticated;
comment on table public.business_daily_goal_settings is
  'Optional per-ledger daily revenue target history. Current client only writes today''s effective date so completed days remain unchanged.';

commit;
