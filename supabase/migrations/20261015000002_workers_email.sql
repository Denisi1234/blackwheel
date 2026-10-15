-- Link the worker roster to team logins: one person, one record, matched
-- by email. Invites auto-create the worker row; the worker form can send
-- the team invite. Nullable so existing rows keep working.
alter table public.workers add column if not exists email text;
create index if not exists idx_workers_email on public.workers(email);
