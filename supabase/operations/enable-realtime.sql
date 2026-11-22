-- Apply only after the core migration is reviewed on the intended Supabase project.
-- This enables row-change events used by the client. It does not modify business data.
do $$
declare table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is not available';
  end if;
  foreach table_name in array array['ledgers','accounts','categories','business_orders','recurring_expenses','recurring_expense_instances','transactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
