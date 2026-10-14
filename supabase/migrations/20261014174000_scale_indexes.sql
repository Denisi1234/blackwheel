-- Scale indexes for 10k-50k concurrent: composite (shop_id, created_at desc)
-- supports the paginated .eq(shop_id).order(created_at).range() pattern
-- used by loadTablePage(). Re-runnable.

do $$
declare t text;
begin
  foreach t in array array[
    'tires','sales','inventory','deliveries','hotel_customers','hotel_tires',
    'vehicles','services','workers','tasks','appointments',
    'accounts','transactions','invoices','profiles'
  ] loop
    begin
      execute format(
        'create index if not exists idx_%I_shop_created on public.%I(shop_id, created_at desc)',
        t, t
      );
    exception when others then null;
    end;
  end loop;
end $$;

-- Cover tire lookups used by sale/delivery joins
create index if not exists idx_sales_tire on public.sales(tire_id);
create index if not exists idx_inventory_tire on public.inventory(tire_id);
create index if not exists idx_deliveries_tire on public.deliveries(tire_id);
create index if not exists idx_transactions_account_created on public.transactions(account_id, created_at desc);
create index if not exists idx_invoices_customer_status on public.invoices(customer_id, status);
