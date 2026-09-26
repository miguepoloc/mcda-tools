-- Pruebas de seguridad y lógica del Geovisor (migraciones 10–12) contra un PostgreSQL local con
-- los sustitutos de stubs.sql. Cada bloque cambia de rol como lo haría la API de Supabase
-- (anon / authenticated con `request.jwt.claim.sub`) y comprueba lo que SÍ y lo que NO debe pasar.
\set ON_ERROR_STOP on
\set QUIET on

create schema if not exists t;
grant usage on schema t to public;
create or replace function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FALLA: %', msg; end if; raise notice 'ok    %', msg; end $$;
create or replace function t.err(stmt text, pat text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm ~* pat then raise notice 'ok    % (%)', msg, left(sqlerrm, 70); return; end if;
    raise exception 'FALLA: % — error inesperado: %', msg, sqlerrm;
  end;
  raise exception 'FALLA: % — debía fallar y no falló', msg;
end $$;
grant execute on all functions in schema t to public;

-- ── datos: A y B estudiantes, C docente (admin) ──
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x.co'), ('bbbbbbbb-0000-0000-0000-000000000002', 'b@x.co'), ('cccccccc-0000-0000-0000-000000000003', 'c@x.co');
insert into public.profiles (id, full_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A'), ('bbbbbbbb-0000-0000-0000-000000000002', 'B'), ('cccccccc-0000-0000-0000-000000000003', 'C')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id = 'cccccccc-0000-0000-0000-000000000003';

insert into public.projects (id, owner_id, title, kind, method, is_public, public_token) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mapa A', 'spatial', 'saw', true,  'tok-a-spatial'),
  ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Decision A', 'decision', 'ahp', true,  'tok-a-decision'),
  ('a3000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mapa A privado', 'spatial', 'saw', false, 'tok-a-priv'),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Mapa B', 'spatial', 'saw', false, 'tok-b');

-- objetos de Storage simulados: A ya usa 50 MB en 2 capas
insert into storage.objects (bucket_id, name, metadata) values
  ('geo-layers', 'aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/x.f32.gz', '{"size": 30000000}'),
  ('geo-layers', 'aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/y.f32.gz', '{"size": 20000000}'),
  ('geo-layers', 'bbbbbbbb-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000001/z.f32.gz', '{"size": 1000}');

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

-- ══════════════ helper is_admin y funciones abiertas/cerradas a anon ══════════════
set role anon;
select t.err('select public._geo_used(''aaaaaaaa-0000-0000-0000-000000000001'')', 'permission denied', 'anon NO puede llamar el ayudante interno _geo_used');
select t.err('select public._rate_limit(''k'', 1, interval ''1 minute'')', 'permission denied', 'anon NO puede llamar _rate_limit');
select t.err('select public.geo_quota()', 'permission denied', 'anon NO puede llamar geo_quota');
select t.err('select public.geo_check_upload(''x/y/z'', 1)', 'permission denied', 'anon NO puede llamar geo_check_upload');
select t.err('select public.admin_geo_usage()', 'permission denied', 'anon NO puede llamar admin_geo_usage');
select t.err('select public.admin_users_activity()', 'permission denied', 'anon NO puede llamar admin_users_activity');
select t.ok(public.is_admin() = false, 'is_admin() es false para anon');
reset role;

-- ══════════════ cuota ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.ok((public.geo_quota()->>'used_bytes')::bigint = 50000000, 'A: uso real leído de storage.objects (50 MB)');
select t.ok((public.geo_quota()->>'quota_bytes')::bigint = 60 * 1048576, 'A: cuota por defecto 60 MB');
select t.ok((public.geo_quota()->>'layers')::int = 2, 'A: 2 capas');
select public.geo_check_upload('aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz', 5000000);
select t.err('select public.geo_check_upload(''aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz'', 20000000)', 'Cuota de mapas superada', 'A: subir 20 MB más rebasa la cuota');
select public.geo_check_upload('aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/x.f32.gz', 40000000);
select t.err('select public.geo_check_upload(''aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/x.f32.gz'', 50000000)', 'Cuota de mapas superada', 'A: reemplazar x.f32.gz por 50 MB rebasa (50-30+50>60)');
select t.err('select public.geo_check_upload(''bbbbbbbb-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000001/q'', 1)', 'ruta no permitida', 'A: no puede reservar en la carpeta de B');
select t.err('select public.admin_set_user_quota(''a@x.co'', 999)', 'no autorizado', 'A (no admin) NO puede cambiar cuotas');
select t.err('select public.admin_set_geo_settings(10, 5, 100000, 1000)', 'no autorizado', 'A (no admin) NO puede cambiar topes globales');
select t.err('select public.admin_geo_usage()', 'no autorizado', 'A (no admin) NO ve el uso de todos');
select t.err('select public.admin_geo_orphans()', 'no autorizado', 'A (no admin) NO ve huérfanos');
select t.err('select public.admin_users_activity()', 'no autorizado', 'A (no admin) NO ve el último acceso de los demás');
select t.ok((public.geo_settings()->>'max_layers')::int = 16, 'A puede leer los topes globales');
reset role;

-- ══════════════ el admin edita cuota y topes (sube y baja) ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select t.ok(public.is_admin(), 'C es admin');
select public.admin_set_user_quota('a@x.co', 200);
select t.err('select public.admin_set_user_quota(''nadie@x.co'', 5)', 'no existe una cuenta', 'C: correo inexistente da error claro');
select t.err('select public.admin_set_geo_settings(-1, 5, 100000, 1000)', 'fuera de rango', 'C: valores absurdos se rechazan');
select t.err('select public.admin_set_geo_settings(60, 0, 100000, 1000)', 'fuera de rango', 'C: max_layers=0 se rechaza');
select public.admin_set_geo_settings(80, 3, 2000000, 3000);
select t.ok((public.admin_geo_settings()->>'quota_mb')::int = 80, 'C: quota_mb global editado a 80');
select t.ok(exists (select 1 from jsonb_array_elements(public.admin_geo_usage()) e where e->>'email' = 'a@x.co' and (e->>'quota_bytes')::bigint = 200*1048576 and (e->>'used_bytes')::bigint = 50000000), 'C: uso de A visible con su cuota individual');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select public.geo_check_upload('aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz', 100000000);
select t.err('select public.geo_check_upload(''aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz'', 160000000)', 'Cuota de mapas superada', 'A: con 200 MB propios, 160+50 sigue rebasando');
reset role;
-- B usa la global (80): 1000 B ok; bajar la cuota individual de A por debajo de su uso NO borra nada
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select public.admin_set_user_quota('a@x.co', 10);
reset role;
select t.ok((select count(*) from storage.objects where bucket_id = 'geo-layers') = 3, 'bajar la cuota no borró ningún objeto');
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.err('select public.geo_check_upload(''aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz'', 1)', 'Cuota de mapas superada', 'A sobre la cuota: se bloquean nuevas subidas');
reset role;
-- tope de capas (max_layers = 3): B tiene 1; A tiene 2 → una nueva de A pasa; con cuota global
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select public.admin_set_user_quota('a@x.co', null);
select public.admin_set_geo_settings(80, 2, 2000000, 3000);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.err('select public.geo_check_upload(''aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/n.f32.gz'', 1000)', 'Máximo de 2 capas', 'A: con 2 capas y tope 2 no puede añadir una tercera');
select public.geo_check_upload('aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/x.f32.gz', 1000);
reset role;
update public.app_settings set value = jsonb_set(value, '{max_layers}', '16');

-- ══════════════ publicar resultado ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.ok(public.geo_publish_result('a1000000-0000-0000-0000-000000000001', 'H4sIAAAA', '{"w":2}'::jsonb) is not null, 'A publica su mapa');
select t.ok(public.geo_publish_result('a1000000-0000-0000-0000-000000000001', 'H4sIBBBB', '{"w":3}'::jsonb) is not null, 'A vuelve a publicar (upsert)');
select t.ok((select count(*) from public.geo_results) = 1, 'A: una sola fila tras republicar');
select t.err('select public.geo_publish_result(''b1000000-0000-0000-0000-000000000001'', ''xx'', ''{}''::jsonb)', 'proyecto no encontrado', 'A NO publica en el proyecto de B');
select t.err('select public.geo_publish_result(''a2000000-0000-0000-0000-000000000002'', ''xx'', ''{}''::jsonb)', 'solo los mapas', 'A NO publica un proyecto de decisión como mapa');
select t.err('select public.geo_publish_result(''a1000000-0000-0000-0000-000000000001'', repeat(''A'', 4000000), ''{}''::jsonb)', 'máximo para publicar', 'A: un mapa de 4 MB rebasa el tope de 3 MB');
select t.err('select public.geo_publish_result(''a1000000-0000-0000-0000-000000000001'', '''', ''{}''::jsonb)', 'mapa vacío', 'mapa vacío se rechaza');
select t.err('insert into public.geo_results (project_id, grid_b64, meta, size_bytes) values (''a3000000-0000-0000-0000-000000000003'', ''x'', ''{}'', 1)', 'row-level security|permission denied', 'A NO inserta directo en geo_results (solo por la función)');
select t.ok((select count(*) from public.geo_results) = 1, 'A lee su resultado (RLS dueño)');
reset role;
update public.geo_results set grid_b64 = 'H4sIBBBB' ;
set role authenticated; select set_config('request.jwt.claim.sub', :B, false);
select t.ok((select count(*) from public.geo_results) = 0, 'B NO ve el resultado de A (RLS)');
reset role;
set role anon;
select t.err('select public.geo_publish_result(''a1000000-0000-0000-0000-000000000001'', ''xx'', ''{}''::jsonb)', 'permission denied', 'anon NO publica');
select t.ok((select count(*) from public.geo_results) = 0, 'anon NO lee geo_results');

-- ══════════════ vista pública ══════════════
select t.ok(public.public_geo_get('tok-a-spatial')->>'status' = 'ok', 'anon: mapa público publicado → ok');
select t.ok(public.public_geo_get('tok-a-spatial')->>'grid_b64' = 'H4sIBBBB', 'anon: recibe el mapa publicado');
select t.ok(not (public.public_geo_get('tok-a-spatial') ? 'criteria') and not (public.public_geo_get('tok-a-spatial') ? 'experts'), 'anon: no recibe criterios ni expertos');
select t.ok(public.public_geo_get('tok-a-decision') is null, 'anon: un proyecto de DECISIÓN no sale por public_geo_get');
select t.ok(public.public_geo_get('tok-a-priv') is null, 'anon: proyecto NO público → null');
select t.ok(public.public_geo_get('tok-b') is null, 'anon: proyecto de B no público → null');
select t.ok(public.public_geo_get('no-existe') is null, 'anon: token inválido → null');
reset role;
update public.projects set is_public = true where id = 'a3000000-0000-0000-0000-000000000003';
set role anon;
select t.ok(public.public_geo_get('tok-a-priv')->>'status' = 'unpublished', 'anon: público pero sin publicar → status unpublished');
reset role;
update public.projects set is_public = false where id = 'a1000000-0000-0000-0000-000000000001';
set role anon;
select t.ok(public.public_geo_get('tok-a-spatial') is null, 'anon: al quitar «público» se revoca al instante');
reset role;
-- rate limit
do $$ begin
  for i in 1..60 loop perform public._rate_limit('public_geo_get:tok-rl', 60, interval '1 minute'); end loop;
end $$;
set role anon;
select t.err('select public.public_geo_get(''tok-rl'')', 'Demasiadas solicitudes', 'public_geo_get tiene límite de frecuencia');
reset role;
update public.projects set is_public = true where id = 'a1000000-0000-0000-0000-000000000001';
-- borrar el proyecto borra su resultado publicado
delete from public.projects where id = 'a3000000-0000-0000-0000-000000000003';
select t.ok((select count(*) from public.geo_results where project_id = 'a3000000-0000-0000-0000-000000000003') = 0, 'borrar el proyecto borra su resultado (cascade)');

-- ══════════════ catálogo (tabla + bucket público) ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.err('insert into public.geo_packs (id, title, definition) values (''mi-paquete'', ''X'', ''{}'')', 'row-level security', 'A (estudiante) NO crea paquetes');
select t.err('insert into storage.objects (bucket_id, name, metadata) values (''geo-catalog'', ''cat/x/y.f32.gz'', ''{}'')', 'row-level security', 'A NO sube al bucket del catálogo');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
insert into public.geo_packs (id, title, definition, created_by) values ('boya-v1', 'Boya', '{"criteria": []}', 'cccccccc-0000-0000-0000-000000000003');
insert into public.geo_packs (id, title, definition, is_active) values ('viejo', 'Viejo', '{}', false);
select t.err('insert into public.geo_packs (id, title, definition) values (''MAL ID'', ''X'', ''{}'')', 'check constraint', 'id de paquete con formato inválido se rechaza');
insert into storage.objects (bucket_id, name, metadata) values ('geo-catalog', 'cat/boya-v1/x.f32.gz', '{"size": 10}');
select t.ok((select count(*) from public.geo_packs) = 2, 'C (admin) ve todos los paquetes');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
select t.ok((select count(*) from public.geo_packs) = 1 and (select id from public.geo_packs) = 'boya-v1', 'A ve solo los paquetes activos');
update public.geo_packs set title = 'hack' where id = 'boya-v1';
reset role;
select t.ok((select title from public.geo_packs where id = 'boya-v1') = 'Boya', 'el UPDATE de A sobre un paquete no cambió nada (RLS)');
set role anon;
select t.ok((select count(*) from public.geo_packs) = 0, 'anon NO lista paquetes (van por sesión)');
reset role;

-- ══════════════ Storage geo-layers ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
insert into storage.objects (bucket_id, name, metadata) values ('geo-layers', 'aaaaaaaa-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/ok.f32.gz', '{"size": 5}');
select t.err('insert into storage.objects (bucket_id, name, metadata) values (''geo-layers'', ''bbbbbbbb-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000001/hack.f32.gz'', ''{}'')', 'row-level security', 'A NO sube a la carpeta de B');
select t.ok((select count(*) from storage.objects where bucket_id = 'geo-layers') = 3, 'A ve solo sus 3 objetos (no el de B)');
delete from storage.objects where name like 'bbbbbbbb%';
reset role;
select t.ok((select count(*) from storage.objects where name like 'bbbbbbbb%') = 1, 'A NO borra objetos de B');
set role authenticated; select set_config('request.jwt.claim.sub', :B, false);
select t.ok((select count(*) from storage.objects where bucket_id = 'geo-layers') = 1, 'B ve solo el suyo');
reset role;

-- ══════════════ huérfanos ══════════════
insert into storage.objects (bucket_id, name, metadata) values
  ('geo-layers', 'aaaaaaaa-0000-0000-0000-000000000001/99999999-0000-0000-0000-000000000009/vieja.f32.gz', '{"size": 777}');
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select t.ok(jsonb_array_length(public.admin_geo_orphans()) = 1 and public.admin_geo_orphans()->0->>'name' like '%vieja.f32.gz', 'C detecta exactamente el huérfano (proyecto inexistente)');
delete from storage.objects where name like '%vieja.f32.gz';
select t.ok(jsonb_array_length(public.admin_geo_orphans()) = 0, 'C (admin) puede borrar el huérfano');
delete from storage.objects where name like 'bbbbbbbb%';
reset role;
select t.ok((select count(*) from storage.objects where name like 'bbbbbbbb%') = 1, 'C (admin) NO borra las capas de un proyecto vivo');
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select t.ok((select count(*) from storage.objects where bucket_id = 'geo-layers' and name like 'aaaaaaaa%') = 0, 'C (admin) NO ve las capas vivas de los estudiantes');
reset role;

-- ══════════════ último acceso (auth.users.last_sign_in_at) ══════════════
update auth.users set last_sign_in_at = '2026-09-20 10:00+00' where email = 'a@x.co';
update auth.users set last_sign_in_at = '2026-09-24 08:00+00' where email = 'b@x.co';
set role authenticated; select set_config('request.jwt.claim.sub', :C, false);
select t.ok(jsonb_array_length(public.admin_users_activity()) = 3, 'C (admin) ve las 3 cuentas');
select t.ok(public.admin_users_activity()->0->>'email' = 'b@x.co', 'C: la más reciente va primero');
select t.ok(public.admin_users_activity()->2->>'ultimo_acceso' is null, 'C: quien nunca inició sesión va al final con ultimo_acceso null');
reset role;

\echo
\echo 'Todo OK (geo_rls.sql)'
