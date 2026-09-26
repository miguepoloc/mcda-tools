-- Estados de cuenta: suspender (admin), desactivar (el propio usuario), eliminar (el propio usuario),
-- último acceso y registro de auditoría. Requiere 20240101000014 (sin ella, un usuario podría
-- quitarse solo la suspensión: profiles era escribible por su dueño).
--
-- Tres estados, derivados de dos columnas de `profiles`:
--   · activa      suspended_at IS NULL y paused_at IS NULL
--   · pausada     paused_at    (la pone y la quita el propio usuario; volver a iniciar sesión la quita)
--   · suspendida  suspended_at (solo la pone/quita un admin; el usuario NO puede saltársela)
--
-- Cómo se hace cumplir (defensa en profundidad, de lo más fuerte a lo más cosmético):
--   1. RLS: una política RESTRICTIVE por tabla/bucket con datos del usuario. Las restrictivas se
--      combinan con AND a las permisivas de siempre, así que no hay que tocar las políticas
--      existentes. Corta al instante, aunque el JWT siga vigente (dura ~1 h).
--   2. Funciones SECURITY DEFINER que se saltan RLS (geo_*, y las de token de expertos/público):
--      comprueban el estado por dentro. Los enlaces /e/<token> y /p/<token> se apagan mientras la
--      cuenta del dueño no esté activa; al reactivar, vuelven igual.
--   3. auth.users.banned_until (solo al SUSPENDER): GoTrue rechaza iniciar sesión y renovar el token.
--      Se usa now()+100 años y no 'infinity': GoTrue lo lee desde Go y un 'infinity' puede romperle el parseo.
--   4. middleware.ts: redirige a /login (solo UX; la seguridad es 1–3).

alter table public.profiles add column if not exists paused_at timestamptz;
alter table public.profiles add column if not exists suspended_at timestamptz;

-- Auditoría. Sin FK a auth.users a propósito: el registro sobrevive a la eliminación de la cuenta
-- (al eliminar se borra el correo de sus filas; queda solo el id opaco). Sin políticas: solo lo
-- tocan funciones SECURITY DEFINER (mismo patrón que rate_limit_log / admin_access_log).
create table if not exists public.account_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  user_email text,
  actor_id uuid,
  action text not null check (action in ('suspend', 'reactivate', 'pause', 'resume', 'delete', 'confirm_email')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists account_events_time_idx on public.account_events (created_at desc);
create index if not exists account_events_user_idx on public.account_events (user_id);
alter table public.account_events enable row level security;

-- ───────────────────────── Ayudantes ─────────────────────────

create or replace function public._user_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles
                      where id = p_user and (suspended_at is not null or paused_at is not null))
$$;

create or replace function public.account_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public._user_ok(auth.uid())
$$;

create or replace function public._project_owner_ok(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public._user_ok((select owner_id from public.projects where id = p_project))
$$;

-- ───────────────────────── 1. RLS restrictiva ─────────────────────────

drop policy if exists account_active on public.projects;
create policy account_active on public.projects as restrictive for all to authenticated
  using ((select public.account_ok())) with check ((select public.account_ok()));
drop policy if exists account_active on public.experts;
create policy account_active on public.experts as restrictive for all to authenticated
  using ((select public.account_ok())) with check ((select public.account_ok()));
drop policy if exists account_active on public.judgments;
create policy account_active on public.judgments as restrictive for all to authenticated
  using ((select public.account_ok())) with check ((select public.account_ok()));
drop policy if exists account_active on public.geo_results;
create policy account_active on public.geo_results as restrictive for all to authenticated
  using ((select public.account_ok())) with check ((select public.account_ok()));

-- Capas del geovisor en Storage: solo el bucket con datos de usuario (el catálogo público no).
drop policy if exists account_active_geo_layers on storage.objects;
create policy account_active_geo_layers on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'geo-layers' or (select public.account_ok()))
  with check (bucket_id <> 'geo-layers' or (select public.account_ok()));

-- ───────────────────────── 2. Funciones que se saltan RLS ─────────────────────────
-- Mismas definiciones vigentes (000006/000009/000012) con UNA línea añadida cada una.

create or replace function public.expert_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.experts%rowtype;
  p public.projects%rowtype;
  j jsonb;
begin
  perform public._rate_limit('expert_get:' || p_token, 60, interval '1 minute');
  select * into e from public.experts where invite_token = p_token;
  if not found or not public._project_owner_ok(e.project_id) then return null; end if;
  select * into p from public.projects where id = e.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('sheet', sheet, 'pair_key', pair_key, 'value', value)), '[]'::jsonb)
    into j from public.judgments where expert_id = e.id;
  return jsonb_build_object(
    'expert', jsonb_build_object('name', e.name, 'role_desc', e.role_desc, 'status', e.status),
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives,
                                  'method', coalesce(p.method, 'ahp')),
    'judgments', j);
end $$;

create or replace function public.expert_save(p_token text, p_sheet text, p_pair text, p_value int)
returns void language plpgsql security definer set search_path = public as $$
declare e public.experts%rowtype;
begin
  perform public._rate_limit('expert_save:' || p_token, 240, interval '1 minute');
  select * into e from public.experts where invite_token = p_token;
  if not found or not public._project_owner_ok(e.project_id) then raise exception 'enlace no válido'; end if;
  if e.status = 'submitted' then raise exception 'las respuestas ya fueron enviadas'; end if;
  if p_sheet is null or p_pair is null or length(p_sheet) > 80 or length(p_pair) > 80 then
    raise exception 'datos no válidos';
  end if;
  if p_sheet <> 'crit' and p_sheet not like 'alt:%' then raise exception 'hoja no válida'; end if;
  if p_value is null then
    delete from public.judgments where expert_id = e.id and sheet = p_sheet and pair_key = p_pair;
  else
    if p_value < -8 or p_value > 8 then raise exception 'valor fuera de rango'; end if;
    if (select count(*) from public.judgments where expert_id = e.id) >= 3000 then
      raise exception 'demasiados juicios';
    end if;
    insert into public.judgments (expert_id, sheet, pair_key, value)
    values (e.id, p_sheet, p_pair, p_value)
    on conflict (expert_id, sheet, pair_key) do update set value = excluded.value;
  end if;
  if e.status = 'pending' then
    update public.experts set status = 'in_progress', first_saved_at = coalesce(first_saved_at, now()) where id = e.id;
  end if;
end $$;

create or replace function public.expert_submit(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.experts%rowtype;
begin
  perform public._rate_limit('expert_submit:' || p_token, 10, interval '1 minute');
  select * into e from public.experts where invite_token = p_token;
  if not found or not public._project_owner_ok(e.project_id) then raise exception 'enlace no válido'; end if;
  update public.experts set status = 'submitted', submitted_at = now() where id = e.id;
end $$;

create or replace function public.public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype;
begin
  perform public._rate_limit('public_get:' || p_token, 60, interval '1 minute');
  select * into p from public.projects where public_token = p_token and is_public and public._user_ok(owner_id);
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object('title', p.title, 'objective', p.objective,
                                  'criteria', p.criteria, 'alternatives', p.alternatives,
                                  'method', coalesce(p.method, 'ahp'),
                                  'decision_matrix', p.decision_matrix,
                                  'weighting_method', coalesce(p.weighting_method, 'ahp')),
    'experts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id,
               'label', coalesce(nullif(x.role_desc, ''), 'Experto ' || (x.position + 1))
             ) order by x.position, x.created_at), '[]'::jsonb)
        from public.experts x
       where x.project_id = p.id
         and exists (select 1 from public.judgments j where j.expert_id = x.id)),
    'judgments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'expert_id', j.expert_id, 'sheet', j.sheet, 'pair_key', j.pair_key, 'value', j.value)), '[]'::jsonb)
        from public.judgments j join public.experts x on x.id = j.expert_id
       where x.project_id = p.id));
end $$;

create or replace function public.public_geo_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype; r public.geo_results%rowtype;
begin
  perform public._rate_limit('public_geo_get:' || p_token, 60, interval '1 minute');
  select * into p from public.projects
   where public_token = p_token and is_public and kind = 'spatial' and public._user_ok(owner_id);
  if not found then return null; end if;
  select * into r from public.geo_results where project_id = p.id;
  if not found then
    return jsonb_build_object('status', 'unpublished', 'title', p.title, 'objective', p.objective);
  end if;
  return jsonb_build_object('status', 'ok', 'title', p.title, 'objective', p.objective,
                            'grid_b64', r.grid_b64, 'meta', r.meta, 'updated_at', r.updated_at);
end $$;

create or replace function public.geo_quota() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u record; s jsonb := public._geo_settings();
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if not public._user_ok(auth.uid()) then raise exception 'cuenta no activa'; end if;
  select * into u from public._geo_used(auth.uid());
  return jsonb_build_object('used_bytes', u.bytes, 'quota_bytes', public._geo_quota_bytes(auth.uid()),
                            'layers', u.layers, 'max_layers', (s->>'max_layers')::int, 'max_pixels', (s->>'max_pixels')::int);
end $$;

create or replace function public.geo_check_upload(p_path text, p_bytes bigint) returns void
language plpgsql security definer set search_path = public, storage as $$
declare u record; prev bigint; s jsonb := public._geo_settings(); q bigint;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if not public._user_ok(auth.uid()) then raise exception 'cuenta no activa'; end if;
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

create or replace function public.geo_publish_result(p_project uuid, p_grid_b64 text, p_meta jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.projects%rowtype; max_b int := ((public._geo_settings()->>'public_max_kb')::int) * 1024; ts timestamptz;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if not public._user_ok(auth.uid()) then raise exception 'cuenta no activa'; end if;
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

-- ───────────────────────── Acciones del propio usuario ─────────────────────────

create or replace function public.my_account_status() returns text
language sql stable security definer set search_path = public as $$
  select case when pr.suspended_at is not null then 'suspended'
              when pr.paused_at is not null then 'paused' else 'active' end
    from public.profiles pr where pr.id = auth.uid()
$$;

create or replace function public.pause_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'no autorizado'; end if;
  if public.my_account_status() = 'suspended' then raise exception 'cuenta suspendida'; end if;
  update public.profiles set paused_at = coalesce(paused_at, now()) where id = uid;
  insert into public.account_events (user_id, user_email, actor_id, action)
  values (uid, (select email from auth.users where id = uid), uid, 'pause');
end $$;

-- Se llama tras cada inicio de sesión: quita la pausa. Una suspensión NO se quita aquí.
-- Devuelve 'active' | 'resumed' | 'suspended'.
create or replace function public.resume_my_account() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); st text;
begin
  if uid is null then raise exception 'no autorizado'; end if;
  st := public.my_account_status();
  if st = 'suspended' then return 'suspended'; end if;
  if st = 'paused' then
    update public.profiles set paused_at = null where id = uid;
    insert into public.account_events (user_id, user_email, actor_id, action)
    values (uid, (select email from auth.users where id = uid), uid, 'resume');
    return 'resumed';
  end if;
  return 'active';
end $$;

-- Elimina la cuenta y, por ON DELETE CASCADE, profiles → projects → experts → judgments, geo_results,
-- admin_access_log. Los ARCHIVOS de Storage no se borran desde SQL (borrar filas de storage.objects deja
-- el blob huérfano en el almacenamiento): el cliente los borra por la API ANTES de llamar a esto
-- (AccountActions.tsx); si algo queda, /admin → Mapas los lista como huérfanos.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'no autorizado'; end if;
  perform public._rate_limit('delete_account:' || uid::text, 3, interval '1 hour');
  if public.my_account_status() = 'suspended' then
    raise exception 'Tu cuenta está suspendida y no puede eliminarse mientras dure la suspensión. Escribe al docente.';
  end if;
  if public.is_admin() then raise exception 'Una cuenta admin no se elimina desde aquí.'; end if;
  update public.account_events set user_email = null where user_id = uid;
  insert into public.account_events (user_id, user_email, actor_id, action) values (uid, null, uid, 'delete');
  delete from auth.users where id = uid;
end $$;

-- ───────────────────────── Acciones del admin ─────────────────────────

create or replace function public.admin_set_user_status(p_user uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; r text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  if p_action not in ('suspend', 'reactivate') then raise exception 'acción no válida'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar el estado de tu propia cuenta desde aquí.'; end if;
  select pr.role, u.email into t from public.profiles pr join auth.users u on u.id = pr.id where pr.id = p_user;
  if not found then raise exception 'no existe esa cuenta'; end if;

  if p_action = 'suspend' then
    if t.role = 'admin' then raise exception 'Las cuentas admin no se pueden suspender.'; end if;
    if r is null or char_length(r) < 3 then raise exception 'Indica el motivo (mínimo 3 caracteres): queda en el registro.'; end if;
    if char_length(r) > 500 then raise exception 'El motivo no puede pasar de 500 caracteres.'; end if;
    update public.profiles set suspended_at = coalesce(suspended_at, now()) where id = p_user;
    update auth.users set banned_until = now() + interval '100 years' where id = p_user;
  else
    update public.profiles set suspended_at = null, paused_at = null where id = p_user;
    update auth.users set banned_until = null where id = p_user;
  end if;

  insert into public.account_events (user_id, user_email, actor_id, action, reason)
  values (p_user, t.email, auth.uid(), p_action, r);
  return jsonb_build_object('user_id', p_user, 'estado', case when p_action = 'suspend' then 'suspendida' else 'activa' end);
end $$;

-- Confirma el correo de una cuenta sin que la persona abra el enlace (no le llegó el mensaje, cayó en spam…).
-- Es lo que hace el botón «Confirmar correo» del panel de Authentication de Supabase. Solo tiene sentido si al
-- docente le CONSTA que el correo es de esa persona: confirmarlo a ciegas le regala acceso a quien lo registró.
create or replace function public.admin_confirm_user_email(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  select u.email, u.email_confirmed_at into t from auth.users u where u.id = p_user;
  if not found then raise exception 'no existe esa cuenta'; end if;
  if t.email_confirmed_at is not null then raise exception 'Ese correo ya estaba confirmado.'; end if;
  update auth.users set email_confirmed_at = now() where id = p_user;
  insert into public.account_events (user_id, user_email, actor_id, action)
  values (p_user, t.email, auth.uid(), 'confirm_email');
  return jsonb_build_object('user_id', p_user, 'correo_confirmado', true);
end $$;

-- Elimina la cuenta de OTRA persona (spam, cuenta duplicada, petición de la persona). Misma cascada que
-- delete_my_account(); los archivos de mapas NO se pueden borrar desde SQL, así que quedan como huérfanos y el
-- admin los limpia en /admin → Mapas. A diferencia de la autoeliminación, aquí el correo SE CONSERVA en la
-- auditoría (con el motivo): sin saber a quién eliminó, el registro no sirve para rendir cuentas.
create or replace function public.admin_delete_user(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; r text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  if p_user = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta desde aquí.'; end if;
  select pr.role, u.email into t from public.profiles pr join auth.users u on u.id = pr.id where pr.id = p_user;
  if not found then raise exception 'no existe esa cuenta'; end if;
  if t.role = 'admin' then raise exception 'Las cuentas admin no se pueden eliminar.'; end if;
  if r is null or char_length(r) < 3 then raise exception 'Indica el motivo (mínimo 3 caracteres): queda en el registro.'; end if;
  if char_length(r) > 500 then raise exception 'El motivo no puede pasar de 500 caracteres.'; end if;
  insert into public.account_events (user_id, user_email, actor_id, action, reason)
  values (p_user, t.email, auth.uid(), 'delete', r);
  delete from auth.users where id = p_user;
  return jsonb_build_object('user_id', p_user, 'eliminada', true);
end $$;

-- Reemplaza la versión anterior (solo último acceso): ahora con id, rol, estado y nº de proyectos.
-- `ultimo_acceso` = auth.users.last_sign_in_at: cambia al INICIAR SESIÓN, no al renovarse el token; quien
-- mantiene la sesión abierta días puede verse «viejo» aunque use la plataforma (es último login, no
-- última actividad). null = nunca ha iniciado sesión.
create or replace function public.admin_users_activity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', u.id, 'email', u.email, 'nombre', pr.full_name, 'rol', pr.role,
             'estado', case when pr.suspended_at is not null then 'suspendida'
                            when pr.paused_at is not null then 'pausada' else 'activa' end,
             'correo_confirmado', u.email_confirmed_at is not null,
             'creado', pr.created_at, 'ultimo_acceso', u.last_sign_in_at,
             'suspendida_el', pr.suspended_at, 'pausada_el', pr.paused_at,
             'proyectos', (select count(*) from public.projects p where p.owner_id = u.id)
           ) order by u.last_sign_in_at desc nulls last, pr.created_at desc)
      from auth.users u join public.profiles pr on pr.id = u.id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_account_events(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'no autorizado'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'fecha', e.created_at, 'accion', e.action, 'motivo', e.reason,
             'usuario_email', coalesce(e.user_email, u.email), 'actor_email', a.email,
             'autoservicio', e.actor_id = e.user_id
           ) order by e.created_at desc, e.id desc)
      from (select * from public.account_events order by created_at desc, id desc
             limit greatest(1, least(coalesce(p_limit, 50), 200))) e
      left join auth.users u on u.id = e.user_id
      left join auth.users a on a.id = e.actor_id
  ), '[]'::jsonb);
end $$;

-- ───────────────────────── Privilegios ─────────────────────────
-- En Supabase las funciones nuevas nacen con EXECUTE para anon/authenticated (privilegios por
-- defecto) y `revoke ... from public` no lo quita: se revoca a mano, como en la migración 12.
revoke all on function public._user_ok(uuid), public._project_owner_ok(uuid) from public, anon, authenticated;
revoke all on function public.account_ok(), public.my_account_status(), public.pause_my_account(),
  public.resume_my_account(), public.delete_my_account(),
  public.admin_set_user_status(uuid, text, text), public.admin_confirm_user_email(uuid),
  public.admin_delete_user(uuid, text), public.admin_users_activity(),
  public.admin_account_events(int) from public, anon;
grant execute on function public.account_ok(), public.my_account_status(), public.pause_my_account(),
  public.resume_my_account(), public.delete_my_account(),
  public.admin_set_user_status(uuid, text, text), public.admin_confirm_user_email(uuid),
  public.admin_delete_user(uuid, text), public.admin_users_activity(),
  public.admin_account_events(int) to authenticated;
