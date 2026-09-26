-- Geovisor (kind:'spatial'), segunda parte: publicar el mapa en la vista pública, cuota de
-- almacenamiento editable por el admin, catálogo de paquetes del docente y limpieza de huérfanos.
-- Requiere 20240101000010 (kind/geo) y 20240101000011 (bucket `geo-layers`).
--
-- Decisiones (ver plataforma/docs/PLAN_geovisor_ahp_sig.md §4):
--  · El resultado público se guarda EN la base (`geo_results`, base64), no en Storage: se revoca al
--    instante al quitar «público» y se sirve solo por `public_geo_get(token)`. Nunca las capas de entrada.
--  · La cuota se mide sobre los objetos REALES de Storage (`storage.objects.metadata.size`), no sobre
--    lo que el cliente declare; `geo_check_upload` la exige antes de cada subida y el bucket tiene tope
--    duro por archivo. Bajar la cuota no borra nada: solo bloquea nuevas subidas.
--  · Quién es admin sale de `profiles.role` (mismo criterio que admin_stats), ahora en `is_admin()`.

-- ───────────────────────── Helper is_admin() ─────────────────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────────────────────── Ajustes y cuota ─────────────────────────

create table if not exists public.app_settings (key text primary key, value jsonb not null);
alter table public.app_settings enable row level security;
-- Sin políticas: solo las funciones SECURITY DEFINER de abajo la leen/escriben (mismo patrón que rate_limit_log).

insert into public.app_settings (key, value)
values ('geo', '{"quota_mb": 60, "max_layers": 16, "max_pixels": 1500000, "public_max_kb": 3000}'::jsonb)
on conflict (key) do nothing;

alter table public.profiles add column if not exists geo_quota_mb int;
alter table public.profiles drop constraint if exists profiles_geo_quota_ok;
alter table public.profiles add constraint profiles_geo_quota_ok check (geo_quota_mb is null or (geo_quota_mb >= 0 and geo_quota_mb <= 10240));

create or replace function public._geo_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = 'geo'),
                  '{"quota_mb": 60, "max_layers": 16, "max_pixels": 1500000, "public_max_kb": 3000}'::jsonb)
$$;
revoke all on function public._geo_settings() from public;

-- Topes globales (los lee cualquier usuario con sesión: la interfaz los muestra y los respeta).
create or replace function public.geo_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select public._geo_settings()
$$;
revoke all on function public.geo_settings() from public;
grant execute on function public.geo_settings() to authenticated;

create or replace function public._geo_used(p_user uuid) returns table (bytes bigint, layers int)
language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)::int
    from storage.objects o
   where o.bucket_id = 'geo-layers' and (storage.foldername(o.name))[1] = p_user::text
$$;
revoke all on function public._geo_used(uuid) from public;

create or replace function public._geo_quota_bytes(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select (coalesce((select geo_quota_mb from public.profiles where id = p_user),
                   (public._geo_settings()->>'quota_mb')::int) * 1048576)::bigint
$$;
revoke all on function public._geo_quota_bytes(uuid) from public;

-- Uso de la cuota del usuario en sesión.
create or replace function public.geo_quota() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u record; s jsonb := public._geo_settings();
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  select * into u from public._geo_used(auth.uid());
  return jsonb_build_object('used_bytes', u.bytes, 'quota_bytes', public._geo_quota_bytes(auth.uid()),
                            'layers', u.layers, 'max_layers', (s->>'max_layers')::int, 'max_pixels', (s->>'max_pixels')::int);
end $$;
revoke all on function public.geo_quota() from public;
grant execute on function public.geo_quota() to authenticated;

-- Se llama ANTES de subir una capa (con el tamaño ya comprimido). Reemplazar una capa existente
-- (misma ruta) descuenta lo que ya ocupaba.
create or replace function public.geo_check_upload(p_path text, p_bytes bigint) returns void
language plpgsql security definer set search_path = public, storage as $$
declare u record; prev bigint; s jsonb := public._geo_settings(); q bigint;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'ruta no permitida'; end if;
  if p_bytes is null or p_bytes < 0 then raise exception 'tamaño no válido'; end if;
  select * into u from public._geo_used(auth.uid());
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into prev
    from storage.objects o where o.bucket_id = 'geo-layers' and o.name = p_path;
  q := public._geo_quota_bytes(auth.uid());
  if u.bytes - prev + p_bytes > q then
    raise exception 'Cuota de mapas superada: usas % MB de % MB. Borra alguna capa o pide más cuota al docente.',
      round(u.bytes / 1048576.0, 1), round(q / 1048576.0, 1);
  end if;
  if prev = 0 and u.layers >= (s->>'max_layers')::int then
    raise exception 'Máximo de % capas alcanzado. Borra alguna antes de añadir otra.', (s->>'max_layers')::int;
  end if;
end $$;
revoke all on function public.geo_check_upload(text, bigint) from public;
grant execute on function public.geo_check_upload(text, bigint) to authenticated;

-- ───────────────────────── Resultado público ─────────────────────────

create table if not exists public.geo_results (
  project_id uuid primary key references public.projects(id) on delete cascade,
  grid_b64 text not null,         -- 2 planos Uint8 (pct, clase) concatenados, gzip, base64
  meta jsonb not null,            -- grilla, pesos, CR, umbrales, superficies (lo que la vista pública muestra)
  size_bytes int not null,
  updated_at timestamptz not null default now()
);
alter table public.geo_results enable row level security;
drop policy if exists geo_results_owner_read on public.geo_results;
create policy geo_results_owner_read on public.geo_results for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
-- Escritura solo por geo_publish_result (sin políticas de insert/update/delete).

create or replace function public.geo_publish_result(p_project uuid, p_grid_b64 text, p_meta jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype; max_b int := ((public._geo_settings()->>'public_max_kb')::int) * 1024; ts timestamptz;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  perform public._rate_limit('geo_publish:' || auth.uid()::text, 20, interval '1 minute');
  select * into p from public.projects where id = p_project and owner_id = auth.uid();
  if not found then raise exception 'proyecto no encontrado'; end if;
  if p.kind <> 'spatial' then raise exception 'solo los mapas de aptitud se publican así'; end if;
  if p_grid_b64 is null or char_length(p_grid_b64) = 0 then raise exception 'mapa vacío'; end if;
  if char_length(p_grid_b64) > max_b then
    raise exception 'El mapa pesa % KB y el máximo para publicar es % KB. Usa una resolución más gruesa.',
      round(char_length(p_grid_b64) / 1024.0), max_b / 1024;
  end if;
  insert into public.geo_results (project_id, grid_b64, meta, size_bytes)
  values (p_project, p_grid_b64, p_meta, char_length(p_grid_b64))
  on conflict (project_id) do update
    set grid_b64 = excluded.grid_b64, meta = excluded.meta, size_bytes = excluded.size_bytes, updated_at = now()
  returning updated_at into ts;
  return ts;
end $$;
revoke all on function public.geo_publish_result(uuid, text, jsonb) from public;
grant execute on function public.geo_publish_result(uuid, text, jsonb) to authenticated;

-- Lo que ve cualquiera con el enlace público: título, objetivo y el mapa publicado. Nunca las capas
-- de entrada ni los expertos. Devuelve null si el token no existe, el proyecto no es público o no es
-- un mapa; {status:'unpublished'} si es público pero el autor aún no publicó el mapa.
create or replace function public.public_geo_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype; r public.geo_results%rowtype;
begin
  perform public._rate_limit('public_geo_get:' || p_token, 60, interval '1 minute');
  select * into p from public.projects where public_token = p_token and is_public and kind = 'spatial';
  if not found then return null; end if;
  select * into r from public.geo_results where project_id = p.id;
  if not found then
    return jsonb_build_object('status', 'unpublished', 'title', p.title, 'objective', p.objective);
  end if;
  return jsonb_build_object('status', 'ok', 'title', p.title, 'objective', p.objective,
                            'grid_b64', r.grid_b64, 'meta', r.meta, 'updated_at', r.updated_at);
end $$;
revoke all on function public.public_geo_get(text) from public;
grant execute on function public.public_geo_get(text) to anon, authenticated;

-- ───────────────────────── Catálogo del docente ─────────────────────────
-- Un paquete = configuración (criterios, reglas, grilla, capas) + capas alineadas en el bucket
-- PÚBLICO `geo-catalog` (material del curso; cualquiera con la URL las lee, como los paquetes estáticos).

create table if not exists public.geo_packs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  title text not null check (char_length(title) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  attribution text not null default '' check (char_length(attribution) <= 1000),
  definition jsonb not null,      -- {criteria, geo:{grid, layers, rules, classes}}
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.geo_packs enable row level security;
drop policy if exists geo_packs_read on public.geo_packs;
create policy geo_packs_read on public.geo_packs for select to authenticated using (is_active or public.is_admin());
drop policy if exists geo_packs_admin on public.geo_packs;
create policy geo_packs_admin on public.geo_packs for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('geo-catalog', 'geo-catalog', true, 26214400)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists geo_catalog_insert on storage.objects;
drop policy if exists geo_catalog_update on storage.objects;
drop policy if exists geo_catalog_delete on storage.objects;
create policy geo_catalog_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'geo-catalog' and public.is_admin());
create policy geo_catalog_update on storage.objects for update to authenticated
  using (bucket_id = 'geo-catalog' and public.is_admin()) with check (bucket_id = 'geo-catalog' and public.is_admin());
create policy geo_catalog_delete on storage.objects for delete to authenticated
  using (bucket_id = 'geo-catalog' and public.is_admin());

-- Limpieza de huérfanos: el admin puede LISTAR y BORRAR solo los objetos de `geo-layers` cuyo proyecto
-- ya no existe (la API de Storage necesita las dos políticas: un DELETE ... WHERE también pasa por
-- la de SELECT). Sobre capas de proyectos vivos el admin no ve ni borra nada.
create or replace function public._geo_is_orphan(p_name text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select not exists (select 1 from public.projects p where p.id::text = (storage.foldername(p_name))[2])
$$;
revoke all on function public._geo_is_orphan(text) from public, anon;
grant execute on function public._geo_is_orphan(text) to authenticated;

drop policy if exists geo_layers_admin_delete on storage.objects;
drop policy if exists geo_layers_admin_select on storage.objects;
create policy geo_layers_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'geo-layers' and public.is_admin() and public._geo_is_orphan(name));
create policy geo_layers_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'geo-layers' and public.is_admin() and public._geo_is_orphan(name));

-- ───────────────────────── Funciones de admin ─────────────────────────

create or replace function public.admin_geo_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return public._geo_settings();
end $$;

create or replace function public.admin_set_geo_settings(p_quota_mb int, p_max_layers int, p_max_pixels int, p_public_max_kb int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  if p_quota_mb is null or p_quota_mb < 0 or p_quota_mb > 10240 then raise exception 'cuota fuera de rango (0–10240 MB)'; end if;
  if p_max_layers is null or p_max_layers < 1 or p_max_layers > 100 then raise exception 'capas máximas fuera de rango (1–100)'; end if;
  if p_max_pixels is null or p_max_pixels < 10000 or p_max_pixels > 4000000 then raise exception 'píxeles máximos fuera de rango (10 000–4 000 000)'; end if;
  if p_public_max_kb is null or p_public_max_kb < 100 or p_public_max_kb > 8000 then raise exception 'tamaño público fuera de rango (100–8000 KB)'; end if;
  insert into public.app_settings (key, value)
  values ('geo', jsonb_build_object('quota_mb', p_quota_mb, 'max_layers', p_max_layers, 'max_pixels', p_max_pixels, 'public_max_kb', p_public_max_kb))
  on conflict (key) do update set value = excluded.value;
  return public._geo_settings();
end $$;

-- Cuota individual (p_mb null = vuelve a la global). Sube o baja; nunca borra nada.
create or replace function public.admin_set_user_quota(p_email text, p_mb int) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'no existe una cuenta con ese correo'; end if;
  update public.profiles set geo_quota_mb = p_mb where id = uid;
end $$;

create or replace function public.admin_geo_usage() returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.used_bytes desc) from (
      select u.id as user_id, u.email, pr.full_name as name,
             coalesce(x.bytes, 0) as used_bytes, coalesce(x.layers, 0) as layers,
             (select count(*) from public.projects pj where pj.owner_id = u.id and pj.kind = 'spatial') as projects,
             public._geo_quota_bytes(u.id) as quota_bytes, pr.geo_quota_mb as custom_mb
        from auth.users u join public.profiles pr on pr.id = u.id
        left join lateral public._geo_used(u.id) x on true
       where coalesce(x.layers, 0) > 0 or pr.geo_quota_mb is not null
             or exists (select 1 from public.projects pj where pj.owner_id = u.id and pj.kind = 'spatial')
    ) t), '[]'::jsonb);
end $$;

-- Objetos de `geo-layers` cuyo proyecto ya no existe (quedan al borrar proyectos o al fallar una subida).
create or replace function public.admin_geo_orphans() returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', o.name, 'bytes', coalesce((o.metadata->>'size')::bigint, 0)))
      from storage.objects o
     where o.bucket_id = 'geo-layers'
       and public._geo_is_orphan(o.name)
  ), '[]'::jsonb);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'admin_geo_settings()', 'admin_set_geo_settings(int,int,int,int)', 'admin_set_user_quota(text,int)',
    'admin_geo_usage()', 'admin_geo_orphans()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ───────────────────────── Privilegios explícitos ─────────────────────────
-- En Supabase, las funciones nuevas reciben EXECUTE para anon/authenticated por privilegios por
-- defecto, y `revoke ... from public` NO los quita. Se revocan a mano: los ayudantes internos no
-- son llamables desde la API (solo desde otras funciones SECURITY DEFINER) y lo que exige sesión
-- no queda abierto a `anon`. Se aplica también a `_rate_limit` (migración 6), que estaba abierta.
revoke all on function public._geo_settings(), public._geo_used(uuid), public._geo_quota_bytes(uuid),
  public._rate_limit(text, int, interval) from public, anon, authenticated;
revoke all on function public.geo_settings(), public.geo_quota(), public.geo_check_upload(text, bigint),
  public.geo_publish_result(uuid, text, jsonb), public.admin_geo_settings(),
  public.admin_set_geo_settings(int, int, int, int), public.admin_set_user_quota(text, int),
  public.admin_geo_usage(), public.admin_geo_orphans() from public, anon;
