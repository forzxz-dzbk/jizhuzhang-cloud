-- Keep the optional target UI in sync when settings are changed on another device.
-- Supabase's Realtime publication may not exist in local/test Postgres, so this is a safe no-op there.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'business_daily_goal_settings'
     ) then
    execute 'alter publication supabase_realtime add table public.business_daily_goal_settings';
  end if;
end
$$;
