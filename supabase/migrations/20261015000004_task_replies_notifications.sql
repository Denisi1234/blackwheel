-- Task replies + in-app notifications (professional task communication).
-- task_comments: per-task reply thread (any shop member can reply, even
-- read-only roles — replying is communication, not task mutation).
-- notifications: per-recipient inbox rows (assignee on assign/reply/status).
-- No auto-purge: add retention (e.g. 90-day delete) if volume grows.
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid,
  author_email text not null default '',
  author_name text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);
alter table public.task_comments enable row level security;
drop policy if exists "member_all" on public.task_comments;
create policy "member_all" on public.task_comments for all to authenticated
  using (shop_id in (select public.my_shop_ids()))
  with check (shop_id in (select public.my_shop_ids()));
create index if not exists idx_task_comments_task_time on public.task_comments(task_id, created_at asc);
create index if not exists idx_task_comments_shop_time on public.task_comments(shop_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  user_email text not null default '',
  type text not null default 'task_assigned',
  title text not null default '',
  body text not null default '',
  task_id uuid references public.tasks(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "member_all" on public.notifications;
create policy "member_all" on public.notifications for all to authenticated
  using (shop_id in (select public.my_shop_ids()))
  with check (shop_id in (select public.my_shop_ids()));
create index if not exists idx_notifications_inbox on public.notifications(shop_id, user_email, read, created_at desc);

-- Idempotent: re-running the migration must not fail if already a member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table public.task_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
