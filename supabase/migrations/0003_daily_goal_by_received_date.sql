begin;

-- The ¥500 habit tracks cash actually received, not when the order was placed.
-- Keep the refund date as the date the refund occurred. The exposed date column
-- is renamed from order_date to revenue_date so the client cannot confuse them.
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
)
select ledger_id, revenue_date, sum(delta)::numeric(14,2) as revenue,
       (sum(delta) >= 500)::boolean as goal_reached,
       bool_or(has_revenue_record) as has_revenue_record
from daily
group by ledger_id, revenue_date;

revoke all on public.business_daily_revenue from anon, public;
grant select on public.business_daily_revenue to authenticated;

commit;
