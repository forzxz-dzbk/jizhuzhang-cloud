-- Personal savings goals use a dedicated account's real cloud balance as progress.
-- This plan metadata never creates a transaction or mixes into income/expense totals.
begin;

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  account_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, ledger_id),
  foreign key (account_id, ledger_id) references public.accounts(id, ledger_id) on delete restrict
);
create unique index savings_goals_one_active_per_account
  on public.savings_goals(account_id) where not is_archived;
create index savings_goals_by_ledger on public.savings_goals(ledger_id, created_at desc);

create function public.validate_savings_goal_ledger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.ledgers l
    where l.id = new.ledger_id and l.kind = 'personal'
  ) then
    raise exception 'savings goals require a personal ledger' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger savings_goals_personal_ledger_guard
before insert or update on public.savings_goals
for each row execute function public.validate_savings_goal_ledger();

alter table public.savings_goals enable row level security;
create policy savings_goals_owner_all on public.savings_goals for all
  using (exists (
    select 1 from public.ledgers l
    where l.id = ledger_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.ledgers l
    where l.id = ledger_id and l.owner_id = (select auth.uid())
  ));
revoke all on public.savings_goals from anon, public;
grant select, insert, update, delete on public.savings_goals to authenticated;

-- Add this table to live change feeds when the Supabase publication exists.
do $$
begin
  if to_regclass('pg_catalog.pg_publication') is not null
     and exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'savings_goals'
     ) then
    execute 'alter publication supabase_realtime add table public.savings_goals';
  end if;
end;
$$;

commit;
