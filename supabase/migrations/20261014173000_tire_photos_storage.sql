-- Tire photos storage bucket + policies
-- Ensures all uploads via uploadTirePhoto() go to Supabase backend.

insert into storage.buckets (id, name, public)
values ('tire-photos','tire-photos', true)
on conflict (id) do nothing;

-- Drop old policies if re-running
drop policy if exists "tire_photos_select" on storage.objects;
drop policy if exists "tire_photos_insert" on storage.objects;
drop policy if exists "tire_photos_update" on storage.objects;
drop policy if exists "tire_photos_delete" on storage.objects;

-- Public read (photos shown in Tire List without auth header)
create policy "tire_photos_select" on storage.objects for select to public
using (bucket_id = 'tire-photos');

-- Authenticated upload / update / delete
create policy "tire_photos_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'tire-photos');

create policy "tire_photos_update" on storage.objects for update to authenticated
using (bucket_id = 'tire-photos')
with check (bucket_id = 'tire-photos');

create policy "tire_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'tire-photos');
