-- Audit log: who created/changed/deleted what, per shop. Written
-- fire-and-forget by the app on every successful cloud mutation.
-- No auto-purge: add retention (e.g. 90-day delete) if volume grows.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  actor_id uuid,
  actor_email text not null default '',
  actor_name text not null default '',
  action text not null,
  table_name text not null,
  row_id text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "member_all" on public.audit_log;
create policy "member_all" on public.audit_log for all to authenticated
  using (shop_id in (select public.my_shop_ids()))
  with check (shop_id in (select public.my_shop_ids()));
create index if not exists idx_audit_log_shop_time on public.audit_log(shop_id, created_at desc);
-- Idempotent: re-running the migration must not fail if already a member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end
$$;
