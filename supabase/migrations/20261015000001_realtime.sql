-- Realtime: push row changes to connected devices so other logins see
-- new/updated/deleted rows within seconds without refresh. RLS still
-- applies: each client only receives rows its JWT can read.
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
  public.shop_settings;
