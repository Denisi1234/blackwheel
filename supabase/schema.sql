-- Blackwheel full schema for Supabase (Postgres)
-- Run in Supabase Dashboard > SQL Editor. Idempotent with IF NOT EXISTS where possible.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============ MULTI-TENANCY: SHOPS (defined first — everything references it)
-- One shared backend serves thousands of shops. Signup-creates-shop: the
-- first user creates the shop row and becomes its Admin (see profiles).
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ============ TIRES / SALES / INVENTORY / DELIVERIES ============
create table if not exists public.tires (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  vehicle_type text,
  size text not null,
  year int check (year is null or (year >= 1990 and year <= 2100)),
  season text,
  price numeric(12,2) not null default 0 check (price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  retail_price numeric(12,2) not null default 0 check (retail_price >= 0),
  stock int not null default 0 check (stock >= 0),
  image_urls text[] not null default '{}',
  rack_location text,
  dot_code text,
  load_index text,
  tire_condition text not null default 'New' check (tire_condition in ('New','Used','Retreaded')),
  sku text,
  barcode text,
  supplier text,
  currency text not null default 'TZS',
  created_at timestamptz not null default now()
);
-- Shop-assigned identity: unique when set, null/empty always allowed.
create unique index if not exists uq_tires_sku
  on public.tires(sku) where sku is not null and sku <> '';

-- Migration for existing deployments (re-runnable):
alter table public.tires add column if not exists cost_price numeric(12,2) not null default 0;
alter table public.tires add column if not exists retail_price numeric(12,2) not null default 0;
alter table public.tires add column if not exists rack_location text;
alter table public.tires add column if not exists dot_code text;
alter table public.tires add column if not exists load_index text;
alter table public.tires add column if not exists sku text;
alter table public.tires add column if not exists barcode text;
alter table public.tires add column if not exists supplier text;
alter table public.tires add column if not exists currency text not null default 'TZS';
create unique index if not exists uq_tires_sku
  on public.tires(sku) where sku is not null and sku <> '';
alter table public.tires add column if not exists tire_condition text not null default 'New';
do $$ begin
  alter table public.tires add constraint tires_tire_condition_check
    check (tire_condition in ('New','Used','Retreaded'));
exception when duplicate_object then null;
end $$;
-- Backfill legacy rows where cost/retail were stored in `price` only:
update public.tires set cost_price = price where cost_price = 0 and price <> 0;
update public.tires set retail_price = price where retail_price = 0 and price <> 0;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid references public.tires(id) on delete set null,
  quantity int not null check (quantity > 0),
  price numeric(12,2) not null check (price >= 0),
  profit numeric(12,2) not null default 0,
  customer_name text,
  currency text not null default 'TZS',
  date date not null default current_date,
  created_at timestamptz not null default now()
);
-- Migration for existing deployments (re-runnable):
alter table public.sales add column if not exists currency text not null default 'TZS';

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid unique references public.tires(id) on delete cascade,
  quantity int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid references public.tires(id) on delete set null,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

-- ============ TIRE HOTEL ============
create table if not exists public.hotel_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.hotel_tires (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_id uuid references public.hotel_customers(id) on delete set null,
  brand text not null,
  size text not null,
  quantity int not null default 4 check (quantity > 0),
  storage_date date,
  retrieval_date date,
  notes text,
  plate_number text,
  vehicle_model text,
  photo_url text,
  retrieved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_hotel_tires_plate on public.hotel_tires(plate_number);
create index if not exists idx_hotel_tires_retrieval on public.hotel_tires(retrieval_date);

-- ============ VEHICLES / SERVICES ============
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  license_plate text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicles_plate on public.vehicles(license_plate);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  customer_name text,
  date date not null,
  mechanic_name text,
  work_done text,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  next_service_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_services_vehicle on public.services(vehicle_id);
create index if not exists idx_services_next on public.services(next_service_date);

-- ============ WORKERS / TASKS ============
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text,
  contact text,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_workers_email on public.workers(email);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  task text not null,
  date date not null,
  time time,
  status text not null default 'Devam Ediyor' check (status in ('Devam Ediyor','Tamamlandı','İptal')),
  details text,
  completion_time timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_worker on public.tasks(worker_id);
create index if not exists idx_tasks_status on public.tasks(status);

-- ============ APPOINTMENTS ============
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone_number text,
  email text,
  service text not null,
  date date not null,
  time time,
  notes text,
  send_reminder boolean not null default false,
  status text not null default 'Yeni' check (status in ('Yeni','Güncellendi','Tamamlandı','İptal')),
  created_at timestamptz not null default now()
);
create index if not exists idx_appointments_date on public.appointments(date);
-- Prevent double-booking same service slot (adjust/remove if over-strict):
create unique index if not exists uq_appointments_slot
  on public.appointments(date, time, service);

-- ============ CURRENT ACCOUNT ============
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  receivable numeric(14,2) not null default 0,
  payable numeric(14,2) not null default 0,
  email text,
  phone text,
  address text,
  tax_id text,
  category text,
  currency text not null default 'TZS' check (currency in ('TRY','USD','EUR','GBP','TZS')),
  created_at timestamptz not null default now()
);

-- Migration for existing deployments: allow TZS (and keep old values valid).
-- NOTE: currency-default backfills for transactions/invoices live right after
-- those tables are created below (they don't exist yet at this point).
alter table public.accounts drop constraint if exists accounts_currency_check;
alter table public.accounts add constraint accounts_currency_check
  check (currency in ('TRY','USD','EUR','GBP','TZS'));
alter table public.accounts alter column currency set default 'TZS';

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  type text not null check (type in ('receivable','payable')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  date date not null default current_date,
  currency text not null default 'TRY',
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_account on public.transactions(account_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  date date not null default current_date,
  due_date date,
  customer_id uuid references public.accounts(id) on delete set null,
  customer_name text,
  total numeric(14,2) not null default 0 check (total >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  currency text not null default 'TRY',
  status text not null default 'Ödenmedi' check (status in ('Ödenmedi','Ödendi','İptal')),
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists idx_invoices_customer on public.invoices(customer_id);
create index if not exists idx_invoices_status on public.invoices(status);
-- Currency defaults to TZS (re-runnable; tables now exist).
alter table public.transactions alter column currency set default 'TZS';
alter table public.invoices alter column currency set default 'TZS';

-- ============ MULTI-TENANCY: SHOPS ============
-- One shared backend serves thousands of shops. Every tenant table carries
-- shop_id; RLS (bottom of file) isolates shops from each other.
-- Signup-creates-shop: the first user creates the shop and becomes its Admin.
-- (Table created at the top of this file so later FKs resolve on fresh DBs.)

-- ============ TEAM / PROFILES (real auth roles, per shop) ============
-- One row per person PER SHOP (same email can belong to several shops).
-- `id` equals the Supabase Auth user id once the person has registered;
-- admin-invited rows are matched by (shop_id, email) on first sign-in.
-- `invited` = created by an admin (role pre-approved). Self-registered rows
-- arrive with invited=false and wait for an admin to set their role.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'Staff' check (role in ('Admin','Technician','Sales','Staff')),
  active boolean not null default true,
  invited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, email)
);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_shop on public.profiles(shop_id);
-- Display denormalization: lets an invitee pick their shop before membership.
alter table public.profiles add column if not exists shop_name text;

-- ============ MULTI-TENANCY: shop_id ON EVERY TENANT TABLE ============
-- Re-runnable: adds the column, the FK (delete shop => its data goes with
-- it) and an index per table. Legacy rows keep shop_id NULL (invisible under
-- the new RLS); backfill them once with:
--   update public.<table> set shop_id = '<your-shop-uuid>' where shop_id is null;
-- Find your shop id with:  select id, name from public.shops;
do $$
declare t text;
begin
  foreach t in array array[
    'tires','sales','inventory','deliveries','hotel_customers','hotel_tires',
    'vehicles','services','workers','tasks','appointments',
    'accounts','transactions','invoices','profiles'
  ] loop
    execute format('alter table public.%I add column if not exists shop_id uuid', t);
    execute format('create index if not exists idx_%I_shop on public.%I(shop_id)', t, t);
    begin
      execute format(
        'alter table public.%I add constraint fk_%I_shop foreign key (shop_id) references public.shops(id) on delete cascade',
        t, t
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============ RLS: SHOP ISOLATION (multi-tenant) ============
-- No anonymous access: every row belongs to exactly one shop and is visible
-- only to active members of that shop. This is what lets 5000+ shops share
-- one backend without ever seeing each other's data.
alter table public.shops enable row level security;
alter table public.tires enable row level security;
alter table public.sales enable row level security;
alter table public.inventory enable row level security;
alter table public.deliveries enable row level security;
alter table public.hotel_customers enable row level security;
alter table public.hotel_tires enable row level security;
alter table public.vehicles enable row level security;
alter table public.services enable row level security;
alter table public.workers enable row level security;
alter table public.tasks enable row level security;
alter table public.appointments enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.profiles enable row level security;

-- Drop legacy open-access policies from earlier versions of this file.
do $$
declare t text;
begin
  foreach t in array array[
    'tires','sales','inventory','deliveries','hotel_customers','hotel_tires',
    'vehicles','services','workers','tasks','appointments',
    'accounts','transactions','invoices','profiles','shops'
  ] loop
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('drop policy if exists "member_all" on public.%I', t);
    execute format('drop policy if exists "profiles_select" on public.%I', t);
    execute format('drop policy if exists "profiles_insert" on public.%I', t);
    execute format('drop policy if exists "profiles_admin_write" on public.%I', t);
    execute format('drop policy if exists "profiles_admin_delete" on public.%I', t);
    execute format('drop policy if exists "shops_select" on public.%I', t);
    execute format('drop policy if exists "shops_insert" on public.%I', t);
    execute format('drop policy if exists "shops_member_write" on public.%I', t);
  end loop;
end $$;

-- Membership helpers. SECURITY DEFINER so they bypass RLS: policies that
-- subquery `profiles` would otherwise recurse into the profiles policy
-- itself (Postgres "infinite recursion detected in policy"). Email matching
-- is what lets an invited person in before their auth id is adopted.
create or replace function public.my_shop_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles
  where active
    and shop_id is not null
    and (id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.my_admin_shop_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles
  where active
    and shop_id is not null
    and id = auth.uid()
    and role = 'Admin';
$$;

-- Tenant tables: active members of the row's shop, nothing else.
do $$
declare t text;
begin
  foreach t in array array[
    'tires','sales','inventory','deliveries','hotel_customers','hotel_tires',
    'vehicles','services','workers','tasks','appointments',
    'accounts','transactions','invoices'
  ] loop
    execute format(
      'create policy "member_all" on public.%I for all to authenticated ' ||
      'using (shop_id in (select public.my_shop_ids())) ' ||
      'with check (shop_id in (select public.my_shop_ids()))',
      t
    );
  end loop;
end $$;

-- Profiles: read your own row, rows matching your login email (invites), and
-- rows of shops you belong to. Insert your own row (bootstrap) or, as an
-- admin, invite rows into your shop. Writes restricted to shop admins.
create policy "profiles_select" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or lower(email) = lower(auth.jwt() ->> 'email')
    or shop_id in (select public.my_shop_ids())
  );
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (
    id = auth.uid()
    or shop_id in (select public.my_admin_shop_ids())
  );
create policy "profiles_admin_write" on public.profiles for update to authenticated
  using (shop_id in (select public.my_admin_shop_ids()))
  with check (shop_id in (select public.my_admin_shop_ids()));
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using (shop_id in (select public.my_admin_shop_ids()));

-- Shops: any logged-in user can create one; members can read, admins rename.
create policy "shops_insert" on public.shops for insert to authenticated
  with check (true);
create policy "shops_select" on public.shops for select to authenticated
  using (
    created_by = auth.uid()
    or id in (select public.my_shop_ids())
  );
create policy "shops_member_write" on public.shops for update to authenticated
  using (id in (select public.my_admin_shop_ids()))
  with check (id in (select public.my_admin_shop_ids()));

-- ============ SHOP SETTINGS (company, currency, VAT, thresholds) ============
-- One row per shop, readable/writable by any active member of that shop.
create table if not exists public.shop_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  currency text not null default 'TZS',
  vat_rate numeric not null default 20,
  low_stock_threshold int not null default 4,
  company_name text not null default '',
  company_phone text not null default '',
  company_email text not null default '',
  company_address text not null default '',
  company_tax_id text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.shop_settings enable row level security;
drop policy if exists "member_all" on public.shop_settings;
create policy "member_all" on public.shop_settings for all to authenticated
  using (shop_id in (select public.my_shop_ids()))
  with check (shop_id in (select public.my_shop_ids()));
create index if not exists idx_shop_settings_shop on public.shop_settings(shop_id);

-- ============ AUDIT LOG (who changed what, per shop) ============
-- Written fire-and-forget by the app on every successful cloud mutation.
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

-- ============ TASK REPLIES + NOTIFICATIONS ============
-- task_comments: per-task reply thread (any member can reply).
-- notifications: per-recipient inbox (assignee on assign/reply).
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

-- ============ REALTIME (live multi-device refresh) ============
-- Push row changes to connected devices; RLS still applies per client.
alter publication supabase_realtime add table
  public.tires,
  public.sales,
  public.inventory,
  public.deliveries,
  public.hotel_tires,
  public.hotel_customers,
  public.vehicles,
  public.services,
  public.workers,
  public.tasks,
  public.appointments,
  public.accounts,
  public.transactions,
  public.invoices,
  public.profiles,
  public.shops,
  public.shop_settings,
  public.audit_log,
  public.task_comments,
  public.notifications;

-- ============ STORAGE (tire photos) ============
-- Run once: create bucket 'tire-photos' (public or private) in Dashboard > Storage,
-- or via API. Example SQL for storage.objects policies (adjust to private as needed):
-- insert into storage.buckets (id, name, public) values ('tire-photos','tire-photos', true)
--   on conflict (id) do nothing;
