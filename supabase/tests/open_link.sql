-- Pruebas del enlace abierto de autorregistro de expertos (migración 16: open_token/open_enabled/open_join).
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

insert into auth.users (id, email) values
  ('a1111111-0000-0000-0000-00000000000a', 'oa1@x.co'), ('a2222222-0000-0000-0000-00000000000b', 'oa2@x.co')
on conflict (id) do nothing;
insert into public.profiles (id, full_name) values
  ('a1111111-0000-0000-0000-00000000000a', 'OA1'), ('a2222222-0000-0000-0000-00000000000b', 'OA2')
on conflict (id) do nothing;

insert into public.projects (id, owner_id, title, is_public, public_token, open_token, open_enabled) values
  ('b1110000-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-00000000000a', 'P abierta', false, 'ol-tok-pub1', 'ol-open-tok-1', false);

\set OA1 '''a1111111-0000-0000-0000-00000000000a'''
\set OA2 '''a2222222-0000-0000-0000-00000000000b'''

-- ══════════════ open_info: lo que ve alguien antes de llenar el formulario ══════════════
set role anon;
select t.ok(public.open_info('no-existe') is null, 'open_info de un token inexistente → null');
select t.ok((public.open_info('ol-open-tok-1')->>'title') = 'P abierta', 'open_info devuelve el título del proyecto');
select t.ok((public.open_info('ol-open-tok-1')->>'open')::boolean = false, 'open_info dice que todavía está cerrado');

-- ══════════════ open_join: validaciones básicas ══════════════
select t.err('select public.open_join(''no-existe'', ''Ana'', ''Ing'')', 'enlace no válido', 'token inexistente da error');
select t.err('select public.open_join(''ol-open-tok-1'', ''Ana'', ''Ing'')', 'enlace no válido', 'open_enabled=false: el enlace no deja entrar');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub', :OA1, false);
update public.projects set open_enabled = true where id = 'b1110000-0000-0000-0000-000000000001';
reset role;

set role anon;
select t.ok((public.open_info('ol-open-tok-1')->>'open')::boolean = true, 'open_info refleja que ya está abierto');
select t.err('select public.open_join(''ol-open-tok-1'', '''', ''Ing'')', 'nombre no válido', 'nombre vacío rechazado');
select t.err('select public.open_join(''ol-open-tok-1'', ''  '', ''Ing'')', 'nombre no válido', 'nombre solo espacios rechazado');
select t.err(format('select public.open_join(''ol-open-tok-1'', %L, ''Ing'')', repeat('x', 201)), 'nombre no válido', 'nombre de más de 200 caracteres rechazado');

do $$
declare tok text;
begin
  select public.open_join('ol-open-tok-1', 'Ana Pérez', 'Ingeniera') into tok;
  if tok is null or char_length(tok) = 0 then raise exception 'FALLA: open_join no devolvió un token'; end if;
  perform set_config('t.new_token', tok, false);
end $$;
select t.ok(current_setting('t.new_token', true) is not null, 'open_join devolvió un invite_token nuevo');
reset role;

select t.ok((select count(*) from public.experts where project_id = 'b1110000-0000-0000-0000-000000000001' and joined_via = 'open') = 1,
  'quedó un experto nuevo con joined_via = open');
select t.ok((select name from public.experts where invite_token = current_setting('t.new_token', true)) = 'Ana Pérez',
  'el experto autorregistrado tiene el nombre enviado');
select t.ok((select filled_by from public.experts where invite_token = current_setting('t.new_token', true)) = 'expert',
  'el experto autorregistrado queda como filled_by = expert');

-- open_join reutiliza el mismo invite_token que ya usa expert_get/save/submit
set role anon;
select t.ok(public.expert_get(current_setting('t.new_token', true)) is not null,
  'el token que devuelve open_join sirve de una vez en expert_get (mismo flujo que un experto normal)');
reset role;

-- ══════════════ el dueño ve, edita y quita el autorregistrado igual que a cualquier experto ══════════════
set role authenticated; select set_config('request.jwt.claim.sub', :OA1, false);
select t.ok((select count(*) from public.experts where project_id = 'b1110000-0000-0000-0000-000000000001') = 1, 'OA1 ve al experto autorregistrado en su proyecto');
update public.experts set name = 'Ana P.' where invite_token = current_setting('t.new_token', true);
select t.ok((select name from public.experts where invite_token = current_setting('t.new_token', true)) = 'Ana P.', 'OA1 puede editar los datos del experto autorregistrado');
reset role;

-- otro dueño no puede activar/leer el enlace abierto de un proyecto ajeno
set role authenticated; select set_config('request.jwt.claim.sub', :OA2, false);
select t.ok((select count(*) from public.projects where id = 'b1110000-0000-0000-0000-000000000001') = 0, 'OA2 no ve el proyecto de OA1 (RLS ya existente)');
update public.projects set open_enabled = false where id = 'b1110000-0000-0000-0000-000000000001';
reset role;
select t.ok((select open_enabled from public.projects where id = 'b1110000-0000-0000-0000-000000000001') = true, 'el intento de OA2 no cambió open_enabled');

-- ══════════════ enlace abierto se corta si se suspende al dueño (mismo patrón que expert_get) ══════════════
update public.profiles set suspended_at = now() where id = 'a1111111-0000-0000-0000-00000000000a';
set role anon;
select t.err('select public.open_join(''ol-open-tok-1'', ''Otro'', ''Rol'')', 'enlace no válido', 'enlace abierto de un dueño suspendido deja de aceptar inscripciones');
reset role;
update public.profiles set suspended_at = null where id = 'a1111111-0000-0000-0000-00000000000a';

\echo
\echo 'Todo OK (open_link.sql)'
