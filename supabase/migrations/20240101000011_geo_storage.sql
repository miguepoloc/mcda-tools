-- Almacén de capas propias del Geovisor (kind:'spatial'): un bucket PRIVADO, una carpeta por usuario.
-- Ruta: <uid>/<project_id>/<capa>.f32.gz (Float32 comprimido con gzip, ya alineado a la grilla del
-- proyecto). Solo el dueño de la carpeta puede leer/escribir/borrar; el público y los expertos no
-- llegan aquí (la vista pública de mapas es una entrega posterior y usará una función SECURITY DEFINER).
insert into storage.buckets (id, name, public, file_size_limit)
values ('geo-layers', 'geo-layers', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists geo_layers_select on storage.objects;
drop policy if exists geo_layers_insert on storage.objects;
drop policy if exists geo_layers_update on storage.objects;
drop policy if exists geo_layers_delete on storage.objects;

create policy geo_layers_select on storage.objects for select to authenticated
  using (bucket_id = 'geo-layers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy geo_layers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'geo-layers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy geo_layers_update on storage.objects for update to authenticated
  using (bucket_id = 'geo-layers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'geo-layers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy geo_layers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'geo-layers' and (storage.foldername(name))[1] = auth.uid()::text);
