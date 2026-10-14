-- Shop settings (company profile, currency, VAT, thresholds).
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
