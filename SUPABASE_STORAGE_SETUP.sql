-- Ejecuta este archivo una sola vez en Supabase → SQL Editor.
-- Bucket privado para fotografías y documentos PDF de partes de incidencia.
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

-- El contenido de app_state se comparte entre usuarios autenticados en esta aplicación,
-- por eso cualquier usuario autenticado puede leer los adjuntos del bucket.
drop policy if exists "Fleet attachments readable by authenticated users" on storage.objects;
create policy "Fleet attachments readable by authenticated users"
on storage.objects for select to authenticated
using (bucket_id = 'incident-attachments');

-- Cada persona solo puede subir, actualizar o borrar archivos dentro de su propia carpeta.
-- La aplicación guarda las rutas como <user-id>/<incident-id>/<filename>.
drop policy if exists "Fleet attachments upload to own folder" on storage.objects;
create policy "Fleet attachments upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Fleet attachments update own folder" on storage.objects;
create policy "Fleet attachments update own folder"
on storage.objects for update to authenticated
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
on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
