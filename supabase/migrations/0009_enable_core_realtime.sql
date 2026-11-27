-- Enable Supabase Postgres Changes for the app's owner-isolated cloud data.
-- All subscriptions still read through authenticated clients and table RLS.
begin;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'ledgers',
      'accounts',
      'categories',
      'transactions',
      'business_orders',
      'recurring_expenses',
      'recurring_expense_instances',
      'savings_goals',
      'business_daily_goal_settings'
    ] loop
      if to_regclass(format('public.%I', v_table)) is not null
         and not exists (
           select 1 from pg_catalog.pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = v_table
         ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
