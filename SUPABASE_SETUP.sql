-- CONFIGURACIÓN DE LA BASE DE DATOS Y ADJUNTOS
-- Ejecuta este archivo completo en Supabase > SQL Editor > New query.
-- No elimina registros. Si public.app_state ya existe, no la recrea.

-- 1) Tabla donde la aplicación guarda todo el estado de vehículos e incidencias.
create table if not exists public.app_state (
  id text primary key check (id = 'main'),
  payload jsonb not null default '{"vehicles":[],"incidents":[],"activity":[]}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- La aplicación usa un único registro compartido entre los usuarios que pueden iniciar sesión.
drop policy if exists "fleet_state_authenticated_read" on public.app_state;
create policy "fleet_state_authenticated_read"
on public.app_state for select
to authenticated
using (true);

drop policy if exists "fleet_state_authenticated_insert" on public.app_state;
create policy "fleet_state_authenticated_insert"
on public.app_state for insert
to authenticated
with check (updated_by = auth.uid());

drop policy if exists "fleet_state_authenticated_update" on public.app_state;
create policy "fleet_state_authenticated_update"
on public.app_state for update
to authenticated
using (true)
with check (updated_by = auth.uid());

grant select, insert, update on table public.app_state to authenticated;

-- Permite a la aplicación recibir las actualizaciones de estado en tiempo real.
alter table public.app_state replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'app_state'
     ) then
    execute 'alter publication supabase_realtime add table public.app_state';
  end if;
end
$$;

-- 2) Almacenamiento privado para fotos y documentos de incidencias.
-- Las imágenes se guardan en una carpeta por usuario dentro de este bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-attachments',
  'incident-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Los datos de la flota son compartidos entre usuarios autenticados; estos usuarios
-- pueden consultar adjuntos relacionados con esos mismos partes.
drop policy if exists "Fleet attachments readable by authenticated users" on storage.objects;
create policy "Fleet attachments readable by authenticated users"
on storage.objects for select
to authenticated
using (bucket_id = 'incident-attachments');

drop policy if exists "Fleet attachments upload to own folder" on storage.objects;
create policy "Fleet attachments upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Fleet attachments update own folder" on storage.objects;
create policy "Fleet attachments update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Fleet attachments delete own folder" on storage.objects;
create policy "Fleet attachments delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
