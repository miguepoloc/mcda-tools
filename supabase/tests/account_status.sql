-- Pruebas de las migraciones 14 (profiles cerrado) y 15 (suspender / pausar / eliminar cuenta).
-- Corre después de todas las migraciones, en el mismo PostgreSQL temporal que geo_rls.sql.
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

-- U1 y U2 estudiantes, D docente (admin), D2 segundo admin
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-00000000000a', 'u1@x.co'), ('22222222-0000-0000-0000-00000000000b', 'u2@x.co'),
  ('dddddddd-0000-0000-0000-00000000000d', 'd@x.co'),  ('eeeeeeee-0000-0000-0000-00000000000e', 'd2@x.co');
insert into public.profiles (id, full_name) values
  ('11111111-0000-0000-0000-00000000000a', 'U1'), ('22222222-0000-0000-0000-00000000000b', 'U2'),
  ('dddddddd-0000-0000-0000-00000000000d', 'D'),  ('eeeeeeee-0000-0000-0000-00000000000e', 'D2')
on conflict (id) do nothing;
update public.profiles set role = 'admin' where id in ('dddddddd-0000-0000-0000-00000000000d', 'eeeeeeee-0000-0000-0000-00000000000e');

insert into public.projects (id, owner_id, title, is_public, public_token) values
  ('11110000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000a', 'P de U1', true, 'tok-u1-pub'),
  ('22220000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-00000000000b', 'P de U2', true, 'tok-u2-pub');
insert into public.experts (id, project_id, name, invite_token) values
  ('11110000-0000-0000-0000-0000000000e1', '11110000-0000-0000-0000-000000000001', 'Exp U1', 'tok-u1-exp'),
  ('22220000-0000-0000-0000-0000000000e2', '22220000-0000-0000-0000-000000000002', 'Exp U2', 'tok-u2-exp');
insert into storage.objects (bucket_id, name, metadata) values
  ('geo-layers', '11111111-0000-0000-0000-00000000000a/11110000-0000-0000-0000-000000000001/x.f32.gz', '{"size": 1000}');

\set U1 '''11111111-0000-0000-0000-00000000000a'''
\set U2 '''22222222-0000-0000-0000-00000000000b'''
\set D  '''dddddddd-0000-0000-0000-00000000000d'''

-- ══════════════ migración 14: profiles ya no se escala ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.err('update public.profiles set role = ''admin'' where id = auth.uid()', 'permission denied', 'U1 NO puede ponerse role=admin (escalamiento cerrado)');
select t.err('update public.profiles set geo_quota_mb = 10240 where id = auth.uid()', 'permission denied', 'U1 NO puede subirse su cuota');
select t.err('update public.profiles set suspended_at = null where id = auth.uid()', 'permission denied', 'U1 NO puede tocar suspended_at');
select t.err('update public.profiles set paused_at = now() where id = auth.uid()', 'permission denied', 'U1 NO puede tocar paused_at directamente');
select t.err('delete from public.profiles where id = auth.uid()', 'permission denied', 'U1 NO puede borrar su fila de perfil');
select t.err('insert into public.profiles (id, full_name) values (gen_random_uuid(), ''x'')', 'permission denied', 'U1 NO puede insertar perfiles');
update public.profiles set full_name = 'U1 editado' where id = auth.uid();
select t.ok((select full_name from public.profiles where id = auth.uid()) = 'U1 editado', 'U1 SÍ puede cambiar su nombre');
select t.ok((select count(*) from public.profiles) = 1, 'U1 solo ve su propia fila de perfil');
select t.ok(not public.is_admin(), 'U1 sigue sin ser admin');
reset role;

-- ══════════════ funciones cerradas a quien no debe ══════════════
set role anon;
select t.err('select public.admin_set_user_status(''11111111-0000-0000-0000-00000000000a'', ''suspend'', ''x'')', 'permission denied', 'anon NO llama admin_set_user_status');
select t.err('select public.pause_my_account()', 'permission denied', 'anon NO llama pause_my_account');
select t.err('select public.delete_my_account()', 'permission denied', 'anon NO llama delete_my_account');
select t.err('select public._user_ok(''11111111-0000-0000-0000-00000000000a'')', 'permission denied', 'anon NO llama al ayudante interno _user_ok');
select t.err('select public.admin_account_events()', 'permission denied', 'anon NO ve la auditoría');
reset role;

-- ══════════════ el admin suspende ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.err('select public.admin_set_user_status(''22222222-0000-0000-0000-00000000000b'', ''suspend'', ''intento'')', 'no autorizado', 'U1 (no admin) NO suspende a nadie');
select t.err('select public.admin_users_activity()', 'no autorizado', 'U1 (no admin) NO lista usuarios');
select t.err('select public.admin_account_events()', 'no autorizado', 'U1 (no admin) NO ve la auditoría');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select t.err('select public.admin_set_user_status(''dddddddd-0000-0000-0000-00000000000d'', ''suspend'', ''yo'')', 'propia cuenta', 'D NO puede suspenderse a sí mismo');
select t.err('select public.admin_set_user_status(''eeeeeeee-0000-0000-0000-00000000000e'', ''suspend'', ''otro admin'')', 'admin no se pueden suspender', 'D NO puede suspender a otro admin');
select t.err('select public.admin_set_user_status(''11111111-0000-0000-0000-00000000000a'', ''suspend'', ''  '')', 'motivo', 'D: suspender exige motivo');
select t.err('select public.admin_set_user_status(''11111111-0000-0000-0000-00000000000a'', ''suspend'', repeat(''x'', 501))', '500 caracteres', 'D: el motivo no pasa de 500');
select t.err('select public.admin_set_user_status(''99999999-0000-0000-0000-000000000009'', ''suspend'', ''motivo'')', 'no existe', 'D: cuenta inexistente da error claro');
select t.err('select public.admin_set_user_status(''11111111-0000-0000-0000-00000000000a'', ''borrar'', ''motivo'')', 'acción no válida', 'D: acción desconocida se rechaza');
select public.admin_set_user_status('11111111-0000-0000-0000-00000000000a', 'suspend', 'Subida masiva de archivos');
select t.ok((select estado from jsonb_to_recordset(public.admin_users_activity()) as x(email text, estado text) where email = 'u1@x.co') = 'suspendida', 'D ve a U1 como suspendida');
reset role;
select t.ok((select banned_until from auth.users where email = 'u1@x.co') > now() + interval '50 years', 'auth.users.banned_until de U1 queda puesto (rechaza login y refresh)');
select t.ok((select banned_until from auth.users where email = 'u2@x.co') is null, 'U2 no se ve afectado');

-- ══════════════ U1 suspendido: TODO se corta ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.ok((select count(*) from public.projects) = 0, 'U1 suspendido: ya no ve sus proyectos (RLS restrictiva)');
select t.ok((select count(*) from public.experts) = 0, 'U1 suspendido: ya no ve sus expertos');
select t.err('insert into public.projects (owner_id, title) values (auth.uid(), ''nuevo'')', 'row-level security', 'U1 suspendido: NO crea proyectos');
with u as (update public.projects set title = 'x' where id = '11110000-0000-0000-0000-000000000001' returning 1) select t.ok((select count(*) from u) = 0, 'U1 suspendido: NO edita sus proyectos (RLS restrictiva)');
select t.ok((select count(*) from storage.objects where bucket_id = 'geo-layers') = 0, 'U1 suspendido: no lee sus capas de Storage');
select t.err('select public.geo_quota()', 'cuenta no activa', 'U1 suspendido: geo_quota rechazada');
select t.err('select public.geo_check_upload(''11111111-0000-0000-0000-00000000000a/11110000-0000-0000-0000-000000000001/n.f32.gz'', 10)', 'cuenta no activa', 'U1 suspendido: NO reserva subidas');
select t.err('select public.geo_publish_result(''11110000-0000-0000-0000-000000000001'', ''abc'', ''{}''::jsonb)', 'cuenta no activa', 'U1 suspendido: NO publica mapas');
select t.ok(public.my_account_status() = 'suspended', 'my_account_status = suspended');
select t.ok(public.resume_my_account() = 'suspended', 'U1 NO puede reactivarse iniciando sesión');
select t.err('select public.pause_my_account()', 'suspendida', 'U1 suspendido: no puede «pausarse» para cambiar de estado');
select t.err('select public.delete_my_account()', 'suspendida', 'U1 suspendido: NO puede eliminarse para escapar');
select t.ok((select count(*) from public.profiles where id = auth.uid()) = 1, 'U1 aún ve su propio perfil (para mostrar el aviso)');
reset role;

-- enlaces anónimos del dueño suspendido: apagados
set role anon;
select t.ok(public.expert_get('tok-u1-exp') is null, 'enlace de experto de U1 apagado (expert_get → null)');
select t.err('select public.expert_save(''tok-u1-exp'', ''crit'', ''a-b'', 1)', 'enlace no válido', 'enlace de experto de U1 apagado (expert_save)');
select t.err('select public.expert_submit(''tok-u1-exp'')', 'enlace no válido', 'enlace de experto de U1 apagado (expert_submit)');
select t.ok(public.public_get('tok-u1-pub') is null, 'enlace público de U1 apagado (public_get → null)');
select t.ok(public.public_get('tok-u2-pub') is not null, 'enlace público de U2 sigue vivo');
select t.ok(public.expert_get('tok-u2-exp') is not null, 'enlace de experto de U2 sigue vivo');
reset role;

-- U2 sigue trabajando normal
set role authenticated; select set_config('request.jwt.claim.sub', :U2, false);
select t.ok((select count(*) from public.projects) = 1, 'U2 ve su proyecto');
insert into public.projects (owner_id, title) values (auth.uid(), 'U2 sigue creando');
select t.ok((select count(*) from public.projects) = 2, 'U2 puede crear proyectos');
reset role;

-- ══════════════ el admin reactiva ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select public.admin_set_user_status('11111111-0000-0000-0000-00000000000a', 'reactivate');
reset role;
select t.ok((select banned_until from auth.users where email = 'u1@x.co') is null, 'reactivar quita banned_until');
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.ok((select count(*) from public.projects) = 1, 'U1 reactivado: ve sus proyectos otra vez');
select t.ok(public.my_account_status() = 'active', 'U1 reactivado: estado active');
reset role;
set role anon;
select t.ok(public.public_get('tok-u1-pub') is not null, 'reactivado: el enlace público de U1 vuelve igual');
reset role;

-- ══════════════ pausa del propio usuario ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select public.pause_my_account();
select t.ok(public.my_account_status() = 'paused', 'U1: estado paused');
select t.ok((select count(*) from public.projects) = 0, 'U1 pausado: RLS restrictiva corta sus datos');
reset role;
select t.ok((select banned_until from auth.users where email = 'u1@x.co') is null, 'pausar NO pone banned_until (puede volver a entrar)');
set role anon;
select t.ok(public.public_get('tok-u1-pub') is null, 'U1 pausado: su enlace público se apaga');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.ok(public.resume_my_account() = 'resumed', 'volver a iniciar sesión reactiva la pausa');
select t.ok(public.resume_my_account() = 'active', 'reanudar de nuevo es un no-op');
select t.ok((select count(*) from public.projects) = 1, 'U1 reactivado tras pausa: ve sus proyectos');
reset role;

-- ══════════════ auditoría ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select t.ok((select count(*) from jsonb_to_recordset(public.admin_account_events()) as x(accion text) where accion = 'suspend') = 1, 'auditoría: 1 suspensión registrada');
select t.ok((select motivo from jsonb_to_recordset(public.admin_account_events()) as x(accion text, motivo text) where accion = 'suspend') = 'Subida masiva de archivos', 'auditoría: guarda el motivo');
select t.ok((select actor_email from jsonb_to_recordset(public.admin_account_events()) as x(accion text, actor_email text) where accion = 'suspend') = 'd@x.co', 'auditoría: guarda QUIÉN suspendió');
select t.ok((select autoservicio from jsonb_to_recordset(public.admin_account_events()) as x(accion text, autoservicio boolean) where accion = 'pause'), 'auditoría: distingue lo que hizo el propio usuario');
reset role;

-- ══════════════ eliminar cuenta ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select t.err('select public.delete_my_account()', 'admin no se elimina', 'un admin NO se elimina desde el botón');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :U2, false);
select public.delete_my_account();
reset role;
select t.ok(not exists (select 1 from auth.users where email = 'u2@x.co'), 'eliminar: la cuenta de Auth desaparece');
select t.ok(not exists (select 1 from public.profiles where id = '22222222-0000-0000-0000-00000000000b'), 'eliminar: cae el perfil (cascade)');
select t.ok(not exists (select 1 from public.projects where owner_id = '22222222-0000-0000-0000-00000000000b'), 'eliminar: caen sus proyectos (cascade)');
select t.ok(not exists (select 1 from public.experts where id = '22220000-0000-0000-0000-0000000000e2'), 'eliminar: caen sus expertos (cascade)');
select t.ok(exists (select 1 from public.projects where owner_id = '11111111-0000-0000-0000-00000000000a'), 'eliminar a U2 no toca los proyectos de U1');
select t.ok((select count(*) from public.account_events where user_id = '22222222-0000-0000-0000-00000000000b' and action = 'delete') = 1, 'eliminar: queda el evento en la auditoría');
select t.ok((select count(*) from public.account_events where user_id = '22222222-0000-0000-0000-00000000000b' and user_email is not null) = 0, 'eliminar: no queda su correo en la auditoría');
set role anon;
select t.ok(public.public_get('tok-u2-pub') is null, 'eliminar: su enlace público deja de existir');
reset role;

-- ══════════════ el admin confirma un correo y elimina cuentas ajenas ══════════════
insert into auth.users (id, email, email_confirmed_at) values ('33333333-0000-0000-0000-00000000000c', 'u3@x.co', null);
insert into auth.users (id, email) values ('44444444-0000-0000-0000-00000000000f', 'u4@x.co');
insert into public.profiles (id, full_name) values ('33333333-0000-0000-0000-00000000000c', 'U3 sin confirmar'), ('44444444-0000-0000-0000-00000000000f', 'U4 a eliminar') on conflict (id) do nothing;
insert into public.projects (id, owner_id, title) values ('44440000-0000-0000-0000-000000000004', '44444444-0000-0000-0000-00000000000f', 'P de U4');
set role anon;
select t.err('select public.admin_confirm_user_email(''33333333-0000-0000-0000-00000000000c'')', 'permission denied', 'anon NO confirma correos');
select t.err('select public.admin_delete_user(''44444444-0000-0000-0000-00000000000f'', ''motivo'')', 'permission denied', 'anon NO elimina cuentas ajenas');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :U1, false);
select t.err('select public.admin_confirm_user_email(''33333333-0000-0000-0000-00000000000c'')', 'no autorizado', 'U1 (no admin) NO confirma correos');
select t.err('select public.admin_delete_user(''44444444-0000-0000-0000-00000000000f'', ''motivo'')', 'no autorizado', 'U1 (no admin) NO elimina cuentas ajenas');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select t.ok((select not correo_confirmado from jsonb_to_recordset(public.admin_users_activity()) as x(email text, correo_confirmado boolean) where email = 'u3@x.co'), 'D ve a U3 con el correo sin confirmar');
select t.ok((select correo_confirmado from jsonb_to_recordset(public.admin_users_activity()) as x(email text, correo_confirmado boolean) where email = 'u1@x.co'), 'D ve a U1 con el correo confirmado');
select public.admin_confirm_user_email('33333333-0000-0000-0000-00000000000c');
select t.ok((select correo_confirmado from jsonb_to_recordset(public.admin_users_activity()) as x(email text, correo_confirmado boolean) where email = 'u3@x.co'), 'D confirmó el correo de U3');
select t.err('select public.admin_confirm_user_email(''33333333-0000-0000-0000-00000000000c'')', 'ya estaba confirmado', 'confirmar dos veces da error claro');
select t.err('select public.admin_confirm_user_email(''99999999-0000-0000-0000-000000000009'')', 'no existe', 'confirmar una cuenta inexistente da error claro');
select t.ok((select count(*) from jsonb_to_recordset(public.admin_account_events()) as x(accion text, actor_email text) where accion = 'confirm_email' and actor_email = 'd@x.co') = 1, 'auditoría: quedó quién confirmó el correo');
select t.err('select public.admin_delete_user(''44444444-0000-0000-0000-00000000000f'', '' '')', 'motivo', 'eliminar exige motivo');
select t.err('select public.admin_delete_user(''dddddddd-0000-0000-0000-00000000000d'', ''yo'')', 'propia cuenta', 'D NO puede eliminarse a sí mismo por esta vía');
select t.err('select public.admin_delete_user(''eeeeeeee-0000-0000-0000-00000000000e'', ''otro admin'')', 'admin no se pueden eliminar', 'D NO puede eliminar a otro admin');
select t.err('select public.admin_delete_user(''99999999-0000-0000-0000-000000000009'', ''motivo'')', 'no existe', 'eliminar una cuenta inexistente da error claro');
select public.admin_delete_user('44444444-0000-0000-0000-00000000000f', 'Cuenta duplicada');
select t.ok(not exists (select 1 from jsonb_to_recordset(public.admin_users_activity()) as x(email text) where email = 'u4@x.co'), 'D eliminó a U4: ya no aparece');
reset role;
select t.ok(not exists (select 1 from auth.users where email = 'u4@x.co') and not exists (select 1 from public.projects where owner_id = '44444444-0000-0000-0000-00000000000f'), 'eliminar por admin: cae la cuenta y sus proyectos (cascade)');
select t.ok(exists (select 1 from public.profiles where id = '11111111-0000-0000-0000-00000000000a'), 'eliminar a U4 no toca a U1');
set role authenticated; select set_config('request.jwt.claim.sub', :D, false);
select t.ok((select usuario_email from jsonb_to_recordset(public.admin_account_events()) as x(accion text, motivo text, usuario_email text, autoservicio boolean) where accion = 'delete' and motivo = 'Cuenta duplicada') = 'u4@x.co', 'auditoría: la eliminación por un admin CONSERVA el correo y el motivo');
select t.ok(not (select autoservicio from jsonb_to_recordset(public.admin_account_events()) as x(accion text, motivo text, autoservicio boolean) where accion = 'delete' and motivo = 'Cuenta duplicada'), 'auditoría: se distingue de una autoeliminación');
-- un admin también puede eliminar una cuenta suspendida
select public.admin_set_user_status('11111111-0000-0000-0000-00000000000a', 'suspend', 'para eliminar');
select public.admin_delete_user('11111111-0000-0000-0000-00000000000a', 'Cuenta abusiva');
reset role;
select t.ok(not exists (select 1 from auth.users where email = 'u1@x.co'), 'un admin SÍ puede eliminar una cuenta suspendida');

\echo
\echo 'Todo OK (account_status.sql)'
